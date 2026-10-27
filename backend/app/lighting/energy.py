# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
"""Energy estimates from confirmed GPIO states, never electrical measurements."""
import argparse
import math
import os
import time
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.lighting.models import LightEnergyInterval, LightEnergyMeter, RoomLight

LOCAL_TIMEZONE = timezone(timedelta(hours=7), name="Asia/Ho_Chi_Minh")
DEFAULT_LIGHT_WATTS = float(os.getenv("LIGHTING_DEFAULT_WATTS", "20"))
if not math.isfinite(DEFAULT_LIGHT_WATTS) or not 0 < DEFAULT_LIGHT_WATTS <= 10000:
    raise ValueError("LIGHTING_DEFAULT_WATTS must be a finite number greater than 0 and at most 10000")


def segments(meter: LightEnergyMeter, now: float, offline_seconds: int):
    start = meter.state_since
    if now <= start:
        return
    known_end = min(now, meter.confirmed_at + offline_seconds) if meter.confirmed_at is not None else start
    known_end = max(start, known_end)
    if known_end > start and meter.on is not None:
        yield start, known_end, meter.on, meter.watts
    else:
        known_end = start
    if now > known_end:
        yield known_end, now, None, meter.watts


def close_interval(db: Session, meter: LightEnergyMeter, now: float, offline_seconds: int) -> None:
    if now < meter.state_since or (meter.confirmed_at is not None and now < meter.confirmed_at):
        raise ValueError("Server clock moved backwards during energy accounting")
    for start, end, on, watts in segments(meter, now, offline_seconds):
        db.add(LightEnergyInterval(
            light_id=meter.light_id, start_at=start, end_at=end, on=on, watts=watts,
        ))
    meter.state_since = max(meter.state_since, now)


def record_report(
    db: Session, meter: LightEnergyMeter, on: bool, now: float, offline_seconds: int,
) -> None:
    if now < meter.state_since or (meter.confirmed_at is not None and now < meter.confirmed_at):
        raise ValueError("Server clock moved backwards during energy accounting")
    expired = meter.confirmed_at is None or now - meter.confirmed_at > offline_seconds
    if expired or meter.on != on:
        close_interval(db, meter, now, offline_seconds)
        meter.on = on
    meter.confirmed_at = now


def meters_for_lights(db: Session, lights: list[RoomLight]) -> dict[int, LightEnergyMeter]:
    return {
        meter.light_id: meter for meter in db.query(LightEnergyMeter)
        .filter(LightEnergyMeter.light_id.in_([light.id for light in lights])).all()
    }


def ensure_meters(db: Session, lights: list[RoomLight], now: float) -> dict[int, LightEnergyMeter]:
    """Caller holds the device lock, shared with reports and power configuration."""
    meters = meters_for_lights(db, lights)
    for light in lights:
        if light.id not in meters:
            meter = LightEnergyMeter(
                light_id=light.id, watts=DEFAULT_LIGHT_WATTS, started_at=now, state_since=now,
            )
            db.add(meter)
            meters[light.id] = meter
    return meters


