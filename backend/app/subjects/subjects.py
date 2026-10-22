from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from db.database import MonHoc, ThoiKhoaBieu, get_db
from utils.commit import commit_db

router = APIRouter(prefix="/subjects", tags=["Subjects"])


class SubjectData(BaseModel):
    code: str
    name: str
    credits: int = Field(default=3, gt=0)


class SubjectUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    credits: int | None = Field(default=None, gt=0)


class SubjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    credits: int


def require_available_code(code: str, db: Session, subject_id: int | None = None) -> None:
    query = db.query(MonHoc).filter(MonHoc.code == code)
    if subject_id is not None:
        query = query.filter(MonHoc.id != subject_id)
    if query.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject code already exists",
        )


@router.get("", response_model=list[SubjectResponse])
def get_subjects(db: Session = Depends(get_db)):
    return db.query(MonHoc).all()


@router.get("/{id}", response_model=SubjectResponse)
def get_subject(id: int, db: Session = Depends(get_db)):
    subject = db.query(MonHoc).filter(MonHoc.id == id).first()
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found",
        )
    return subject


@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
def create_subject(data: SubjectData, db: Session = Depends(get_db)):
    require_available_code(data.code, db)
    subject = MonHoc(**data.model_dump())
    return commit_db(subject, db)


@router.patch("/{id}", response_model=SubjectResponse)
def update_subject(id: int, data: SubjectUpdate, db: Session = Depends(get_db)):
    subject = db.query(MonHoc).filter(MonHoc.id == id).first()
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    if any(
        field in update_data and update_data[field] is None
        for field in ("code", "name", "credits")
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Subject code, name, and credits cannot be null",
        )
    if "code" in update_data and update_data["code"] is not None:
        require_available_code(update_data["code"], db, subject.id)
    for field, value in update_data.items():
        setattr(subject, field, value)

    db.commit()
    db.refresh(subject)
    return subject


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(id: int, db: Session = Depends(get_db)):
    subject = db.query(MonHoc).filter(MonHoc.id == id).first()
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found",
        )
    if (
        db.query(ThoiKhoaBieu)
        .filter(ThoiKhoaBieu.mon_hoc_id == id)
        .first()
        is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a subject that still has schedules",
        )
    db.delete(subject)
    db.commit()
