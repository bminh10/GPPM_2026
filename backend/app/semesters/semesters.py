from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.database import HocKy, get_db
from utils.commit import commit_db

router = APIRouter(prefix="/semesters", tags=["Học kỳ"])


class SemesterData(BaseModel):
    name: str
    start_date: date
    end_date: date


class SemesterUpdate(BaseModel):
    name: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class SemesterResponse(BaseModel):
    id: int
    name: str
    start_date: date
    end_date: date

    model_config = {"from_attributes": True}


def _validate_dates(start_date: date, end_date: date) -> None:
    if start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
        )


@router.get("", response_model=list[SemesterResponse])
def get_all_semesters(db: Session = Depends(get_db)):
    return db.query(HocKy).order_by(HocKy.start_date.desc()).all()


@router.get("/{semester_id}", response_model=SemesterResponse)
def get_semester(semester_id: int, db: Session = Depends(get_db)):
    semester = db.query(HocKy).filter(HocKy.id == semester_id).first()
    if semester is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy học kỳ.")
    return semester


@router.post("", response_model=SemesterResponse, status_code=status.HTTP_201_CREATED)
def create_semester(data: SemesterData, db: Session = Depends(get_db)):
    _validate_dates(data.start_date, data.end_date)
    return commit_db(HocKy(**data.model_dump()), db)


@router.patch("/{semester_id}", response_model=SemesterResponse)
def update_semester(
    semester_id: int,
    data: SemesterUpdate,
    db: Session = Depends(get_db),
):
    semester = db.query(HocKy).filter(HocKy.id == semester_id).first()
    if semester is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy học kỳ.")

    updates = data.model_dump(exclude_unset=True)
    if any(value is None for value in updates.values()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Các trường học kỳ không được để trống.",
        )
    start_date = updates.get("start_date", semester.start_date)
    end_date = updates.get("end_date", semester.end_date)
    _validate_dates(start_date, end_date)
    for field, value in updates.items():
        setattr(semester, field, value)
    db.commit()
    db.refresh(semester)
    return semester


@router.delete("/{semester_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_semester(semester_id: int, db: Session = Depends(get_db)):
    semester = db.query(HocKy).filter(HocKy.id == semester_id).first()
    if semester is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy học kỳ.")
    db.delete(semester)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể xóa học kỳ đang được sử dụng trong thời khóa biểu.",
        ) from exc
