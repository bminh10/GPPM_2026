from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from core.redis_cache import invalidate_cache_prefix
from app.subjects.subject_rules import determine_is_thuc_hanh
from db.database import (
    CaHoc,
    DangKyMonHoc,
    HocKy,
    Khoa,
    Lop,
    MonHoc,
    Nganh,
    PhongHoc,
    ThoiKhoaBieu,
    get_db,
)
from utils.commit import commit_db

router = APIRouter(prefix="/schedules", tags=["Thời khóa biểu"])


class ScheduleData(BaseModel):
    dang_ky_mon_hoc_id: int
    phong_hoc_id: int
    hoc_ky_id: int
    ca_hoc_id: int
    day_of_week: int = Field(ge=2, le=8, description="Thứ trong tuần: 2 (thứ Hai) đến 8 (Chủ nhật)")
    start_date: date
    end_date: date
    teacher_name: str | None = None
    is_thuc_hanh: bool = False


class ScheduleUpdate(BaseModel):
    dang_ky_mon_hoc_id: int | None = None
    phong_hoc_id: int | None = None
    hoc_ky_id: int | None = None
    ca_hoc_id: int | None = None
    day_of_week: int | None = Field(default=None, ge=2, le=8)
    start_date: date | None = None
    end_date: date | None = None
    teacher_name: str | None = None
    is_thuc_hanh: bool | None = None


class ScheduleResponse(BaseModel):
    id: int
    dang_ky_mon_hoc_id: int
    lop_id: int
    mon_hoc_id: int
    phong_hoc_id: int
    hoc_ky_id: int
    ca_hoc_id: int
    day_of_week: int
    start_date: date
    end_date: date
    teacher_name: str | None
    is_thuc_hanh: bool

    model_config = {"from_attributes": True}


class RoomStatusResponse(BaseModel):
    model_config = {"from_attributes": True}

    room_id: int
    room_name: str
    campus_id: int
    room_building: str | None
    room_capacity: int
    class_name: str
    subject_name: str
    registered_students: int
    teacher_name: str | None
    start_time: time
    end_time: time


def _check_schedule_dates(start_date: date, end_date: date) -> None:
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
        )


def _validate_references(db: Session, values: dict) -> None:
    refs = (
        ("dang_ky_mon_hoc_id", DangKyMonHoc, "đăng ký môn học"),
        ("phong_hoc_id", PhongHoc, "phòng học"),
        ("hoc_ky_id", HocKy, "học kỳ"),
        ("ca_hoc_id", CaHoc, "ca học"),
    )
    for field, model, label in refs:
        if db.query(model.id).filter(model.id == values[field]).first() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy {label} (id={values[field]}).",
            )
    time_slot = db.query(CaHoc).filter(CaHoc.id == values["ca_hoc_id"]).first()
    if time_slot.start_time >= time_slot.end_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ca học có khung giờ không hợp lệ.",
        )
    room = db.query(PhongHoc).filter(PhongHoc.id == values["phong_hoc_id"]).first()
    if room.is_thuc_hanh != values.get("is_thuc_hanh", False):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Loại phòng phải khớp với loại buổi học: lý thuyết dùng phòng thường, "
                "thực hành dùng phòng thực hành."
            ),
        )
    registration = (
        db.query(DangKyMonHoc)
        .filter(DangKyMonHoc.id == values["dang_ky_mon_hoc_id"])
        .first()
    )
    subject = (
        db.query(MonHoc)
        .filter(MonHoc.id == registration.mon_id)
        .first()
    )
    if values.get("is_thuc_hanh", False) and not (
        subject.is_thuc_hanh or determine_is_thuc_hanh(subject.code)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Môn học chưa được cấu hình có buổi thực hành.",
        )
    if registration.hoc_ky_id is None or registration.hoc_ky_id != values["hoc_ky_id"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Học kỳ của lịch học phải trùng với học kỳ của đăng ký môn học.",
        )


