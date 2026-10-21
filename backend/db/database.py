import os
from dotenv import load_dotenv
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    SmallInteger,
    String,
    Date,
    Time,
    ForeignKey,
    CheckConstraint,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

load_dotenv()

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("LỖI: Chưa cấu hình DATABASE_URL trong file .env hoặc hệ thống!")

engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
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
    thoi_khoa_bieus = relationship("ThoiKhoaBieu", back_populates="lop")


class MonHoc(Base):
    __tablename__ = "mon_hoc"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    credits = Column(Integer, default=3)

    __table_args__ = (CheckConstraint("credits > 0", name="mon_hoc_credits_check"),)

    thoi_khoa_bieus = relationship("ThoiKhoaBieu", back_populates="mon_hoc")


class HocKy(Base):
    __tablename__ = "hoc_ky"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)

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
    lop_id = Column(Integer, ForeignKey("lop.id"), nullable=False)
    mon_hoc_id = Column(Integer, ForeignKey("mon_hoc.id"), nullable=False)
    phong_hoc_id = Column(Integer, ForeignKey("phong_hoc.id"), nullable=False)
    hoc_ky_id = Column(Integer, ForeignKey("hoc_ky.id"), nullable=False)
    ca_hoc_id = Column(Integer, ForeignKey("ca_hoc.id"), nullable=False)
    day_of_week = Column(SmallInteger, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    teacher_name = Column(String)

    __table_args__ = (
        CheckConstraint(
            "day_of_week >= 2 AND day_of_week <= 8",
            name="thoi_khoa_bieu_day_of_week_check",
        ),
    )

    lop = relationship("Lop", back_populates="thoi_khoa_bieus")
    mon_hoc = relationship("MonHoc", back_populates="thoi_khoa_bieus")
    phong_hoc = relationship("PhongHoc", back_populates="thoi_khoa_bieus")
    hoc_ky = relationship("HocKy", back_populates="thoi_khoa_bieus")
    ca_hoc = relationship("CaHoc", back_populates="thoi_khoa_bieus")


# Create tables in the database if they do not exist
Base.metadata.create_all(bind=engine)