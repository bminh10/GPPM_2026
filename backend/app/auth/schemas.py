import re

from pydantic import BaseModel, field_validator

from db.database import User

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _validate_email(value: str) -> str:
    value = value.strip().lower()
    if not _EMAIL_PATTERN.match(value):
        raise ValueError("Email không hợp lệ")
    return value


def _validate_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Mật khẩu phải có ít nhất 8 ký tự")
    if len(value.encode()) > 72:
        raise ValueError("Mật khẩu tối đa 72 byte")
    return value


class RegisterRequest(BaseModel):
    user_name: str
    email: str
    pass_word: str

    _check_email = field_validator("email")(_validate_email)
    _check_password = field_validator("pass_word")(_validate_password)

    @field_validator("user_name")
    @classmethod
    def _check_user_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tên không được để trống")
        return value


class AdminUserCreateRequest(BaseModel):
    user_name: str
    email: str
    pass_word: str
    role_id: int
    is_active: bool = True

    _check_email = field_validator("email")(_validate_email)
    _check_password = field_validator("pass_word")(_validate_password)

    @field_validator("user_name")
    @classmethod
    def _check_user_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tên không được để trống")
        return value


class LoginRequest(BaseModel):
    email: str
    pass_word: str

    _check_email = field_validator("email")(_validate_email)


class UserResponse(BaseModel):
    id: int
    user_name: str
    email: str
    role: str | None
    is_active: bool

    @classmethod
    def from_user(cls, user: User) -> "UserResponse":
        return cls(
            id=user.id,
            user_name=user.user_name,
            email=user.email,
            role=user.role.name.strip() if user.role else None,
            is_active=user.is_active,
        )


class UserUpdateRequest(BaseModel):
    user_name: str | None = None
    email: str | None = None
    pass_word: str | None = None
    role_id: int | None = None
    is_active: bool | None = None

    @field_validator("email")
    @classmethod
    def _check_email(cls, value: str | None) -> str | None:
        return None if value is None else _validate_email(value)

    @field_validator("pass_word")
    @classmethod
    def _check_password(cls, value: str | None) -> str | None:
        return None if value is None else _validate_password(value)
