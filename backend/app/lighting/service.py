import hashlib
import hmac
import os
import time
import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.lighting.models import LightingDevice, RoomLight
from app.lighting.schemas import DeviceReport, LightCommand
from app.lighting import energy

OFFLINE_SECONDS = int(os.getenv("LIGHTING_OFFLINE_SECONDS", "30"))
COMMAND_TIMEOUT_SECONDS = int(os.getenv("LIGHTING_COMMAND_TIMEOUT_SECONDS", "30"))
if OFFLINE_SECONDS < 1 or COMMAND_TIMEOUT_SECONDS < 1:
    raise ValueError("Lighting timeout settings must be positive seconds")


def device_by_key(db: Session, device_id: str, key: str) -> LightingDevice:
    device = db.query(LightingDevice).filter_by(id=device_id).with_for_update().first()
    digest = hashlib.sha256(key.encode()).hexdigest()
    if device is None or not hmac.compare_digest(device.key_hash, digest):
        raise HTTPException(401, "Invalid device credentials")
    return device


def device_lights(db: Session, device_id: str) -> list[RoomLight]:
    return db.query(RoomLight).filter_by(device_id=device_id).order_by(RoomLight.id).with_for_update().all()


def snapshot(light: RoomLight, device: LightingDevice, now: float) -> dict:
    online = device.last_seen is not None and now - device.last_seen <= OFFLINE_SECONDS
    pending = light.acknowledged_revision != light.revision
    timed_out = pending and light.requested_at is not None and now - light.requested_at > COMMAND_TIMEOUT_SECONDS
    return {
        "campus_id": light.campus_id,
        "room_id": light.room_id,
        "light_id": light.light_id,
        "device_id": light.device_id,
        "desired_on": light.desired_on,
        "reported_on": light.reported_on,
        "revision": light.revision,
        "online": online,
        "pending": pending,
        "timed_out": timed_out,
        "last_seen": device.last_seen,
        "reported_at": light.reported_at,
        "source": "simulated",
    }


def commands(device: LightingDevice, lights: list[RoomLight]) -> dict:
    return {
        "session_id": device.session_id,
        "lights": [
            {"light_id": light.light_id, "on": light.desired_on, "revision": light.revision}
            for light in lights
        ],
    }


def connect(db: Session, device: LightingDevice) -> dict:
    device.session_id = str(uuid.uuid4())
    device.sequence = -1
    device.last_seen = None
    # A reboot must confirm GPIO again, even if the previous session was in sync.
    lights = device_lights(db, device.id)
    now = time.time()
    for meter in energy.meters_for_lights(db, lights).values():
        energy.close_interval(db, meter, now, OFFLINE_SECONDS)
        meter.on = None
        meter.confirmed_at = None
    for light in lights:
        light.revision += 1
        light.requested_at = time.time()
    response = commands(device, lights)
    db.commit()
    return response


def synchronize(db: Session, device: LightingDevice, report: DeviceReport) -> dict:
    if device.session_id != report.session_id or report.sequence <= device.sequence:
        raise HTTPException(409, "Stale device session or sequence; reconnect")
    lights = device_lights(db, device.id)
    reports = {item.light_id: item for item in report.lights}
    if len(reports) != len(report.lights) or set(reports) != {light.light_id for light in lights}:
        raise HTTPException(422, "Report must contain each assigned light exactly once")
    if any(reports[light.light_id].revision > light.revision for light in lights):
        raise HTTPException(409, "Unknown command revision")
    now = time.time()
    meters = energy.ensure_meters(db, lights, now)
    for light in lights:
        item = reports[light.light_id]
        # Older acknowledgements cannot overwrite newer web commands.
        if item.revision != light.revision:
            continue
        if light.acknowledged_revision != light.revision and item.on != light.desired_on:
            continue
        light.reported_on = item.on
        light.reported_at = now
        light.acknowledged_revision = light.revision
        # Once acknowledged, a physical button may change the state at this revision.
        light.desired_on = item.on
        if light.id in meters:
            energy.record_report(db, meters[light.id], item.on, now, OFFLINE_SECONDS)
    device.sequence = report.sequence
    device.last_seen = now
    response = commands(device, lights)
    db.commit()
    return response


def request_command(db: Session, campus_id: str, room_id: str, light_id: str, command: LightCommand) -> dict:
    # All writers lock device before lights, including commands from other workers.
    target = db.query(RoomLight).filter_by(campus_id=campus_id, room_id=room_id, light_id=light_id).first()
    if target is None:
        raise HTTPException(404, "Light is not provisioned")
    device = db.query(LightingDevice).filter_by(id=target.device_id).with_for_update().one()
    light = db.query(RoomLight).filter_by(id=target.id).populate_existing().with_for_update().one()
    if light.revision != command.expected_revision:
        raise HTTPException(409, "Light changed; reload status before issuing another command")
    now = time.time()
    if device.last_seen is None or now - device.last_seen > OFFLINE_SECONDS:
        raise HTTPException(409, "Device is offline")
    light.desired_on = command.on
    light.revision += 1
    light.requested_at = now
    response = snapshot(light, device, now)
    db.commit()
    return response
