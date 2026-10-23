"""Run explicitly: python -m app.lighting.provision --help."""
import argparse
import hashlib
import os

from app.lighting.models import LightingDevice, RoomLight
from db.database import SessionLocal, engine


def main() -> None:
    parser = argparse.ArgumentParser(description="Create lighting tables and provision one device (no school room data needed)")
    parser.add_argument("--device", required=True)
    parser.add_argument("--campus", required=True)
    parser.add_argument("--room", required=True)
    parser.add_argument("--light", action="append", required=True)
    parser.add_argument("--key-env", required=True, help="Environment variable containing a random device key")
    args = parser.parse_args()
    key = os.environ.get(args.key_env, "")
    if len(key) < 32:
        parser.error("Device key must contain at least 32 characters")
    if len(set(args.light)) != len(args.light) or any(not item.strip() for item in args.light):
        parser.error("Light IDs must be non-empty and unique")
    for value in [args.device, args.campus, args.room, *args.light]:
        if not value.strip() or len(value) > 80:
            parser.error("IDs must be 1-80 characters")

    LightingDevice.__table__.create(engine, checkfirst=True)
    RoomLight.__table__.create(engine, checkfirst=True)
    with SessionLocal.begin() as db:
        device = db.get(LightingDevice, args.device)
        if device is None:
            device = LightingDevice(
                id=args.device, campus_id=args.campus, room_id=args.room,
                key_hash=hashlib.sha256(key.encode()).hexdigest(),
            )
            db.add(device)
            db.flush()
        elif (device.campus_id, device.room_id) != (args.campus, args.room):
            parser.error("Existing device has a different room; provision a new device ID")
        device.key_hash = hashlib.sha256(key.encode()).hexdigest()
        device.session_id = None
        device.last_seen = None
        for light_id in args.light:
            light = db.query(RoomLight).filter_by(
                campus_id=args.campus, room_id=args.room, light_id=light_id,
            ).first()
            if light is not None and light.device_id != args.device:
                parser.error(f"Light {light_id} already belongs to a different device")
            if light is None:
                db.add(RoomLight(device_id=args.device, campus_id=args.campus, room_id=args.room, light_id=light_id))
        print(f"Provisioned {args.device}; credential stored as SHA-256 digest. No keys printed.")


if __name__ == "__main__":
    main()
