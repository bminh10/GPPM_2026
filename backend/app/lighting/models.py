# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

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

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
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


class LightEnergyMeter(Base):
    __tablename__ = "light_energy_meter"

    light_id: Mapped[int] = mapped_column(Integer, ForeignKey("room_light.id"), primary_key=True)
    watts: Mapped[float] = mapped_column(Float, nullable=False)
    started_at: Mapped[float] = mapped_column(Float, nullable=False)
    state_since: Mapped[float] = mapped_column(Float, nullable=False)
    on: Mapped[bool | None] = mapped_column(Boolean)
    confirmed_at: Mapped[float | None] = mapped_column(Float)


class LightEnergyInterval(Base):
    __tablename__ = "light_energy_interval"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    light_id: Mapped[int] = mapped_column(Integer, ForeignKey("light_energy_meter.light_id"), nullable=False, index=True)
    start_at: Mapped[float] = mapped_column(Float, nullable=False)
    end_at: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    watts: Mapped[float] = mapped_column(Float, nullable=False)
    on: Mapped[bool | None] = mapped_column(Boolean)
