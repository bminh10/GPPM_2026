# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import unicodedata


def normalize_role_name(name: str | None) -> str:
    normalized = unicodedata.normalize("NFD", name or "")
    without_marks = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return " ".join(without_marks.casefold().split())


def get_role_key(name: str | None) -> str | None:
    normalized = normalize_role_name(name)
    normalized = normalized.removeprefix("1 ") if normalized.startswith("1 ") else normalized
    normalized = normalized.removeprefix("2 ") if normalized.startswith("2 ") else normalized
    normalized = normalized.removeprefix("3 ") if normalized.startswith("3 ") else normalized
    normalized = normalized.removeprefix("4 ") if normalized.startswith("4 ") else normalized
    if normalized == "1":
        return "super_admin"
    if normalized == "2":
        return "admin"
    if normalized == "3":
        return "technician"
    if normalized == "4":
        return "staff"
    if normalized in {"super admin", "superadmin"}:
        return "super_admin"
    if normalized == "admin":
        return "admin"
    if normalized in {"ky thuat vien", "technician"}:
        return "technician"
    if normalized in {"can bo nhan vien", "user", "staff"}:
        return "staff"
    return None


def can_deactivate_accounts(role_name: str | None) -> bool:
    return get_role_key(role_name) == "super_admin"


def _matches_prefix(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(f"{prefix}/")


def is_request_allowed(role_name: str | None, method: str, path: str) -> bool:
    role = get_role_key(role_name)
    if role is None:
        return False
    if role == "super_admin":
        return True

    method = method.upper()
    if path in {"/auth/me", "/auth/logout", "/me"}:
        return True
    if _matches_prefix(path, "/approvals/changes"):
        if method == "GET":
            return role in {"admin", "staff"}
        return role in {"admin", "super_admin"}
    if role == "admin" and method == "DELETE":
        return False

    if any(_matches_prefix(path, prefix) for prefix in (
        "/dashboard", "/analytics", "/audit-logs", "/users", "/roles", "/user",
    )):
        if role == "technician" and any(
            _matches_prefix(path, prefix) for prefix in ("/dashboard", "/analytics")
        ):
            return method == "GET"
        return role == "admin"

    if any(_matches_prefix(path, prefix) for prefix in (
        "/lighting", "/card-reader", "/card-writer", "/card-attendance",
    )):
        return role in {"admin", "technician"}

    data_prefixes = (
        "/campus", "/faculties", "/majors", "/classes", "/rooms",
        "/subjects", "/semesters", "/time-slots", "/course-registrations",
        "/schedules", "/optimization",
    )
    if any(_matches_prefix(path, prefix) for prefix in data_prefixes):
        if role in {"admin", "staff"}:
            return True
        if role == "technician":
            return method == "GET" and any(
                _matches_prefix(path, prefix)
                for prefix in (
                    "/campus", "/rooms", "/semesters", "/schedules", "/classes", "/majors",
                )
            )
        return False

    return role == "admin"
