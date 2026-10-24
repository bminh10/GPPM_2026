from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from db.database import get_db, Campus
from utils.commit import commit_db
from typing import Optional

router = APIRouter(prefix="/campus", tags=["Campus"])

class CampusData(BaseModel):
    name: str
    address: str
    
class CampusResponse(BaseModel):
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
    campus = db.query(Campus).all()
    
    if not campus:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empty!"
        )
    return campus

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
def refactor_campus(id: int, data: CampusUpdate, db: Session = Depends(get_db)):
    
    campus = db.query(Campus).where(Campus.id == id).first()
    if not campus:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empty!"
        )
    update_data = data.model_dump(exclude_unset=True)
    
    for field, value in update_data.items():
        setattr(campus, field, value)
    
    db.commit()
    db.refresh(campus)
    
    return campus
