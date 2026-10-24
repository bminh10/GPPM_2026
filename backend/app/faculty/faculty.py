from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from db.database import Khoa, Nganh, get_db
from utils.commit import commit_db
from utils.audit_details import record_update_details

router = APIRouter(prefix="/faculties", tags=["Faculties"])


class FacultyData(BaseModel):
    name: str


class FacultyUpdate(BaseModel):
    name: str | None = None


class FacultyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


@router.get("", response_model=list[FacultyResponse])
def get_faculties(
    name: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Khoa)
    if name:
        query = query.filter(Khoa.name.ilike(f"%{name}%"))
    return query.order_by(Khoa.name).all()


@router.get("/{id}", response_model=FacultyResponse)
def get_faculty(id: int, db: Session = Depends(get_db)):
    faculty = db.query(Khoa).filter(Khoa.id == id).first()
    if faculty is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Faculty not found",
        )
    return faculty


@router.post("", response_model=FacultyResponse, status_code=status.HTTP_201_CREATED)
def create_faculty(data: FacultyData, db: Session = Depends(get_db)):
    faculty = Khoa(**data.model_dump())
    return commit_db(faculty, db)


@router.patch("/{id}", response_model=FacultyResponse)
def update_faculty(
    id: int,
    data: FacultyUpdate,
    request: Request,
    db: Session = Depends(get_db),
):
    faculty = db.query(Khoa).filter(Khoa.id == id).first()
    if faculty is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Faculty not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Faculty name cannot be null",
        )
    record_update_details(request, "faculty", faculty, id, update_data)
    for field, value in update_data.items():
        setattr(faculty, field, value)

    db.commit()
    db.refresh(faculty)
    return faculty


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_faculty(id: int, db: Session = Depends(get_db)):
    faculty = db.query(Khoa).filter(Khoa.id == id).first()
    if faculty is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Faculty not found",
        )
    if db.query(Nganh).filter(Nganh.khoa_id == id).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a faculty that still has majors",
        )
    db.delete(faculty)
    db.commit()