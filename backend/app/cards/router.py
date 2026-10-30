# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
"""Read-only card scans and class attendance delivery. No student verification."""
import json
import hashlib
import hmac
import os
import re
import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import Float, Integer, String, Text
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.auth.dependencies import require_infrastructure_user
from app.cards.attendance import AttendanceStation, record_scan, station as attendance_station
from db.database import Base, engine, get_db


class CardScan(Base):
    __tablename__ = "card_reader_scan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reader_id: Mapped[str] = mapped_column(String(80), unique=True)
    received_at: Mapped[float] = mapped_column(Float)
    payload: Mapped[str] = mapped_column(Text)


class ScanReport(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    uid: str = Field(pattern=r"^(?:[0-9A-F]{2}:){3}(?:[0-9A-F]{2}:){0,6}[0-9A-F]{2}$")
    card_type: str = Field(min_length=1, max_length=80)
    read_status: Literal["ok", "uid_only", "read_error"]
    block: int = Field(ge=1, le=255)
    data_hex: str | None = Field(default=None, pattern=r"^[0-9A-F]{32}$")
    detail: str = Field(max_length=240)

    @model_validator(mode="after")
    def validate_data(self):
        if len(self.uid.split(":")) not in (4, 7, 10):
            raise ValueError("UID must contain 4, 7 or 10 bytes")
        if (self.read_status == "ok") != (self.data_hex is not None):
            raise ValueError("Successful block reads require exactly 16 bytes; failed reads must not include data")
        return self


router = APIRouter(tags=["Card reader"])


def read_mssv(report: ScanReport) -> str | None:
    data = bytes.fromhex(report.data_hex) if report.data_hex else b""
    if report.read_status == "ok" and report.block == 4 and len(data) == 16:
        encoded = data.rstrip(b"\x00")
        if encoded and re.fullmatch(rb"[A-Za-z0-9._-]{1,16}", encoded):
            return encoded.decode("ascii")
    return None


def authenticate_reader(
    x_reader_id: Annotated[str, Header(min_length=1, max_length=80)],
    x_reader_key: Annotated[str, Header(min_length=32, max_length=256)],
) -> str:
    key = os.getenv("CARD_READER_KEY", "")
    reader_id = os.getenv("CARD_READER_ID", "card-reader-01")
    if not key:
        raise HTTPException(503, "Card reader is not configured")
    if x_reader_id != reader_id or not hmac.compare_digest(
        hashlib.sha256(x_reader_key.encode()).digest(), hashlib.sha256(key.encode()).digest(),
    ):
        raise HTTPException(401, "Invalid reader credential")
    return reader_id


@router.post("/iot/card-reader/scans")
def receive_scan(
    report: ScanReport, reader_id: str = Depends(authenticate_reader), db: Session = Depends(get_db),
):
    # Lock the single reader row to serialize updates from this diagnostic station.
    scan = db.query(CardScan).filter_by(reader_id=reader_id).with_for_update().first()
    if scan is None:
        raise HTTPException(503, "Initialize the card reader table/station before sending scans")
    scan.received_at = time.time()
    scan.payload = report.model_dump_json()
    row = attendance_station(db, reader_id)
    attendance = record_scan(db, row, read_mssv(report))
    row.last_result = json.dumps(attendance, ensure_ascii=False)
    db.commit()
    return {"received": True, "read_status": report.read_status, "mssv": read_mssv(report), "attendance": attendance}


@router.get("/card-reader/latest", dependencies=[Depends(require_infrastructure_user)])
def latest_scan(db: Session = Depends(get_db)):
    reader_id = os.getenv("CARD_READER_ID", "card-reader-01")
    scan = db.query(CardScan).filter_by(reader_id=reader_id).with_for_update().first()
    if scan is None or not scan.payload:
        return {"reader_id": reader_id, "scan": None}
    report = ScanReport.model_validate_json(scan.payload)
    data = bytes.fromhex(report.data_hex) if report.data_hex else b""
    text = "".join(chr(byte) if 32 <= byte <= 126 else "." for byte in data)
    row = db.get(AttendanceStation, reader_id)
    return {
        "reader_id": reader_id,
        "scan": {
            **report.model_dump(), "received_at": scan.received_at, "data_text": text,
            "mssv": read_mssv(report), "student_verified": False,
            "attendance": json.loads(row.last_result) if row and row.last_result else None,
        },
    }


def initialize() -> None:
    from db.database import SessionLocal

    reader_id = os.getenv("CARD_READER_ID", "card-reader-01")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", reader_id):
        raise ValueError("Invalid CARD_READER_ID")
    CardScan.__table__.create(engine, checkfirst=True)
    from app.cards.attendance import initialize as initialize_attendance
    initialize_attendance()
    with SessionLocal.begin() as db:
        if db.query(CardScan).filter_by(reader_id=reader_id).first() is None:
            db.add(CardScan(reader_id=reader_id, received_at=0, payload=""))
    print("Card reader station initialized; no student or attendance data changed.")


if __name__ == "__main__":
    initialize()
