import time
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, require_infrastructure_user
from app.lighting import energy, service
from app.lighting.models import LightingDevice, RoomLight, LightEnergyMeter
from app.lighting.schemas import DeviceReport, LightCommand, LightPowerConfig
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
        .join(LightingDevice, RoomLight.device_id == LightingDevice.id)
        .order_by(RoomLight.campus_id, RoomLight.room_id, RoomLight.light_id)
        .all()
    ]


@router.put("/rooms/{campus_id}/{room_id}/lights/{light_id}", dependencies=[Depends(require_infrastructure_user)])
def command(campus_id: str, room_id: str, light_id: str, data: LightCommand, db: Session = Depends(get_db)):
    return service.request_command(db, campus_id, room_id, light_id, data)


@router.get("/energy", dependencies=[Depends(get_current_user)])
def energy_summary(
    days: int = Query(default=7, ge=1, le=90),
    end_date: date | None = Query(default=None),
    campus_id: str | None = Query(default=None, min_length=1, max_length=80),
    room_id: str | None = Query(default=None, min_length=1, max_length=80),
    db: Session = Depends(get_db),
):
    if room_id is not None and campus_id is None:
        raise HTTPException(422, "campus_id is required with room_id")
    if end_date is not None and end_date > datetime.now(energy.LOCAL_TIMEZONE).date():
        raise HTTPException(422, "end_date cannot be in the future")
    return energy.summarize(db, days, service.OFFLINE_SECONDS, campus_id, room_id, end_date=end_date)


@router.put("/rooms/{campus_id}/{room_id}/lights/{light_id}/power", dependencies=[Depends(require_infrastructure_user)])
def configure_power(
    campus_id: str, room_id: str, light_id: str, data: LightPowerConfig,
    db: Session = Depends(get_db),
):
    light = db.query(RoomLight).filter_by(campus_id=campus_id, room_id=room_id, light_id=light_id).first()
    if light is None:
        raise HTTPException(404, "Light is not provisioned")
    # Same device-first lock order as GPIO commands and device reports.
    db.query(LightingDevice).filter_by(id=light.device_id).with_for_update().one()
    meter = db.query(LightEnergyMeter).filter_by(light_id=light.id).with_for_update().first()
    now = time.time()
    if meter is None:
        meter = LightEnergyMeter(light_id=light.id, watts=data.watts, started_at=now, state_since=now)
        db.add(meter)
    elif meter.watts != data.watts:
        energy.close_interval(db, meter, now, service.OFFLINE_SECONDS)
        meter.watts = data.watts
    db.commit()
    return {"watts": data.watts}
