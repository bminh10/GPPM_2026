from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from db.database import CaHoc, DangKyMonHoc, Lop, PhongHoc, ThoiKhoaBieu, get_db

router = APIRouter(prefix="/analytics", tags=["Phân tích"])


def _date_range(
    db: Session,
    start_date: date | None,
    end_date: date | None,
    lop_id: int | None = None,
    nganh_id: int | None = None,
    hoc_ky_id: int | None = None,
    campus_id: int | None = None,
    building: str | None = None,
) -> tuple[date, date]:
    schedules = _schedule_query(
        db, lop_id, nganh_id, hoc_ky_id, campus_id, building
    ).with_entities(
        ThoiKhoaBieu.start_date,
        ThoiKhoaBieu.end_date,
    ).all()
    if start_date is None:
        start_date = min((row.start_date for row in schedules), default=date.today())
    if end_date is None:
        end_date = max((row.end_date for row in schedules), default=start_date)
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
        )
    return start_date, end_date


def _schedule_query(
    db: Session,
    lop_id: int | None,
    nganh_id: int | None,
    hoc_ky_id: int | None,
    campus_id: int | None = None,
    building: str | None = None,
):
    query = db.query(ThoiKhoaBieu)
    if lop_id is not None or nganh_id is not None:
        query = query.join(DangKyMonHoc)
    if lop_id is not None:
        query = query.filter(DangKyMonHoc.lop_id == lop_id)
    if nganh_id is not None:
        query = query.join(Lop, DangKyMonHoc.lop_id == Lop.id).filter(
            Lop.nganh_id == nganh_id
        )
    if hoc_ky_id is not None:
        query = query.filter(ThoiKhoaBieu.hoc_ky_id == hoc_ky_id)
    if campus_id is not None or building is not None:
        query = query.join(PhongHoc)
    if campus_id is not None:
        query = query.filter(PhongHoc.campus_id == campus_id)
    if building is not None:
        query = query.filter(PhongHoc.building == building)
    return query


def _count_weekdays(start_date: date, end_date: date, day_of_week: int) -> int:
    total_days = (end_date - start_date).days + 1
    full_weeks, remaining_days = divmod(total_days, 7)
    target_weekday = (day_of_week - 2) % 7
    first_weekday = start_date.weekday()
    extra_days = sum(
        (first_weekday + offset) % 7 == target_weekday
        for offset in range(remaining_days)
    )
    return full_weeks + extra_days


def _utilization(
    db: Session,
    start_date: date,
    end_date: date,
    lop_id: int | None = None,
    nganh_id: int | None = None,
    hoc_ky_id: int | None = None,
    campus_id: int | None = None,
    building: str | None = None,
) -> list[dict]:
    slots_count = db.query(CaHoc).count()
    room_query = db.query(PhongHoc)
    if campus_id is not None:
        room_query = room_query.filter(PhongHoc.campus_id == campus_id)
    if building is not None:
        room_query = room_query.filter(PhongHoc.building == building)
    rooms = room_query.order_by(PhongHoc.name).all()
    schedules = (
        _schedule_query(db, lop_id, nganh_id, hoc_ky_id, campus_id, building)
        .filter(
            ThoiKhoaBieu.start_date <= end_date,
            ThoiKhoaBieu.end_date >= start_date,
        )
        .all()
    )
    occupied_by_room: dict[int, int] = {room.id: 0 for room in rooms}
    for schedule in schedules:
        overlap_start = max(start_date, schedule.start_date)
        overlap_end = min(end_date, schedule.end_date)
        occupied_by_room[schedule.phong_hoc_id] = (
            occupied_by_room.get(schedule.phong_hoc_id, 0)
            + _count_weekdays(overlap_start, overlap_end, schedule.day_of_week)
        )

    result = []
    for room in rooms:
        occupied = occupied_by_room[room.id]
        possible = (
            sum(_count_weekdays(start_date, end_date, day) for day in range(2, 9))
            * slots_count
        )
        result.append(
            {
                "room_id": room.id,
                "room_name": room.name,
                "occupied_slots": occupied,
                "available_slots": max(0, possible - occupied),
                "utilization_rate": round(occupied / possible, 4) if possible else 0,
            }
        )
    return result


@router.get("/room-utilization")
def get_room_utilization(
    start_date: date | None = None,
    end_date: date | None = None,
    lop_id: int | None = None,
    nganh_id: int | None = None,
    hoc_ky_id: int | None = None,
    campus_id: int | None = None,
    building: str | None = None,
    db: Session = Depends(get_db),
):
    start_date, end_date = _date_range(
        db, start_date, end_date, lop_id, nganh_id, hoc_ky_id, campus_id, building
    )
    return {
        "start_date": start_date,
        "end_date": end_date,
        "rooms": _utilization(
            db, start_date, end_date, lop_id, nganh_id, hoc_ky_id, campus_id, building
        ),
    }


@router.get("/room-demand")
def get_room_demand(
    start_date: date | None = None,
    end_date: date | None = None,
    lop_id: int | None = None,
    nganh_id: int | None = None,
    hoc_ky_id: int | None = None,
    campus_id: int | None = None,
    building: str | None = None,
    db: Session = Depends(get_db),
):
    start_date, end_date = _date_range(
        db, start_date, end_date, lop_id, nganh_id, hoc_ky_id, campus_id, building
    )
    schedules = (
        _schedule_query(db, lop_id, nganh_id, hoc_ky_id, campus_id, building)
        .filter(
            ThoiKhoaBieu.start_date <= end_date,
            ThoiKhoaBieu.end_date >= start_date,
        )
        .all()
    )
    slots = {slot.id: slot for slot in db.query(CaHoc).all()}
    demand: dict[tuple[int, int], int] = {}
    for schedule in schedules:
        overlap_start = max(start_date, schedule.start_date)
        overlap_end = min(end_date, schedule.end_date)
        key = (schedule.day_of_week, schedule.ca_hoc_id)
        demand[key] = demand.get(key, 0) + _count_weekdays(
            overlap_start,
            overlap_end,
            schedule.day_of_week,
        )
    return {
        "start_date": start_date,
        "end_date": end_date,
        "demand": [
            {
                "day_of_week": day,
                "time_slot_id": slot_id,
                "time_slot_name": slots[slot_id].name,
                "schedule_count": count,
            }
            for (day, slot_id), count in sorted(
                demand.items(),
                key=lambda item: (item[0][0], slots[item[0][1]].start_time),
            )
            if slot_id in slots
        ],
    }


@router.get("/underutilized-rooms")
def get_underutilized_rooms(
    threshold: float = Query(default=0.2, ge=0, le=1),
    start_date: date | None = None,
    end_date: date | None = None,
    lop_id: int | None = None,
    nganh_id: int | None = None,
    hoc_ky_id: int | None = None,
    campus_id: int | None = None,
    building: str | None = None,
    db: Session = Depends(get_db),
):
    start_date, end_date = _date_range(
        db, start_date, end_date, lop_id, nganh_id, hoc_ky_id, campus_id, building
    )
    rooms = _utilization(
        db, start_date, end_date, lop_id, nganh_id, hoc_ky_id, campus_id, building
    )
    return {
        "start_date": start_date,
        "end_date": end_date,
        "threshold": threshold,
        "rooms": [room for room in rooms if room["utilization_rate"] < threshold],
    }
