from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_admin
from app.auth.schemas import UserResponse, UserUpdateRequest
from core.security import hash_password
from db.database import Role, User, get_db

# Quản lý người dùng: chỉ admin
router = APIRouter(prefix="/user", tags=["User"], dependencies=[Depends(require_admin)])


def _get_user_or_404(user_id: int, db: Session) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tài khoản không tồn tại!")
    return user


@router.get("/all", response_model=list[UserResponse])
def get_all_users(db: Session = Depends(get_db)):
    return [UserResponse.from_user(u) for u in db.query(User).order_by(User.id).all()]


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, data: UserUpdateRequest, db: Session = Depends(get_db)):
    user = _get_user_or_404(user_id, db)
    changes = data.model_dump(exclude_unset=True, exclude_none=True)

    if "email" in changes and db.query(User).filter(User.email == changes["email"], User.id != user_id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email đã được sử dụng")
    if "role_id" in changes and not db.get(Role, changes["role_id"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Vai trò không tồn tại")
    if "pass_word" in changes:
        changes["pass_word"] = hash_password(changes["pass_word"])

    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return UserResponse.from_user(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if admin.id == user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Không thể tự xóa tài khoản của chính mình")
    db.delete(_get_user_or_404(user_id, db))
    db.commit()
