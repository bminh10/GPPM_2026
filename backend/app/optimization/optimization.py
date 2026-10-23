from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.schedules.schedules import find_conflicts
from db.database import CaHoc, DangKyMonHoc, HocKy, PhongHoc, get_db

router = APIRouter(prefix="/optimization", tags=["Tối ưu"])


class RoomAllocationRequest(BaseModel):
    dang_ky_mon_hoc_id: int
    hoc_ky_id: int
    ca_hoc_id: int
    day_of_week: int = Field(ge=2, le=8)
    start_date: date
    end_date: date
    is_thuc_hanh: bool = False


@router.post("/room-allocation")
def suggest_room_allocation(
    data: RoomAllocationRequest,
    db: Session = Depends(get_db),
):
    if data.start_date > data.end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
        )
    references = (
        (DangKyMonHoc, data.dang_ky_mon_hoc_id, "đăng ký môn học"),
        (HocKy, data.hoc_ky_id, "học kỳ"),
        (CaHoc, data.ca_hoc_id, "ca học"),
    )
    for model, identifier, label in references:
        if db.query(model.id).filter(model.id == identifier).first() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy {label} (id={identifier}).",
            )

    registration = (
        db.query(DangKyMonHoc)
        .filter(DangKyMonHoc.id == data.dang_ky_mon_hoc_id)
        .first()
    )
    if registration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đăng ký môn học (id={data.dang_ky_mon_hoc_id}).",
        )
    class_size = registration.so_luong
    candidate_query = db.query(PhongHoc).filter(PhongHoc.capacity >= class_size)
    if data.is_thuc_hanh:
        candidate_query = candidate_query.filter(PhongHoc.is_thuc_hanh.is_(True))
    candidates = candidate_query.order_by(PhongHoc.capacity, PhongHoc.name).all()
    available_rooms = []
    for room in candidates:
        values = {
            **data.model_dump(),
            "phong_hoc_id": room.id,
        }
        if not find_conflicts(db, values):
            available_rooms.append(
                {
                    "id": room.id,
                    "name": room.name,
                    "building": room.building,
                    "capacity": room.capacity,
                    "is_thuc_hanh": room.is_thuc_hanh,
                    "campus_id": room.campus_id,
                }
            )
    return {
        "registration_id": registration.id,
        "class_id": registration.lop_id,
        "required_capacity": class_size,
        "suggested_room": available_rooms[0] if available_rooms else None,
        "available_rooms": available_rooms,
    }
