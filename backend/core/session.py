import jwt
from fastapi import Request, Response

from core.config import (
    ACCESS_TOKEN_MINUTES,
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    HASH_COOKIE,
    REFRESH_TOKEN_DAYS,
)
from core.crypto import seal, unseal
from core.security import TokenType, create_token, decode_token


def set_session(response: Response, user_id: int) -> None:
    """Gom access token và refresh token vào cookie Hash (mã hóa)."""
    response.set_cookie(
        HASH_COOKIE,
        seal(
            {
                "access_token": create_token(user_id, "access"),
                "refresh_token": create_token(user_id, "refresh"),
            }
        ),
        max_age=REFRESH_TOKEN_DAYS * 24 * 3600,
        path="/",
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
    )


def clear_session(response: Response) -> None:
    response.delete_cookie(HASH_COOKIE, path="/")


def read_user_id(request: Request, token_type: TokenType) -> int | None:
    """Giải mã cookie Hash rồi xác thực token; None nếu thiếu, bị sửa, sai loại hoặc hết hạn."""
    sealed = request.cookies.get(HASH_COOKIE)
    payload = unseal(sealed) if sealed else None
    token = payload.get(f"{token_type}_token") if payload else None
    if not token:
        return None
    try:
        return decode_token(token, token_type)
    except jwt.PyJWTError:
        return None
