# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import (
    CaHoc,
    Campus,
    HocKy,
    Lop,
    MonHoc,
    PhongHoc,
    ThoiKhoaBieu,
    User,
    get_db,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    return {
        "campuses": db.query(Campus).count(),
        "rooms": db.query(PhongHoc).count(),
        "classes": db.query(Lop).count(),
        "courses": db.query(MonHoc).count(),
        "semesters": db.query(HocKy).count(),
        "time_slots": db.query(CaHoc).count(),
        "schedules": db.query(ThoiKhoaBieu).count(),
        "users": db.query(User).count(),
    }
