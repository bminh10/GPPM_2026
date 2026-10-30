# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import os
from dotenv import load_dotenv
from sqlalchemy import (
    Column,
    Integer,
    Boolean,
    BigInteger,
    SmallInteger,
    String,
    Date,
    Time,
    DateTime,
    ForeignKey,
    CheckConstraint,
    UniqueConstraint,
    Text,
    create_engine,
    event,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

load_dotenv()

SQLALCHEMY_DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip().strip("\"'")

if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("LỖI: Chưa cấu hình DATABASE_URL trong file .env hoặc hệ thống!")

# SQLAlchemy 2.1 defaults postgresql:// to psycopg v3; this project ships psycopg2.
for _prefix in ("postgres://", "postgresql://", "postgresql+psycopg://"):
    if SQLALCHEMY_DATABASE_URL.startswith(_prefix):
        SQLALCHEMY_DATABASE_URL = "postgresql+psycopg2://" + SQLALCHEMY_DATABASE_URL[len(_prefix):]
        break

engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)


@event.listens_for(engine, "begin")
def set_public_search_path(connection):
    connection.exec_driver_sql("SET LOCAL search_path TO public")


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class Role(Base):
    __tablename__ = "role"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)

    users = relationship("User", back_populates="role")


class User(Base):
    __tablename__ = "user"

    id = Column(Integer, primary_key=True, index=True)
    user_name = Column(String, index=True)
    pass_word = Column(String)
    email = Column(String)
    role_id = Column(Integer, ForeignKey("role.id"))
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")

    role = relationship("Role", back_populates="users")


class Campus(Base):
    __tablename__ = "campus"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String)

    phong_hocs = relationship("PhongHoc", back_populates="campus")


class PhongHoc(Base):
    __tablename__ = "phong_hoc"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    building = Column(String)
    capacity = Column(Integer, default=0)
    is_thuc_hanh = Column(Boolean, nullable=False, default=False)
    campus_id = Column(Integer, ForeignKey("campus.id"), nullable=False)

    campus = relationship("Campus", back_populates="phong_hocs")
    thoi_khoa_bieus = relationship("ThoiKhoaBieu", back_populates="phong_hoc")


class Khoa(Base):
    __tablename__ = "khoa"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String, nullable=False)

    nganhs = relationship("Nganh", back_populates="khoa")


class Nganh(Base):
    __tablename__ = "nganh"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    khoa_id = Column(BigInteger, ForeignKey("khoa.id"))

    khoa = relationship("Khoa", back_populates="nganhs")
    lops = relationship("Lop", back_populates="nganh")


class Lop(Base):
    __tablename__ = "lop"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    si_so = Column(Integer, default=0)
    nganh_id = Column(Integer, ForeignKey("nganh.id"), nullable=False)

    __table_args__ = (CheckConstraint("si_so >= 0", name="lop_si_so_check"),)

    nganh = relationship("Nganh", back_populates="lops")
    dang_ky_mon_hocs = relationship("DangKyMonHoc", back_populates="lop")


class MonHoc(Base):
    __tablename__ = "mon_hoc"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    credits = Column(Integer, default=3)
    is_thuc_hanh = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    __table_args__ = (CheckConstraint("credits > 0", name="mon_hoc_credits_check"),)

    dang_ky_mon_hocs = relationship("DangKyMonHoc", back_populates="mon_hoc")


class DangKyMonHoc(Base):
    __tablename__ = "dang_ky_mon_hoc"

    id = Column(Integer, primary_key=True, index=True)
    lop_id = Column(Integer, ForeignKey("lop.id"), nullable=False)
    mon_id = Column(Integer, ForeignKey("mon_hoc.id"), nullable=False)
    so_luong = Column(Integer, nullable=False, default=0)
    hoc_ky_id = Column(Integer, ForeignKey("hoc_ky.id"), nullable=True)

    __table_args__ = (
        CheckConstraint("so_luong >= 0", name="dang_ky_mon_hoc_so_luong_check"),
        UniqueConstraint(
            "lop_id",
            "mon_id",
            "hoc_ky_id",
            name="dang_ky_mon_hoc_lop_mon_hoc_ky_unique",
        ),
    )

    lop = relationship("Lop", back_populates="dang_ky_mon_hocs")
    mon_hoc = relationship("MonHoc", back_populates="dang_ky_mon_hocs")
    hoc_ky = relationship("HocKy", back_populates="dang_ky_mon_hocs")
    thoi_khoa_bieus = relationship("ThoiKhoaBieu", back_populates="dang_ky_mon_hoc")


class HocKy(Base):
    __tablename__ = "hoc_ky"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)

    dang_ky_mon_hocs = relationship("DangKyMonHoc", back_populates="hoc_ky")
    thoi_khoa_bieus = relationship("ThoiKhoaBieu", back_populates="hoc_ky")


class CaHoc(Base):
    __tablename__ = "ca_hoc"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    thoi_khoa_bieus = relationship("ThoiKhoaBieu", back_populates="ca_hoc")


class ThoiKhoaBieu(Base):
    __tablename__ = "thoi_khoa_bieu"

    id = Column(Integer, primary_key=True, index=True)
    dang_ky_mon_hoc_id = Column(
        Integer,
        ForeignKey("dang_ky_mon_hoc.id"),
        nullable=False,
    )
    phong_hoc_id = Column(Integer, ForeignKey("phong_hoc.id"), nullable=False)
    hoc_ky_id = Column(Integer, ForeignKey("hoc_ky.id"), nullable=False)
    ca_hoc_id = Column(Integer, ForeignKey("ca_hoc.id"), nullable=False)
    day_of_week = Column(SmallInteger, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    teacher_name = Column(String)
    is_thuc_hanh = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        CheckConstraint(
            "day_of_week >= 2 AND day_of_week <= 8",
            name="thoi_khoa_bieu_day_of_week_check",
        ),
    )

    dang_ky_mon_hoc = relationship(
        "DangKyMonHoc",
        back_populates="thoi_khoa_bieus",
    )
    phong_hoc = relationship("PhongHoc", back_populates="thoi_khoa_bieus")
    hoc_ky = relationship("HocKy", back_populates="thoi_khoa_bieus")
    ca_hoc = relationship("CaHoc", back_populates="thoi_khoa_bieus")

    @property
    def lop_id(self) -> int:
        return self.dang_ky_mon_hoc.lop_id

    @property
    def mon_hoc_id(self) -> int:
        return self.dang_ky_mon_hoc.mon_id


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    method = Column(String, nullable=False)
    path = Column(String, nullable=False)
    status_code = Column(Integer, nullable=False)
    details = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ScheduleOptimizationJob(Base):
    __tablename__ = "schedule_optimization_job"

    id = Column(String, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, nullable=False, default="pending")
    request = Column(JSONB, nullable=False)
    result = Column(JSONB)
    error = Column(Text)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class ChangeApproval(Base):
    __tablename__ = "change_approval"

    id = Column(String, primary_key=True)
    requester_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    method = Column(String, nullable=False)
    path = Column(String, nullable=False)
    payload = Column(JSONB, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    review_note = Column(Text)
    error = Column(Text)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    reviewed_at = Column(DateTime(timezone=True))




# Create tables in the database if they do not exist
# Base.metadata.create_all(bind=engine)