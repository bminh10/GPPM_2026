from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from db.database import DangKyMonHoc, Lop, Nganh, get_db
from utils.commit import commit_db

router = APIRouter(prefix="/classes", tags=["Classes"])


class ClassData(BaseModel):
    name: str
    si_so: int = Field(default=0, ge=0)
    nganh_id: int


class ClassUpdate(BaseModel):
    name: str | None = None
    si_so: int | None = Field(default=None, ge=0)
    nganh_id: int | None = None


class ClassResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    si_so: int
    nganh_id: int


def require_major(nganh_id: int, db: Session) -> None:
    if db.query(Nganh).filter(Nganh.id == nganh_id).first() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Major not found",
        )


@router.get("", response_model=list[ClassResponse])
def get_classes(
    nganh_id: int | None = None,
    name: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Lop)
    if nganh_id is not None:
        query = query.filter(Lop.nganh_id == nganh_id)
    if name:
        query = query.filter(Lop.name.ilike(f"%{name}%"))
    return query.join(Nganh, Lop.nganh_id == Nganh.id).order_by(Lop.name, Nganh.name).all()


@router.get("/{id}", response_model=ClassResponse)
def get_class(id: int, db: Session = Depends(get_db)):
    school_class = db.query(Lop).filter(Lop.id == id).first()
    if school_class is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found",
        )
    return school_class


@router.post("", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
def create_class(data: ClassData, db: Session = Depends(get_db)):
    require_major(data.nganh_id, db)
    school_class = Lop(**data.model_dump())
    return commit_db(school_class, db)


@router.patch("/{id}", response_model=ClassResponse)
def update_class(id: int, data: ClassUpdate, db: Session = Depends(get_db)):
    school_class = db.query(Lop).filter(Lop.id == id).first()
    if school_class is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    if any(
        field in update_data and update_data[field] is None
        for field in ("name", "si_so", "nganh_id")
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Class name, si_so, and nganh_id cannot be null",
        )
    if "nganh_id" in update_data and update_data["nganh_id"] is not None:
        require_major(update_data["nganh_id"], db)
    for field, value in update_data.items():
        setattr(school_class, field, value)

    db.commit()
    db.refresh(school_class)
    return school_class


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(id: int, db: Session = Depends(get_db)):
    school_class = db.query(Lop).filter(Lop.id == id).first()
    if school_class is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Class not found",
        )
    if (
        db.query(DangKyMonHoc)
        .filter(DangKyMonHoc.lop_id == id)
        .first()
        is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a class that still has schedules",
        )
    db.delete(school_class)
    db.commit()
