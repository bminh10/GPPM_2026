from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from core.config import PUBLIC_PATHS
from core.session import read_user_id


class AuthMiddleware(BaseHTTPMiddleware):
    """Chặn mọi request tới route không public nếu thiếu access token hợp lệ trong cookie Hash."""

    async def dispatch(self, request: Request, call_next):
        # Preflight CORS không mang cookie
        device_endpoint = request.method == "POST" and request.url.path in {
            "/iot/device/connect", "/iot/device/sync",
        }
        if request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS or device_endpoint:
            return await call_next(request)

        user_id = read_user_id(request, "access")
        if user_id is None:
            return JSONResponse(
                status_code=401,
                content={"detail": "Phiên đăng nhập không hợp lệ hoặc đã hết hạn"},
            )
        request.state.user_id = user_id
        return await call_next(request)
