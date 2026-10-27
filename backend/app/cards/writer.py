# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
"""Admin-authorized, UID-bound single-use card writes."""
import hashlib
import hmac
import os
import re
import time
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.auth.dependencies import require_infrastructure_user
from db.database import Base, User, engine, get_db


class WriterStation(Base):
    __tablename__ = "card_writer_station"
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    uid: Mapped[str | None] = mapped_column(String(32))
    seen_at: Mapped[float] = mapped_column(Float, default=0)
    last_seen: Mapped[float] = mapped_column(Float, default=0)
    card_type: Mapped[str] = mapped_column(String(80), default="")
    job_id: Mapped[str | None] = mapped_column(String(36))


class WriteJob(Base):
    __tablename__ = "card_write_job"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    writer_id: Mapped[str] = mapped_column(String(80), index=True)
    admin_id: Mapped[int] = mapped_column(Integer)
    uid: Mapped[str] = mapped_column(String(32))
    mssv: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[float] = mapped_column(Float)
    claimed_at: Mapped[float | None] = mapped_column(Float)
    state: Mapped[str] = mapped_column(String(24), default="pending")
    detail: Mapped[str] = mapped_column(String(240), default="")


class StrictModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class CardIdentity(StrictModel):
    uid: str = Field(pattern=r"^[0-9A-F]{2}(?::[0-9A-F]{2}){3,9}$")
    card_type: Literal["MIFARE Mini, 320 bytes", "MIFARE 1KB", "MIFARE 4KB"]

    @model_validator(mode="after")
    def valid_uid(self):
        if len(self.uid.split(":")) not in (4, 7, 10):
            raise ValueError("UID must contain 4, 7 or 10 bytes")
        return self


class CreateWrite(StrictModel):
    uid: str = Field(min_length=11, max_length=29)
    mssv: str = Field(pattern=r"^245101[0-9]{4}$")
    confirm_owned_card: Literal[True]


class WriteResult(StrictModel):
    job_id: str = Field(min_length=36, max_length=36)
    uid: str = Field(min_length=11, max_length=29)
    success: bool
    data_hex: str | None = Field(default=None, pattern=r"^[0-9A-F]{32}$")
    detail: str = Field(min_length=1, max_length=240)


class CloseWrite(StrictModel):
    acknowledge_uncertain: bool = False


router = APIRouter(tags=["Card writer"])


def writer_auth(
    x_writer_id: Annotated[str, Header(min_length=1, max_length=80)],
    x_writer_key: Annotated[str, Header(min_length=32, max_length=256)],
) -> str:
    key = os.getenv("CARD_WRITER_KEY", "")
    if not key:
        raise HTTPException(503, "Card writer is not configured")
    if x_writer_id != os.getenv("CARD_WRITER_ID", "card-writer-01") or not hmac.compare_digest(
        hashlib.sha256(key.encode()).digest(), hashlib.sha256(x_writer_key.encode()).digest(),
    ):
        raise HTTPException(401, "Invalid writer credential")
    return x_writer_id


def station(db: Session, writer_id: str) -> WriterStation:
    row = db.query(WriterStation).filter_by(id=writer_id).with_for_update().first()
    if row is None:
        raise HTTPException(503, "Initialize writer station first")
    return row


def current_job(db: Session, row: WriterStation) -> WriteJob | None:
    job = db.get(WriteJob, row.job_id) if row.job_id else None
    if job and job.state == "pending" and time.time() - job.created_at > 120:
        job.state = "expired"
        job.detail = "Authorization expired without a write."
    return job


def job_view(job: WriteJob | None):
    return None if job is None else {
        "id": job.id, "uid": job.uid, "mssv": job.mssv, "state": job.state,
        "detail": job.detail, "created_at": job.created_at,
    }


@router.get("/card-writer", dependencies=[Depends(require_infrastructure_user)])
def writer_status(db: Session = Depends(get_db)):
    row = station(db, os.getenv("CARD_WRITER_ID", "card-writer-01"))
    job = current_job(db, row)
    response = {
        "writer_id": row.id, "uid": row.uid, "card_type": row.card_type,
        "seen_at": row.seen_at, "online": time.time() - row.last_seen < 15,
        "fresh_card": row.uid is not None and time.time() - row.seen_at < 60,
        "job": job_view(job),
    }
    db.commit()
    return response


