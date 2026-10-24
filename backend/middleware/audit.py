from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from db.database import AuditLog, SessionLocal

# Các POST chỉ đọc/kiểm tra hoặc thuộc luồng xác thực nên không ghi log
_IGNORED_POST_PATHS = {
    "/schedules/check-conflicts",
    "/optimization/room-allocation",
    "/auth/login",
    "/auth/refresh",
    "/auth/logout",
    "/iot/device/connect",
    "/iot/device/sync",
}


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if self._is_mutation(request):
            with SessionLocal() as db:
                db.add(
                    AuditLog(
                        method=request.method,
                        path=request.url.path,
                        status_code=response.status_code,
                    )
                )
                db.commit()
        return response

    @staticmethod
    def _is_mutation(request: Request) -> bool:
        if request.method in {"PATCH", "PUT", "DELETE"}:
            return True
        return request.method == "POST" and request.url.path not in _IGNORED_POST_PATHS