def summarize(
    db: Session, days: int, offline_seconds: int, campus_id: str | None = None,
    room_id: str | None = None, now: float | None = None, end_date: date | None = None,
) -> dict:
    now = time.time() if now is None else now
    today = datetime.fromtimestamp(now, LOCAL_TIMEZONE).replace(hour=0, minute=0, second=0, microsecond=0)
    last_day = end_date or today.date()
    start_day = datetime.combine(last_day - timedelta(days=days - 1), datetime.min.time(), LOCAL_TIMEZONE)
    period_end = min(
        datetime.combine(last_day + timedelta(days=1), datetime.min.time(), LOCAL_TIMEZONE).timestamp(),
        now,
    )
    start = start_day.timestamp()
    query = db.query(RoomLight, LightEnergyMeter).join(
        LightEnergyMeter, LightEnergyMeter.light_id == RoomLight.id,
    )
    if campus_id is not None:
        query = query.filter(RoomLight.campus_id == campus_id)
    if room_id is not None:
        query = query.filter(RoomLight.room_id == room_id)
    pairs = query.order_by(RoomLight.campus_id, RoomLight.room_id, RoomLight.light_id).all()
    meters = {meter.light_id: meter for _, meter in pairs}
    daily = {(start_day + timedelta(days=i)).date().isoformat(): {} for i in range(days)}
    light_totals = {
        light.id: {
            "campus_id": light.campus_id, "room_id": light.room_id, "light_id": light.light_id,
            "watts": meter.watts, "energy_kwh": 0.0, "on_seconds": 0.0,
            "known_seconds": 0.0, "unknown_seconds": 0.0,
            "current_watts": (
                (meter.watts if meter.on else 0.0)
                if meter.on is not None and meter.confirmed_at is not None
                and now - meter.confirmed_at <= offline_seconds else None
            ),
        } for light, meter in pairs
    }

    def accumulate(light_id: int, begin: float, end: float, on: bool | None, watts: float) -> None:
        cursor, end = max(begin, start), min(end, period_end)
        while cursor < end:
            local = datetime.fromtimestamp(cursor, LOCAL_TIMEZONE)
            boundary = (local.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).timestamp()
            stop = min(end, boundary)
            seconds = stop - cursor
            bucket = daily[local.date().isoformat()].setdefault(
                light_id, {"energy_kwh": 0.0, "on_seconds": 0.0, "known_seconds": 0.0, "unknown_seconds": 0.0},
            )
            values = {
                "energy_kwh": watts * seconds / 3_600_000 if on is True else 0.0,
                "on_seconds": seconds if on is True else 0.0,
                "known_seconds": seconds if on is not None else 0.0,
                "unknown_seconds": seconds if on is None else 0.0,
            }
            for key, value in values.items():
                bucket[key] += value
                light_totals[light_id][key] += value
            cursor = stop

    if meters:
        intervals = db.query(LightEnergyInterval).filter(
            LightEnergyInterval.light_id.in_(meters),
            LightEnergyInterval.end_at > start, LightEnergyInterval.start_at < period_end,
        ).all()
        for interval in intervals:
            accumulate(
                interval.light_id, interval.start_at,
                min(interval.end_at, meters[interval.light_id].state_since, period_end), interval.on, interval.watts,
            )
        for meter in meters.values():
            for begin, end, on, watts in segments(meter, period_end, offline_seconds):
                accumulate(meter.light_id, begin, end, on, watts)

    rooms: dict[tuple[str, str], dict] = {}
    for light in light_totals.values():
        address = (light["campus_id"], light["room_id"])
        room = rooms.setdefault(address, {
            "campus_id": address[0], "room_id": address[1], "energy_kwh": 0.0,
            "known_seconds": 0.0, "unknown_seconds": 0.0, "current_watts": 0.0,
            "configured_lights": 0, "online_lights": 0,
        })
        for key in ("energy_kwh", "known_seconds", "unknown_seconds"):
            room[key] += light[key]
        room["configured_lights"] += 1
        if light["current_watts"] is not None:
            room["current_watts"] += light["current_watts"]
            room["online_lights"] += 1
    chart = []
    for day, buckets in daily.items():
        valid_rooms = {
            (light_totals[key]["campus_id"], light_totals[key]["room_id"])
            for key, value in buckets.items() if value["known_seconds"] > 0
        }
        total = sum(value["energy_kwh"] for value in buckets.values())
        chart.append({
            "date": day, "energy_kwh": total if valid_rooms else None,
            "average_kwh": total / len(valid_rooms) if valid_rooms else None,
            "rooms_with_data": len(valid_rooms),
            "unknown_seconds": sum(value["unknown_seconds"] for value in buckets.values()),
        })
    valid = [room for room in rooms.values() if room["known_seconds"] > 0]
    total = sum(room["energy_kwh"] for room in valid)
    return {
        "timezone": "Asia/Ho_Chi_Minh", "start_date": start_day.date().isoformat(),
        "end_date": min(last_day, today.date()).isoformat(), "as_of": now,
        "energy_kwh": total if valid else None,
        "average_kwh": total / len(valid) if valid else None,
        "configured_rooms": len(rooms), "rooms_with_data": len(valid),
        "unknown_seconds": sum(room["unknown_seconds"] for room in rooms.values()),
        "rooms": list(rooms.values()), "lights": list(light_totals.values()), "daily": chart,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Create additive energy tables; no existing tables or keys changed")
    parser.add_argument("--init-db", action="store_true", required=True)
    parser.parse_args()
    from db.database import engine, SessionLocal
    from app.lighting.models import LightingDevice

    LightEnergyMeter.__table__.create(engine, checkfirst=True)
    LightEnergyInterval.__table__.create(engine, checkfirst=True)
    with SessionLocal.begin() as db:
        for device in db.query(LightingDevice).order_by(LightingDevice.id).with_for_update().all():
            lights = db.query(RoomLight).filter_by(device_id=device.id).all()
            ensure_meters(db, lights, time.time())
    print(f"Energy tables ready; unconfigured lights use {DEFAULT_LIGHT_WATTS:g} W. No historical data generated.")


if __name__ == "__main__":
    main()
