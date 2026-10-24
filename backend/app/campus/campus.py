from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from db.database import Campus, PhongHoc, get_db
from utils.commit import commit_db
from utils.audit_details import record_update_details
from typing import Optional

router = APIRouter(prefix="/campus", tags=["Campus"])

class CampusData(BaseModel):
    name: str
    address: str
    
class CampusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: str

class CampusUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None

@router.post("/create", response_model=CampusResponse)
def create_campus(data: CampusData, db: Session = Depends(get_db)):
    campus = db.query(Campus).where(Campus.name == data.name).first()
    if campus:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campus already exist!"
        )
    
    campus = Campus(
        name = data.name,
        address = data.address
    )
    
    return commit_db(campus, db)
    
@router.get("/all", response_model=list[CampusResponse])
def get_all_campus(db: Session = Depends(get_db)):
    return db.query(Campus).order_by(Campus.name).all()

@router.get("/{id}", response_model=CampusResponse)
def get_campus_byId(id: int, db: Session = Depends(get_db)):
    campus = db.query(Campus).where(Campus.id == id).first()
    
    if not campus:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empty!"
        )
    return campus

@router.patch("/{id}", response_model=CampusResponse)
def refactor_campus(id: int, data: CampusUpdate, request: Request, db: Session = Depends(get_db)):
    
    campus = db.query(Campus).where(Campus.id == id).first()
    if not campus:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empty!"
        )
    update_data = data.model_dump(exclude_unset=True)
    record_update_details(request, "campus", campus, id, update_data)
    
    for field, value in update_data.items():
        setattr(campus, field, value)
    
    db.commit()
    db.refresh(campus)
    
    return campus


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campus(id: int, db: Session = Depends(get_db)):
    campus = db.query(Campus).filter(Campus.id == id).first()
    if campus is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campus not found",
        )
    if db.query(PhongHoc).filter(PhongHoc.campus_id == id).first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a campus that still has rooms",
        )
    db.delete(campus)
    db.commit()
