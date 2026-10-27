# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_or_create_default_role
from app.auth.schemas import LoginRequest, RegisterRequest, UserResponse
from core.security import hash_password, is_hashed, verify_password
from core.session import clear_session, read_user_id, set_session
from db.database import User, get_db
from utils.commit import commit_db

router = APIRouter(prefix="/auth", tags=["Auth"])


def _password_matches(user: User, password: str, db: Session) -> bool:
    """Kiểm tra mật khẩu; tự nâng cấp tài khoản cũ đang lưu plain text sang bcrypt."""
    stored = user.pass_word or ""
    if is_hashed(stored):
        return verify_password(password, stored)
    if not hmac.compare_digest(stored.encode(), password.encode()):
        return False
    user.pass_word = hash_password(password)
    db.commit()
    return True


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email đã được sử dụng")
    

    # Vai trò luôn do server quyết định, không nhận từ client
    user = commit_db(
        User(
            user_name=data.user_name,
            email=data.email,
            pass_word=hash_password(data.pass_word),
            role_id=get_or_create_default_role(db).id,
        ),
        db,
    )
    set_session(response, user.id)
    return UserResponse.from_user(user)


@router.post("/login", response_model=UserResponse)
def login(data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email hoặc mật khẩu không đúng")
    if not user.is_active:
        raise HTTPException(status.HTTP_423_LOCKED, "Tài khoản bị vô hiệu hóa!")

    # Cùng một thông báo cho cả hai trường hợp để không lộ email nào đã tồn tại
    if not _password_matches(user, data.pass_word, db):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email hoặc mật khẩu không đúng")

    set_session(response, user.id)
    return UserResponse.from_user(user)


@router.post("/refresh", response_model=UserResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    user_id = read_user_id(request, "refresh")
    user = db.get(User, user_id) if user_id is not None else None
    if not user or not user.is_active:
        clear_session(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token không hợp lệ hoặc đã hết hạn")
    set_session(response, user.id)
    return UserResponse.from_user(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    clear_session(response)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return UserResponse.from_user(user)
