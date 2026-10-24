from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from db.database import Campus, PhongHoc, ThoiKhoaBieu, get_db
from utils.commit import commit_db
from utils.audit_details import record_update_details

router = APIRouter(prefix="/rooms", tags=["Rooms"])


class RoomData(BaseModel):
    name: str
    building: str | None = None
    capacity: int = Field(default=0, ge=0)
    is_thuc_hanh: bool = False
    campus_id: int
    


class RoomUpdate(BaseModel):
    name: str | None = None
    building: str | None = None
    capacity: int | None = Field(default=None, ge=0)
    is_thuc_hanh: bool | None = None
    campus_id: int | None = None


class RoomResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    building: str | None
    capacity: int
    is_thuc_hanh: bool
    campus_id: int


def require_campus(campus_id: int, db: Session) -> None:
    if db.query(Campus).filter(Campus.id == campus_id).first() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campus not found",
        )


@router.get("", response_model=list[RoomResponse])
def get_rooms(db: Session = Depends(get_db)):
    return (
        db.query(PhongHoc)
        .join(Campus, PhongHoc.campus_id == Campus.id)
        .order_by(Campus.name, PhongHoc.building, PhongHoc.name)
        .all()
    )


@router.get("/{id}", response_model=RoomResponse)
def get_room(id: int, db: Session = Depends(get_db)):
    room = db.query(PhongHoc).filter(PhongHoc.id == id).first()
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )
    return room


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
def create_room(data: RoomData, db: Session = Depends(get_db)):
    require_campus(data.campus_id, db)
    room = PhongHoc(**data.model_dump())
    return commit_db(room, db)


@router.patch("/{id}", response_model=RoomResponse)
def update_room(id: int, data: RoomUpdate, request: Request, db: Session = Depends(get_db)):
    room = db.query(PhongHoc).filter(PhongHoc.id == id).first()
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    if any(
        field in update_data and update_data[field] is None
        for field in ("name", "capacity", "campus_id", "is_thuc_hanh")
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Room name, capacity, campus_id, and is_thuc_hanh cannot be null",
        )
    if "campus_id" in update_data and update_data["campus_id"] is not None:
        require_campus(update_data["campus_id"], db)
    record_update_details(request, "room", room, id, update_data)
    for field, value in update_data.items():
        setattr(room, field, value)

    db.commit()
    db.refresh(room)
    return room


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(id: int, db: Session = Depends(get_db)):
    room = db.query(PhongHoc).filter(PhongHoc.id == id).first()
    if room is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found",
        )
    if (
        db.query(ThoiKhoaBieu)
        .filter(ThoiKhoaBieu.phong_hoc_id == id)
        .first()
        is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a room that still has schedules",
        )
    db.delete(room)
    db.commit()
