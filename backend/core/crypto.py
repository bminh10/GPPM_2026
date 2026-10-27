# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import base64
import json
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from core.config import HASH_KEY

_NONCE_SIZE = 12
_aesgcm = AESGCM(base64.urlsafe_b64decode(HASH_KEY))


def seal(data: dict) -> str:
    """Mã hóa AES-256-GCM. IV (nonce) ngẫu nhiên mỗi lần, đặt đầu chuỗi; bí mật nằm ở khóa HASH_KEY."""
    nonce = os.urandom(_NONCE_SIZE)
    ciphertext = _aesgcm.encrypt(nonce, json.dumps(data).encode(), None)
    return base64.urlsafe_b64encode(nonce + ciphertext).decode()


def unseal(value: str) -> dict | None:
    """Giải mã; trả None nếu bị sửa đổi hoặc sai khóa (GCM tự xác thực toàn vẹn)."""
    try:
        raw = base64.urlsafe_b64decode(value)
        return json.loads(_aesgcm.decrypt(raw[:_NONCE_SIZE], raw[_NONCE_SIZE:], None))
    except (InvalidTag, ValueError):
        return None
