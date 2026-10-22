from datetime import time

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.database import CaHoc, get_db
from utils.commit import commit_db

router = APIRouter(prefix="/time-slots", tags=["Ca học"])


class TimeSlotData(BaseModel):
    name: str
    start_time: time
    end_time: time


class TimeSlotUpdate(BaseModel):
    name: str | None = None
    start_time: time | None = None
    end_time: time | None = None


class TimeSlotResponse(BaseModel):
    id: int
    name: str
    start_time: time
    end_time: time

    model_config = {"from_attributes": True}


def _validate_times(start_time: time, end_time: time) -> None:
    if start_time >= end_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Giờ bắt đầu phải trước giờ kết thúc.",
        )


@router.get("", response_model=list[TimeSlotResponse])
def get_time_slots(db: Session = Depends(get_db)):
    return db.query(CaHoc).order_by(CaHoc.start_time).all()


@router.get("/{slot_id}", response_model=TimeSlotResponse)
def get_time_slot(slot_id: int, db: Session = Depends(get_db)):
    slot = db.query(CaHoc).filter(CaHoc.id == slot_id).first()
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy ca học.")
    return slot


@router.post("", response_model=TimeSlotResponse, status_code=status.HTTP_201_CREATED)
def create_time_slot(data: TimeSlotData, db: Session = Depends(get_db)):
    _validate_times(data.start_time, data.end_time)
    return commit_db(CaHoc(**data.model_dump()), db)


@router.patch("/{slot_id}", response_model=TimeSlotResponse)
def update_time_slot(
    slot_id: int,
    data: TimeSlotUpdate,
    db: Session = Depends(get_db),
):
    slot = db.query(CaHoc).filter(CaHoc.id == slot_id).first()
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy ca học.")

    updates = data.model_dump(exclude_unset=True)
    if any(value is None for value in updates.values()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Các trường ca học không được để trống.",
        )
    start_time = updates.get("start_time", slot.start_time)
    end_time = updates.get("end_time", slot.end_time)
    _validate_times(start_time, end_time)
    for field, value in updates.items():
        setattr(slot, field, value)
    db.commit()
    db.refresh(slot)
    return slot


@router.delete("/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_time_slot(slot_id: int, db: Session = Depends(get_db)):
    slot = db.query(CaHoc).filter(CaHoc.id == slot_id).first()
    if slot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy ca học.")
    db.delete(slot)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể xóa ca học đang được sử dụng trong thời khóa biểu.",
        ) from exc
