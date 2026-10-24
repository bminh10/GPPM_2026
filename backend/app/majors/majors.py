from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from db.database import Khoa, Lop, Nganh, get_db
from utils.commit import commit_db
from utils.audit_details import record_update_details

router = APIRouter(prefix="/majors", tags=["Majors"])


class MajorData(BaseModel):
    name: str
    khoa_id: int | None = None


class MajorUpdate(BaseModel):
    name: str | None = None
    khoa_id: int | None = None


class MajorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    khoa_id: int | None


def require_faculty(khoa_id: int | None, db: Session) -> None:
    if khoa_id is not None and db.query(Khoa).filter(Khoa.id == khoa_id).first() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Faculty not found",
        )


@router.get("", response_model=list[MajorResponse])
def get_majors(db: Session = Depends(get_db)):
    return db.query(Nganh).outerjoin(Khoa).order_by(Khoa.name, Nganh.name).all()


@router.get("/{id}", response_model=MajorResponse)
def get_major(id: int, db: Session = Depends(get_db)):
    major = db.query(Nganh).filter(Nganh.id == id).first()
    if major is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Major not found",
        )
    return major


@router.post("", response_model=MajorResponse, status_code=status.HTTP_201_CREATED)
def create_major(data: MajorData, db: Session = Depends(get_db)):
    require_faculty(data.khoa_id, db)
    major = Nganh(**data.model_dump())
    return commit_db(major, db)


@router.patch("/{id}", response_model=MajorResponse)
def update_major(id: int, data: MajorUpdate, request: Request, db: Session = Depends(get_db)):
    major = db.query(Nganh).filter(Nganh.id == id).first()
    if major is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Major not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Major name cannot be null",
        )
    if "khoa_id" in update_data:
        require_faculty(update_data["khoa_id"], db)
    record_update_details(request, "major", major, id, update_data)
    for field, value in update_data.items():
        setattr(major, field, value)

    db.commit()
    db.refresh(major)
    return major


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_major(id: int, db: Session = Depends(get_db)):
    major = db.query(Nganh).filter(Nganh.id == id).first()
    if major is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Major not found",
        )
    if db.query(Lop).filter(Lop.nganh_id == id).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a major that still has classes",
        )
    db.delete(major)
    db.commit()