@router.post("/card-writer/jobs")
def create_write(data: CreateWrite, admin: User = Depends(require_infrastructure_user), db: Session = Depends(get_db)):
    row = station(db, os.getenv("CARD_WRITER_ID", "card-writer-01"))
    job = current_job(db, row)
    if job and job.state in ("pending", "writing"):
        raise HTTPException(409, "Another write is pending or has an unconfirmed result")
    if row.uid != data.uid or time.time() - row.seen_at > 60:
        raise HTTPException(409, "Present the owned blank card again before authorizing")
    job = WriteJob(
        id=str(uuid.uuid4()), writer_id=row.id, admin_id=admin.id, uid=data.uid,
        mssv=data.mssv, created_at=time.time(), state="pending", detail="",
    )
    db.add(job)
    row.job_id = job.id
    db.commit()
    return job_view(job)


@router.post("/card-writer/jobs/{job_id}/close")
def close_write(job_id: str, data: CloseWrite, admin: User = Depends(require_infrastructure_user), db: Session = Depends(get_db)):
    row = station(db, os.getenv("CARD_WRITER_ID", "card-writer-01"))
    job = current_job(db, row)
    if not job or job.id != job_id:
        raise HTTPException(409, "Job changed; refresh")
    if job.state == "writing":
        if not data.acknowledge_uncertain or job.claimed_at is None or time.time() - job.claimed_at < 120:
            raise HTTPException(409, "After 120 seconds, stop/reboot writer and acknowledge uncertain card contents before closing.")
        job.state = "unknown"
        job.detail = f"Admin {admin.id} acknowledged unknown physical result; card requires inspection"
    if job.state == "pending":
        job.state = "cancelled"
        job.detail = f"Cancelled by admin {admin.id} before claim"
    db.commit()
    return job_view(job)


@router.post("/iot/card-writer/poll")
def poll_writer(writer_id: str = Depends(writer_auth), db: Session = Depends(get_db)):
    row = station(db, writer_id)
    row.last_seen = time.time()
    job = current_job(db, row)
    response = {"pending_uid": job.uid if job and job.state == "pending" else None}
    db.commit()
    return response


@router.post("/iot/card-writer/present")
def present_card(data: CardIdentity, writer_id: str = Depends(writer_auth), db: Session = Depends(get_db)):
    row = station(db, writer_id)
    row.uid, row.card_type, row.seen_at = data.uid, data.card_type, time.time()
    row.last_seen = row.seen_at
    db.commit()
    return {"received": True}


@router.post("/iot/card-writer/claim")
def claim_write(data: CardIdentity, writer_id: str = Depends(writer_auth), db: Session = Depends(get_db)):
    row = station(db, writer_id)
    job = current_job(db, row)
    if not job or job.state != "pending" or job.uid != data.uid:
        db.commit()
        raise HTTPException(409, "No matching unexpired write authorization")
    job.state = "writing"
    job.claimed_at = time.time()
    job.detail = "Claimed once; physical write result not yet confirmed"
    response = {"job_id": job.id, "uid": job.uid, "mssv": job.mssv, "block": 4}
    db.commit()
    return response


@router.post("/iot/card-writer/result")
def write_result(data: WriteResult, writer_id: str = Depends(writer_auth), db: Session = Depends(get_db)):
    row = station(db, writer_id)
    job = current_job(db, row)
    if not job or job.id != data.job_id or job.uid != data.uid:
        raise HTTPException(409, "Write job/UID mismatch")
    expected = (job.mssv.encode("ascii") + bytes(6)).hex().upper()
    if data.success and data.data_hex != expected:
        raise HTTPException(422, "Read-back bytes do not match authorized MSSV")
    target = "succeeded" if data.success else "failed"
    if job.state == target:
        return {"received": True}
    if job.state != "writing":
        raise HTTPException(409, "Job is not awaiting a result")
    job.state, job.detail = target, data.detail
    db.commit()
    return {"received": True}


def initialize():
    from db.database import SessionLocal
    writer_id = os.getenv("CARD_WRITER_ID", "card-writer-01")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", writer_id):
        raise ValueError("Invalid CARD_WRITER_ID")
    WriterStation.__table__.create(engine, checkfirst=True)
    WriteJob.__table__.create(engine, checkfirst=True)
    with SessionLocal.begin() as db:
        if db.get(WriterStation, writer_id) is None:
            db.add(WriterStation(id=writer_id, seen_at=0, last_seen=0, card_type=""))
    print("Writer station initialized. No cards or student tables modified.")


if __name__ == "__main__":
    initialize()
