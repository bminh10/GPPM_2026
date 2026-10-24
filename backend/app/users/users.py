from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.schemas import AdminUserCreateRequest, UserResponse, UserUpdateRequest
from core.security import hash_password
from db.database import Role, User, get_db

router = APIRouter(prefix="/user", tags=["User"], dependencies=[Depends(get_current_user)])


def _get_user_or_404(user_id: int, db: Session) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tài khoản không tồn tại!")
    return user


@router.get("/all", response_model=list[UserResponse])
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.user_name, User.email).all()
    return [UserResponse.from_user(user) for user in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    data: AdminUserCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == data.email).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email đã được sử dụng")
    if db.query(User).filter(User.user_name == data.user_name).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Tên tài khoản đã tồn tại")

    role = db.get(Role, data.role_id)
    if role is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vai trò không tồn tại")

    user = User(
        user_name=data.user_name,
        email=data.email,
        pass_word=hash_password(data.pass_word),
        role_id=role.id,
        is_active=data.is_active,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Email hoặc tên tài khoản đã được sử dụng",
        ) from exc
    return UserResponse.from_user(user)


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_user_or_404(user_id, db)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)

    if changes.get("is_active") is False and user.id == current_user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Không thể tự vô hiệu hóa tài khoản đang đăng nhập.",
        )
    if "email" in changes and db.query(User).filter(User.email == changes["email"], User.id != user_id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email đã được sử dụng")
    if "role_id" in changes:
        new_role = db.get(Role, changes["role_id"])
        if not new_role:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vai trò không tồn tại")
    if "pass_word" in changes:
        changes["pass_word"] = hash_password(changes["pass_word"])

    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return UserResponse.from_user(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.id == user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không thể tự xóa tài khoản của chính mình")
    db.delete(_get_user_or_404(user_id, db))
    db.commit()