def find_conflicts(
    db: Session,
    values: dict,
    exclude_id: int | None = None,
) -> list[dict]:
    slot = db.query(CaHoc).filter(CaHoc.id == values["ca_hoc_id"]).first()
    registration = (
        db.query(DangKyMonHoc)
        .filter(DangKyMonHoc.id == values["dang_ky_mon_hoc_id"])
        .first()
    )
    candidates = (
        db.query(ThoiKhoaBieu)
        .filter(
            ThoiKhoaBieu.day_of_week == values["day_of_week"],
            ThoiKhoaBieu.start_date <= values["end_date"],
            ThoiKhoaBieu.end_date >= values["start_date"],
        )
    )
    if exclude_id is not None:
        candidates = candidates.filter(ThoiKhoaBieu.id != exclude_id)

    conflicts = []
    for existing in candidates.all():
        existing_slot = db.query(CaHoc).filter(CaHoc.id == existing.ca_hoc_id).first()
        if (
            existing_slot is None
            or slot is None
            or slot.start_time >= existing_slot.end_time
            or existing_slot.start_time >= slot.end_time
        ):
            continue

        conflict_types = []
        if existing.phong_hoc_id == values["phong_hoc_id"]:
            conflict_types.append("room")
        if registration is not None and existing.lop_id == registration.lop_id:
            conflict_types.append("class")
        if conflict_types:
            conflicts.append(
                {
                    "schedule_id": existing.id,
                    "conflict_types": conflict_types,
                    "room_id": existing.phong_hoc_id,
                    "class_id": existing.lop_id,
                    "time_slot_id": existing.ca_hoc_id,
                }
            )
    return conflicts


def _validated_data(db: Session, data: ScheduleData | dict) -> dict:
    values = data.model_dump() if isinstance(data, ScheduleData) else data
    _check_schedule_dates(values["start_date"], values["end_date"])
    _validate_references(db, values)
    return values


@router.get("", response_model=list[ScheduleResponse])
def get_schedules(
    semester_id: int | None = None,
    room_id: int | None = None,
    class_id: int | None = None,
    khoa_id: int | None = None,
    nganh_id: int | None = None,
    day_of_week: int | None = Query(default=None, ge=2, le=8),
    on_date: date | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
):
    query = db.query(ThoiKhoaBieu)
    if semester_id is not None:
        query = query.filter(ThoiKhoaBieu.hoc_ky_id == semester_id)
    if room_id is not None:
        query = query.filter(ThoiKhoaBieu.phong_hoc_id == room_id)
    if class_id is not None or khoa_id is not None or nganh_id is not None:
        query = query.join(DangKyMonHoc).join(Lop)
    if class_id is not None:
        query = query.filter(DangKyMonHoc.lop_id == class_id)
    if khoa_id is not None or nganh_id is not None:
        query = query.join(Nganh, Lop.nganh_id == Nganh.id)
    if nganh_id is not None:
        query = query.filter(Nganh.id == nganh_id)
    if khoa_id is not None:
        query = query.join(Khoa, Nganh.khoa_id == Khoa.id).filter(Khoa.id == khoa_id)
    if day_of_week is not None:
        query = query.filter(ThoiKhoaBieu.day_of_week == day_of_week)
    if on_date is not None:
        query = query.filter(
            ThoiKhoaBieu.start_date <= on_date,
            ThoiKhoaBieu.end_date >= on_date,
            ThoiKhoaBieu.day_of_week == on_date.isoweekday() + 1,
        )
    return query.order_by(ThoiKhoaBieu.day_of_week, ThoiKhoaBieu.ca_hoc_id).all()


