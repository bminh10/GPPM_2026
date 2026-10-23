import time
from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_admin
from app.lighting import service
from app.lighting.models import LightingDevice, RoomLight
from app.lighting.schemas import DeviceReport, LightCommand
from db.database import get_db

router = APIRouter(prefix="/lighting", tags=["Lighting"])
device_router = APIRouter(prefix="/iot/device", tags=["IoT"])


def authenticate_device(
    x_device_id: Annotated[str, Header(min_length=1, max_length=80)],
    x_device_key: Annotated[str, Header(min_length=32, max_length=256)],
    db: Session = Depends(get_db),
) -> LightingDevice:
    return service.device_by_key(db, x_device_id, x_device_key)


@device_router.post("/connect")
def connect(device: LightingDevice = Depends(authenticate_device), db: Session = Depends(get_db)):
    return service.connect(db, device)


@device_router.post("/sync")
def sync(report: DeviceReport, device: LightingDevice = Depends(authenticate_device), db: Session = Depends(get_db)):
    return service.synchronize(db, device, report)


@router.get("/lights", dependencies=[Depends(get_current_user)])
def list_lights(db: Session = Depends(get_db)):
    now = time.time()
    return [
        service.snapshot(light, device, now)
        for light, device in db.query(RoomLight, LightingDevice)
        .join(LightingDevice, RoomLight.device_id == LightingDevice.id).all()
    ]


@router.put("/rooms/{campus_id}/{room_id}/lights/{light_id}", dependencies=[Depends(require_admin)])
def command(campus_id: str, room_id: str, light_id: str, data: LightCommand, db: Session = Depends(get_db)):
    return service.request_command(db, campus_id, room_id, light_id, data)
