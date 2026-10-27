# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
from fastapi import Request


_ENTITY_LABELS = {
    "campus": "Cơ sở",
    "room": "Phòng học",
    "faculty": "Khoa",
    "major": "Ngành",
}

_FIELD_LABELS = {
    "name": "Tên",
    "address": "Địa chỉ",
    "building": "Tòa nhà",
    "capacity": "Sức chứa",
    "is_thuc_hanh": "Phòng thực hành",
    "campus_id": "Cơ sở",
    "khoa_id": "Khoa",
}


def record_update_details(
    request: Request,
    entity: str,
    record: object,
    record_id: int,
    update_data: dict[str, object],
) -> None:
    changes = {
        field: {
            "label": _FIELD_LABELS.get(field, field),
            "before": getattr(record, field),
            "after": value,
        }
        for field, value in update_data.items()
        if getattr(record, field) != value
    }
    if not changes:
        return

    request.state.audit_details = {
        "entity": _ENTITY_LABELS[entity],
        "record_id": record_id,
        "record_name": str(update_data.get("name", getattr(record, "name", record_id))),
        "changes": changes,
    }