@router.get("/room-status", response_model=list[RoomStatusResponse])
def get_room_status(
    campus_id: int | None = None,
    on_date: date = Query(alias="date"),
    semester_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(
            PhongHoc.id.label("room_id"),
            PhongHoc.name.label("room_name"),
            PhongHoc.campus_id.label("campus_id"),
            PhongHoc.building.label("room_building"),
            func.coalesce(PhongHoc.capacity, 0).label("room_capacity"),
            Lop.name.label("class_name"),
            MonHoc.name.label("subject_name"),
            DangKyMonHoc.so_luong.label("registered_students"),
            ThoiKhoaBieu.teacher_name.label("teacher_name"),
            CaHoc.start_time.label("start_time"),
            CaHoc.end_time.label("end_time"),
        )
        .join(ThoiKhoaBieu, ThoiKhoaBieu.phong_hoc_id == PhongHoc.id)
        .join(
            DangKyMonHoc,
            DangKyMonHoc.id == ThoiKhoaBieu.dang_ky_mon_hoc_id,
        )
        .join(Lop, Lop.id == DangKyMonHoc.lop_id)
        .join(MonHoc, MonHoc.id == DangKyMonHoc.mon_id)
        .join(CaHoc, CaHoc.id == ThoiKhoaBieu.ca_hoc_id)
        .filter(
            ThoiKhoaBieu.start_date <= on_date,
            ThoiKhoaBieu.end_date >= on_date,
            ThoiKhoaBieu.day_of_week == on_date.isoweekday() + 1,
        )
    )
    if campus_id is not None:
        query = query.filter(PhongHoc.campus_id == campus_id)
    if semester_id is not None:
        query = query.filter(ThoiKhoaBieu.hoc_ky_id == semester_id)
    return query.order_by(CaHoc.start_time, PhongHoc.name, Lop.name).all()


@router.get("/{schedule_id}", response_model=ScheduleResponse)
def get_schedule(schedule_id: int, db: Session = Depends(get_db)):
    schedule = db.query(ThoiKhoaBieu).filter(ThoiKhoaBieu.id == schedule_id).first()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lịch học.")
    return schedule


@router.post("", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
def create_schedule(
    data: ScheduleData,
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    values = _validated_data(db, data)
    conflicts = find_conflicts(db, values)
    if conflicts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Lịch học bị trùng.", "conflicts": conflicts},
        )
    schedule = commit_db(ThoiKhoaBieu(**values), db)
    invalidate_cache_prefix("analytics:")
    return schedule


@router.patch("/{schedule_id}", response_model=ScheduleResponse)
def update_schedule(
    schedule_id: int,
    data: ScheduleUpdate,
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schedule = db.query(ThoiKhoaBieu).filter(ThoiKhoaBieu.id == schedule_id).first()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lịch học.")
    values = {
        "dang_ky_mon_hoc_id": schedule.dang_ky_mon_hoc_id,
        "phong_hoc_id": schedule.phong_hoc_id,
        "hoc_ky_id": schedule.hoc_ky_id,
        "ca_hoc_id": schedule.ca_hoc_id,
        "day_of_week": schedule.day_of_week,
        "start_date": schedule.start_date,
        "end_date": schedule.end_date,
        "teacher_name": schedule.teacher_name,
        "is_thuc_hanh": schedule.is_thuc_hanh,
    }
    values.update(data.model_dump(exclude_unset=True))
    required_fields = {
        "dang_ky_mon_hoc_id",
        "phong_hoc_id",
        "hoc_ky_id",
        "ca_hoc_id",
        "day_of_week",
        "start_date",
        "end_date",
    }
    if any(values[field] is None for field in required_fields):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Các trường bắt buộc của lịch học không được để trống.",
        )
    values = _validated_data(db, values)
    conflicts = find_conflicts(db, values, exclude_id=schedule_id)
    if conflicts:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Lịch học bị trùng.", "conflicts": conflicts},
        )
    for field, value in values.items():
        setattr(schedule, field, value)
    db.commit()
    db.refresh(schedule)
    invalidate_cache_prefix("analytics:")
    return schedule


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: int,
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    schedule = db.query(ThoiKhoaBieu).filter(ThoiKhoaBieu.id == schedule_id).first()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy lịch học.")
    db.delete(schedule)
    db.commit()
    invalidate_cache_prefix("analytics:")


@router.post("/check-conflicts")
def check_schedule_conflicts(
    data: ScheduleData,
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    values = _validated_data(db, data)
    conflicts = find_conflicts(db, values)
    return {"has_conflict": bool(conflicts), "conflicts": conflicts}
