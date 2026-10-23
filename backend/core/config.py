import os

from dotenv import load_dotenv

load_dotenv()


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"LỖI: Chưa cấu hình {name} trong file .env hoặc hệ thống!")
    return value


JWT_SECRET = _require("JWT_SECRET")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "15"))
REFRESH_TOKEN_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "7"))

# Khóa AES-256 (base64, 32 byte) dùng mã hóa cookie Hash
HASH_KEY = _require("HASH_KEY")

# Một cookie duy nhất chứa cả access token và refresh token đã mã hóa
HASH_COOKIE = "Hash"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

DEFAULT_ROLE_NAME = "User"
ADMIN_ROLE_NAMES = {"admin", "super admin"}

# Các đường dẫn không cần đăng nhập
PUBLIC_PATHS = {
    "/",
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/auth/register",
    "/auth/login",
    "/auth/refresh",
    "/auth/logout",
}
