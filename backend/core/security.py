# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
from datetime import datetime, timedelta, timezone
from typing import Literal

import bcrypt
import jwt

from core.config import ACCESS_TOKEN_MINUTES, JWT_ALGORITHM, JWT_SECRET, REFRESH_TOKEN_DAYS

TokenType = Literal["access", "refresh"]

_BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")
_TOKEN_LIFETIME = {
    "access": timedelta(minutes=ACCESS_TOKEN_MINUTES),
    "refresh": timedelta(days=REFRESH_TOKEN_DAYS),
}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def is_hashed(value: str) -> bool:
    return value.startswith(_BCRYPT_PREFIXES)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user_id: int, token_type: TokenType) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": token_type,
        "iat": now,
        "exp": now + _TOKEN_LIFETIME[token_type],
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str, token_type: TokenType) -> int:
    """Trả về user_id; ném jwt.PyJWTError nếu token sai, hết hạn hoặc sai loại."""
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    if payload.get("type") != token_type:
        raise jwt.InvalidTokenError("Sai loại token")
    return int(payload["sub"])
