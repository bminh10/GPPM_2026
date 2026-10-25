"""Campus-wide card scan sessions; no student registry or identity verification."""
import os
import time
import uuid
from datetime import date as Date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.auth.dependencies import require_infrastructure_user
from db.database import Base, Campus, User, engine, get_db


class AttendanceStation(Base):
    __tablename__ = "card_attendance_station"
    reader_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    session_id: Mapped[str | None] = mapped_column(String(36))
    last_result: Mapped[str | None] = mapped_column(Text)


class AttendanceSession(Base):
    __tablename__ = "card_attendance_session"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    reader_id: Mapped[str] = mapped_column(String(80), index=True)
    campus_id: Mapped[int] = mapped_column(Integer, index=True)
    campus_name: Mapped[str] = mapped_column(String(255))
    admin_id: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[float] = mapped_column(Float)
    ends_at: Mapped[float | None] = mapped_column(Float)
    closed_at: Mapped[float | None] = mapped_column(Float)
    closed_by: Mapped[int | None] = mapped_column(Integer)


class AttendanceLog(Base):
    __tablename__ = "card_attendance_log"
    __table_args__ = (UniqueConstraint("session_id", "mssv"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("card_attendance_session.id"), index=True)
    mssv: Mapped[str] = mapped_column(String(10))
    reader_id: Mapped[str] = mapped_column(String(80))
    received_at: Mapped[float] = mapped_column(Float)


class StartSession(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    campus_id: int = Field(gt=0)
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)


router = APIRouter(prefix="/card-attendance", tags=["Card attendance"])
VN_TZ = timezone(timedelta(hours=7))


def station(db: Session, reader_id: str) -> AttendanceStation:
    row = db.query(AttendanceStation).filter_by(reader_id=reader_id).with_for_update().first()
    if row is None:
        raise HTTPException(503, "Initialize attendance first: python -m app.cards.attendance")
    return row


def current_session(db: Session, row: AttendanceStation, now: float) -> AttendanceSession | None:
    session = db.get(AttendanceSession, row.session_id) if row.session_id else None
    if session and session.closed_at is None and session.ends_at is not None and now >= session.ends_at:
        session.closed_at = session.ends_at
    return session


def session_view(session: AttendanceSession):
    return {
        "id": session.id, "campus_id": session.campus_id, "campus_name": session.campus_name,
        "reader_id": session.reader_id, "admin_id": session.admin_id,
        "started_at": session.started_at, "ends_at": session.ends_at,
        "closed_at": session.closed_at, "closed_by": session.closed_by,
        "is_open": session.closed_at is None,
    }


def record_scan(db: Session, row: AttendanceStation, mssv: str | None):
    now = time.time()
    session = current_session(db, row, now)
    result = {
        "status": "outside", "message": "Đã quá giờ điểm danh",
        "session_id": session.id if session else None,
        "campus_name": session.campus_name if session else None,
        "mssv": mssv, "received_at": now,
    }
    if session is None or session.closed_at is not None:
        return result
    if mssv is None:
        return {**result, "status": "invalid", "message": "Không đọc được MSSV đúng định dạng"}
    existing = db.query(AttendanceLog).filter_by(session_id=session.id, mssv=mssv).first()
    if existing:
        return {**result, "status": "duplicate", "message": "Đã điểm danh"}
    db.add(AttendanceLog(session_id=session.id, mssv=mssv, reader_id=row.reader_id, received_at=now))
    return {**result, "status": "recorded", "message": "Điểm danh thành công"}


@router.get("", dependencies=[Depends(require_infrastructure_user)])
def status(
    campus_id: int | None = Query(default=None, gt=0),
    day: Date | None = Query(default=None, alias="date", description="YYYY-MM-DD, giờ Việt Nam"),
    db: Session = Depends(get_db),
):
    row = station(db, os.getenv("CARD_READER_ID", "card-reader-01"))
    if campus_id is not None and db.get(Campus, campus_id) is None:
        raise HTTPException(404, "Cơ sở không tồn tại")
    now = time.time()
    reader_session = current_session(db, row, now)
    query = db.query(AttendanceSession).filter_by(reader_id=row.reader_id)
    if campus_id is not None:
        query = query.filter_by(campus_id=campus_id)
    ordering = (AttendanceSession.started_at.desc(), AttendanceSession.id.desc())
    latest = query.order_by(*ordering).first()
    listing = query
    if day is not None:
        day_start = datetime.combine(day, datetime.min.time(), tzinfo=VN_TZ).timestamp()
        listing = query.filter(
            AttendanceSession.started_at >= day_start, AttendanceSession.started_at < day_start + 86400,
        )
    sessions = listing.order_by(*ordering).limit(50 if day is None else None).all()
    current = latest if campus_id is not None else reader_session
    response = {
        "reader_id": row.reader_id, "server_time": now,
        "current": session_view(current) if current else None,
        "reader_session": session_view(reader_session) if reader_session and reader_session.closed_at is None else None,
        "sessions": [session_view(item) for item in sessions],
    }
    db.commit()
    return response


@router.post("/sessions")
def start(data: StartSession, admin: User = Depends(require_infrastructure_user), db: Session = Depends(get_db)):
    row = station(db, os.getenv("CARD_READER_ID", "card-reader-01"))
    campus = db.query(Campus).filter_by(id=data.campus_id).with_for_update().first()
    if campus is None:
        raise HTTPException(404, "Cơ sở không tồn tại")
    now = time.time()
    current = current_session(db, row, now)
    if current and current.closed_at is None:
        raise HTTPException(
            409,
            f"Bộ đọc {row.reader_id} đang được {current.campus_name} sử dụng. "
            "Vui lòng đợi phiên đó kết thúc trước khi bắt đầu.",
        )
    session = AttendanceSession(
        id=str(uuid.uuid4()), reader_id=row.reader_id, campus_id=campus.id, campus_name=campus.name,
        admin_id=admin.id, started_at=now,
        ends_at=now + data.duration_minutes * 60 if data.duration_minutes is not None else None,
    )
    db.add(session)
    row.session_id = session.id
    db.flush()
    response = session_view(session)
    db.commit()
    return response


@router.post("/sessions/{session_id}/close")
def close(session_id: str, admin: User = Depends(require_infrastructure_user), db: Session = Depends(get_db)):
    row = station(db, os.getenv("CARD_READER_ID", "card-reader-01"))
    now = time.time()
    current = current_session(db, row, now)
    if not current or current.id != session_id:
        raise HTTPException(409, "Phiên đã thay đổi, vui lòng tải lại.")
    if current.closed_at is None:
        current.closed_at, current.closed_by = now, admin.id
    response = session_view(current)
    db.commit()
    return response


@router.get("/sessions/{session_id}/logs", dependencies=[Depends(require_infrastructure_user)])
def logs(
    session_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=1000),
    mssv: str | None = Query(default=None, pattern=r"^\d{1,10}$", description="Tìm theo một phần MSSV"),
    db: Session = Depends(get_db),
):
    session = db.get(AttendanceSession, session_id)
    if session is None or session.reader_id != os.getenv("CARD_READER_ID", "card-reader-01"):
        raise HTTPException(404, "Không tìm thấy phiên điểm danh")
    query = db.query(AttendanceLog).filter_by(session_id=session.id)
    session_total = query.count()
    if mssv:
        query = query.filter(AttendanceLog.mssv.contains(mssv, autoescape=True))
    count = query.count()
    rows = query.order_by(AttendanceLog.received_at.desc(), AttendanceLog.id.desc()).offset(offset).limit(limit).all()
    return {"total": count, "session_total": session_total, "items": [
        {"id": row.id, "mssv": row.mssv, "reader_id": row.reader_id, "received_at": row.received_at}
        for row in rows
    ]}


def initialize() -> None:
    from db.database import SessionLocal
    AttendanceStation.__table__.create(engine, checkfirst=True)
    AttendanceSession.__table__.create(engine, checkfirst=True)
    AttendanceLog.__table__.create(engine, checkfirst=True)
    with SessionLocal.begin() as db:
        reader_id = os.getenv("CARD_READER_ID", "card-reader-01")
        if db.get(AttendanceStation, reader_id) is None:
            db.add(AttendanceStation(reader_id=reader_id))
    print("Attendance tables and reader binding initialized. No student records or sessions created.")


if __name__ == "__main__":
    initialize()
