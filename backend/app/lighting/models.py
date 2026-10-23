from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, UniqueConstraint

from db.database import Base


class LightingDevice(Base):
    __tablename__ = "lighting_device"

    id = Column(String(80), primary_key=True)
    key_hash = Column(String(64), nullable=False)
    campus_id = Column(String(80), nullable=False)
    room_id = Column(String(80), nullable=False)
    session_id = Column(String(36))
    sequence = Column(Integer, nullable=False, default=-1)
    last_seen = Column(Float)


class RoomLight(Base):
    __tablename__ = "room_light"
    __table_args__ = (
        UniqueConstraint("campus_id", "room_id", "light_id", name="uq_room_light_address"),
    )

    id = Column(Integer, primary_key=True)
    device_id = Column(String(80), ForeignKey("lighting_device.id"), nullable=False)
    campus_id = Column(String(80), nullable=False)
    room_id = Column(String(80), nullable=False)
    light_id = Column(String(80), nullable=False)
    desired_on = Column(Boolean, nullable=False, default=False)
    reported_on = Column(Boolean)
    revision = Column(Integer, nullable=False, default=0)
    acknowledged_revision = Column(Integer, nullable=False, default=-1)
    requested_at = Column(Float)
    reported_at = Column(Float)
