from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.schedules.schedules import find_conflicts
from db.database import CaHoc, HocKy, Lop, MonHoc, PhongHoc, get_db

router = APIRouter(prefix="/optimization", tags=["Tối ưu"])


class RoomAllocationRequest(BaseModel):
    lop_id: int
    mon_hoc_id: int
    hoc_ky_id: int
    ca_hoc_id: int
    day_of_week: int = Field(ge=2, le=8)
    start_date: date
    end_date: date


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
        (Lop, data.lop_id, "lớp"),
        (MonHoc, data.mon_hoc_id, "môn học"),
        (HocKy, data.hoc_ky_id, "học kỳ"),
        (CaHoc, data.ca_hoc_id, "ca học"),
    )
    for model, identifier, label in references:
        if db.query(model.id).filter(model.id == identifier).first() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy {label} (id={identifier}).",
            )

    class_size = db.query(Lop.si_so).filter(Lop.id == data.lop_id).scalar() or 0
    candidates = (
        db.query(PhongHoc)
        .filter(PhongHoc.capacity >= class_size)
        .order_by(PhongHoc.capacity, PhongHoc.name)
        .all()
    )
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
                    "campus_id": room.campus_id,
                }
            )
    return {
        "class_id": data.lop_id,
        "required_capacity": class_size,
        "suggested_room": available_rooms[0] if available_rooms else None,
        "available_rooms": available_rooms,
    }
