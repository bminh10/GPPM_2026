from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from db.database import CaHoc, PhongHoc, ThoiKhoaBieu, get_db

router = APIRouter(prefix="/rooms", tags=["Phòng học"])


@router.get("/available")
def get_available_rooms(
    start_time: time,
    end_time: time,
    on_date: date = Query(alias="date"),
    capacity: int = Query(default=0, ge=0),
    campus_id: int | None = None,
    db: Session = Depends(get_db),
):
    if start_time >= end_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Giờ bắt đầu phải trước giờ kết thúc.",
        )

    schedules = (
        db.query(ThoiKhoaBieu)
        .filter(
            ThoiKhoaBieu.start_date <= on_date,
            ThoiKhoaBieu.end_date >= on_date,
            ThoiKhoaBieu.day_of_week == on_date.isoweekday() + 1,
        )
        .all()
    )
    occupied_room_ids = set()
    for schedule in schedules:
        slot = db.query(CaHoc).filter(CaHoc.id == schedule.ca_hoc_id).first()
        if slot and slot.start_time < end_time and start_time < slot.end_time:
            occupied_room_ids.add(schedule.phong_hoc_id)

    query = db.query(PhongHoc).filter(PhongHoc.capacity >= capacity)
    if campus_id is not None:
        query = query.filter(PhongHoc.campus_id == campus_id)
    rooms = query.order_by(PhongHoc.name).all()
    return [
        {
            "id": room.id,
            "name": room.name,
            "building": room.building,
            "capacity": room.capacity,
            "campus_id": room.campus_id,
        }
        for room in rooms
        if room.id not in occupied_room_ids
    ]
