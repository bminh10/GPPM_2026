from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import AuditLog, Role, User, get_db

router = APIRouter(tags=["Tài khoản và hệ thống"])


class UserResponse(BaseModel):
    id: int
    user_name: str | None
    email: str | None
    role_id: int | None

    model_config = {"from_attributes": True}


class RoleResponse(BaseModel):
    id: int
    name: str | None

    model_config = {"from_attributes": True}


class AuditLogResponse(BaseModel):
    id: int
    method: str
    path: str
    status_code: int
    details: dict[str, object] | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/me", response_model=UserResponse)
def get_current_user():
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Chưa xác thực tài khoản. Backend hiện chưa cấu hình cơ chế xác thực phiên.",
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.get("/users", response_model=list[UserResponse])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.user_name, User.email).all()


@router.get("/roles", response_model=list[RoleResponse])
def get_roles(db: Session = Depends(get_db)):
    return db.query(Role).order_by(Role.name).all()


@router.get("/audit-logs", response_model=list[AuditLogResponse])
def get_audit_logs(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    path_prefix: str | None = Query(default=None, min_length=1, max_length=100),
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)
    if path_prefix:
        query = query.filter(AuditLog.path.startswith(path_prefix))
    return query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
