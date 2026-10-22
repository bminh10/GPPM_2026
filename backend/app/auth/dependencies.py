from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from core.config import ADMIN_ROLE_NAMES, DEFAULT_ROLE_NAME
from db.database import Role, User, get_db


def is_admin(user: User) -> bool:
    return user.role is not None and user.role.name.strip().lower() in ADMIN_ROLE_NAMES


def get_or_create_default_role(db: Session) -> Role:
    roles = db.query(Role).all()
    for role in roles:
        if role.name.strip().lower() == DEFAULT_ROLE_NAME.lower():
            return role
    role = Role(name=DEFAULT_ROLE_NAME)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """User_id đã được AuthMiddleware xác thực và gắn vào request.state."""
    user_id = getattr(request.state, "user_id", None)
    user = db.get(User, user_id) if user_id is not None else None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tài khoản không tồn tại")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not is_admin(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền thực hiện thao tác này")
    return user
