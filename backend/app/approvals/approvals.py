from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, aliased

from app.auth.dependencies import get_current_user
from core.permissions import get_role_key
from db.database import ChangeApproval, User, get_db

router = APIRouter(prefix="/approvals/changes", tags=["Change approvals"])


class ChangeApprovalResponse(BaseModel):
    id: str
    status: str
    method: str
    path: str
    payload: dict
    requester_id: int
    requester_name: str | None
    requester_email: str | None
    reviewer_id: int | None
    review_note: str | None
    error: str | None
    created_at: datetime
    reviewed_at: datetime | None


class RejectionRequest(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


def _require_admin(user: User) -> None:
    if get_role_key(user.role.name if user.role else None) not in {
        "admin",
        "super_admin",
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ admin mới được duyệt yêu cầu chỉnh sửa.",
        )


def _serialize(approval: ChangeApproval, requester: User) -> dict:
    return {
        "id": approval.id,
        "status": approval.status,
        "method": approval.method,
        "path": approval.path,
        "payload": approval.payload,
        "requester_id": approval.requester_id,
        "requester_name": requester.user_name,
        "requester_email": requester.email,
        "reviewer_id": approval.reviewer_id,
        "review_note": approval.review_note,
        "error": approval.error,
        "created_at": approval.created_at,
        "reviewed_at": approval.reviewed_at,
    }


@router.get("", response_model=list[ChangeApprovalResponse])
def list_change_approvals(
    approval_status: Literal[
        "pending",
        "processing",
        "approved",
        "rejected",
        "failed",
    ] | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = get_role_key(current_user.role.name if current_user.role else None)
    if role not in {"admin", "super_admin", "staff"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền xem yêu cầu chỉnh sửa.",
        )
    requester = aliased(User)
    query = (
        db.query(ChangeApproval, requester)
        .join(requester, ChangeApproval.requester_id == requester.id)
    )
    if role == "staff":
        query = query.filter(ChangeApproval.requester_id == current_user.id)
    if approval_status is not None:
        query = query.filter(ChangeApproval.status == approval_status)
    stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
    stale_processing = (
        db.query(ChangeApproval)
        .filter(
            ChangeApproval.status == "processing",
            ChangeApproval.reviewed_at < stale_cutoff,
        )
        .all()
    )
    for approval in stale_processing:
        approval.status = "failed"
        approval.error = "Quá trình duyệt bị gián đoạn. Admin cần gửi lại quyết định."
    if stale_processing:
        db.commit()
    rows = query.order_by(ChangeApproval.created_at.desc()).limit(500).all()
    return [_serialize(approval, submitter) for approval, submitter in rows]


def _apply_change(approval: ChangeApproval, request: Request, db: Session, user: User) -> None:
    parts = approval.path.strip("/").split("/")
    if (
        approval.method != "PATCH"
        or len(parts) != 2
        or not parts[1].isdigit()
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Yêu cầu chỉnh sửa không thuộc endpoint được hỗ trợ.",
        )
    record_id = int(parts[1])
    payload = approval.payload

    if parts[0] == "campus":
        from app.campus.campus import CampusUpdate, refactor_campus

        refactor_campus(record_id, CampusUpdate.model_validate(payload), request, db)
    elif parts[0] == "faculties":
        from app.faculty.faculty import FacultyUpdate, update_faculty

        update_faculty(record_id, FacultyUpdate.model_validate(payload), request, db)
    elif parts[0] == "majors":
        from app.majors.majors import MajorUpdate, update_major

        update_major(record_id, MajorUpdate.model_validate(payload), request, db)
    elif parts[0] == "classes":
        from app.classes.classes import ClassUpdate, update_class

        update_class(record_id, ClassUpdate.model_validate(payload), db)
    elif parts[0] == "rooms":
        from app.rooms.rooms import RoomUpdate, update_room

        update_room(record_id, RoomUpdate.model_validate(payload), request, db)
    elif parts[0] == "subjects":
        from app.subjects.subjects import SubjectUpdate, update_subject

        update_subject(record_id, SubjectUpdate.model_validate(payload), db)
    elif parts[0] == "semesters":
        from app.semesters.semesters import SemesterUpdate, update_semester

        update_semester(record_id, SemesterUpdate.model_validate(payload), db)
    elif parts[0] == "time-slots":
        from app.time_slots.time_slots import TimeSlotUpdate, update_time_slot

        update_time_slot(record_id, TimeSlotUpdate.model_validate(payload), db)
    elif parts[0] == "course-registrations":
        from app.registrations.registrations import (
            RegistrationUpdate,
            update_registration,
        )

        update_registration(
            record_id,
            RegistrationUpdate.model_validate(payload),
            db,
        )
    elif parts[0] == "schedules":
        from app.schedules.schedules import ScheduleUpdate, update_schedule

        update_schedule(
            record_id,
            ScheduleUpdate.model_validate(payload),
            user,
            db,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Loại dữ liệu chỉnh sửa không được hỗ trợ.",
        )


def _get_pending_approval(
    approval_id: str,
    db: Session,
) -> ChangeApproval:
    approval = (
        db.query(ChangeApproval)
        .filter(ChangeApproval.id == approval_id)
        .with_for_update()
        .first()
    )
    if approval is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy yêu cầu chỉnh sửa.",
        )
    if approval.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Yêu cầu này đã được xử lý hoặc không còn chờ duyệt.",
        )
    return approval


@router.post("/{approval_id}/approve")
def approve_change(
    approval_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    approval = _get_pending_approval(approval_id, db)
    approval.status = "processing"
    approval.reviewer_id = current_user.id
    approval.reviewed_at = datetime.now(timezone.utc)
    db.commit()

    request.state.role_name = current_user.role.name if current_user.role else None
    request.state.user_id = current_user.id
    try:
        _apply_change(approval, request, db, current_user)
    except HTTPException as exc:
        db.rollback()
        failed_approval = db.get(ChangeApproval, approval_id)
        if failed_approval is not None:
            failed_approval.status = "failed"
            failed_approval.error = str(exc.detail)
            failed_approval.reviewed_at = datetime.now(timezone.utc)
            db.commit()
        raise
    except (ValidationError, SQLAlchemyError, ValueError, TypeError, KeyError) as exc:
        db.rollback()
        failed_approval = db.get(ChangeApproval, approval_id)
        if failed_approval is not None:
            failed_approval.status = "failed"
            failed_approval.error = str(exc)[:1000]
            failed_approval.reviewed_at = datetime.now(timezone.utc)
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Không thể áp dụng yêu cầu chỉnh sửa: " + str(exc),
        ) from exc

    approved = db.get(ChangeApproval, approval_id)
    if approved is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Yêu cầu chỉnh sửa không còn tồn tại.",
        )
    approved.status = "approved"
    approved.reviewer_id = current_user.id
    approved.error = None
    approved.review_note = None
    approved.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": approval_id, "status": "approved"}


@router.post("/{approval_id}/reject")
def reject_change(
    approval_id: str,
    data: RejectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    approval = _get_pending_approval(approval_id, db)
    approval.status = "rejected"
    approval.reviewer_id = current_user.id
    approval.review_note = data.note
    approval.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": approval_id, "status": "rejected"}
