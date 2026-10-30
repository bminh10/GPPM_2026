# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import json
from uuid import uuid4

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from core.config import PUBLIC_PATHS
from core.permissions import get_role_key, is_request_allowed
from core.session import read_user_id
from db.database import ChangeApproval, SessionLocal, User


_REVIEWABLE_UPDATE_PREFIXES = {
    "/campus",
    "/faculties",
    "/majors",
    "/classes",
    "/rooms",
    "/subjects",
    "/semesters",
    "/time-slots",
    "/course-registrations",
    "/schedules",
}


def _is_reviewable_update(method: str, path: str) -> bool:
    if method != "PATCH":
        return False
    segments = path.strip("/").split("/")
    return (
        len(segments) == 2
        and f"/{segments[0]}" in _REVIEWABLE_UPDATE_PREFIXES
        and segments[1].isdigit()
    )


async def _queue_change_approval(request: Request, user_id: int) -> JSONResponse:
    try:
        payload = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse(
            status_code=400,
            content={"detail": "Nội dung yêu cầu chỉnh sửa không hợp lệ."},
        )
    if not isinstance(payload, dict):
        return JSONResponse(
            status_code=422,
            content={"detail": "Dữ liệu chỉnh sửa phải là một object."},
        )

    approval_id = str(uuid4())
    with SessionLocal() as db:
        approval = ChangeApproval(
            id=approval_id,
            requester_id=user_id,
            method=request.method,
            path=request.url.path,
            payload=payload,
            status="pending",
        )
        db.add(approval)
        db.commit()
    return JSONResponse(
        status_code=202,
        content={
            "approval_request_id": approval_id,
            "status": "pending",
            "message": "Yêu cầu chỉnh sửa đã được gửi và đang chờ admin duyệt.",
        },
    )


class AuthMiddleware(BaseHTTPMiddleware):
    """Chặn mọi request tới route không public nếu thiếu access token hợp lệ trong cookie Hash."""

    async def dispatch(self, request: Request, call_next):
        # Preflight CORS không mang cookie
        device_endpoint = request.method == "POST" and request.url.path in {
            "/iot/device/connect", "/iot/device/sync",
            "/iot/card-reader/scans",
            "/iot/card-writer/poll", "/iot/card-writer/present",
            "/iot/card-writer/claim", "/iot/card-writer/result",
        }
        if request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS or device_endpoint:
            return await call_next(request)

        user_id = read_user_id(request, "access")
        if user_id is None:
            return JSONResponse(
                status_code=401,
                content={"detail": "Phiên đăng nhập không hợp lệ hoặc đã hết hạn"},
            )
        db = SessionLocal()
        try:
            user = db.get(User, user_id)
            if user is None or not user.is_active:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Tài khoản không tồn tại hoặc đã bị vô hiệu hóa"},
                )
            role_name = user.role.name if user.role is not None else None
        finally:
            db.close()
        if not is_request_allowed(role_name, request.method, request.url.path):
            return JSONResponse(
                status_code=403,
                content={"detail": "Bạn không có quyền thực hiện thao tác này"},
            )
        request.state.user_id = user_id
        request.state.role_name = role_name
        if (
            get_role_key(role_name) == "staff"
            and _is_reviewable_update(request.method, request.url.path)
        ):
            return await _queue_change_approval(request, user_id)
        return await call_next(request)
