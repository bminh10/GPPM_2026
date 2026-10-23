from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.database import DangKyMonHoc, HocKy, Lop, MonHoc, ThoiKhoaBieu, get_db
from utils.commit import commit_db

router = APIRouter(prefix="/course-registrations", tags=["Đăng ký môn học"])


class RegistrationData(BaseModel):
    lop_id: int
    mon_id: int
    hoc_ky_id: int
    so_luong: int = Field(ge=0)


class RegistrationUpdate(BaseModel):
    lop_id: int | None = None
    mon_id: int | None = None
    hoc_ky_id: int | None = None
    so_luong: int | None = Field(default=None, ge=0)


class RegistrationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lop_id: int
    mon_id: int
    hoc_ky_id: int | None
    so_luong: int


def _validate_references(db: Session, values: dict) -> Lop:
    for field, model, label in (
        ("lop_id", Lop, "lớp"),
        ("mon_id", MonHoc, "môn học"),
        ("hoc_ky_id", HocKy, "học kỳ"),
    ):
        if db.query(model.id).filter(model.id == values[field]).first() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy {label} (id={values[field]}).",
            )
    school_class = db.query(Lop).filter(Lop.id == values["lop_id"]).first()
    class_size = school_class.si_so
    if class_size is not None and values["so_luong"] > class_size:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Số lượng đăng ký không được vượt quá sĩ số lớp ({class_size}).",
        )
    return school_class


def _ensure_unique(
    db: Session,
    lop_id: int,
    mon_id: int,
    hoc_ky_id: int,
    exclude_id: int | None = None,
) -> None:
    query = db.query(DangKyMonHoc).filter(
        DangKyMonHoc.lop_id == lop_id,
        DangKyMonHoc.mon_id == mon_id,
        DangKyMonHoc.hoc_ky_id == hoc_ky_id,
    )
    if exclude_id is not None:
        query = query.filter(DangKyMonHoc.id != exclude_id)
    if query.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lớp đã đăng ký môn học này trong học kỳ đã chọn.",
        )


@router.get("", response_model=list[RegistrationResponse])
def get_registrations(
    lop_id: int | None = None,
    mon_id: int | None = None,
    hoc_ky_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(DangKyMonHoc)
    if lop_id is not None:
        query = query.filter(DangKyMonHoc.lop_id == lop_id)
    if mon_id is not None:
        query = query.filter(DangKyMonHoc.mon_id == mon_id)
    if hoc_ky_id is not None:
        query = query.filter(DangKyMonHoc.hoc_ky_id == hoc_ky_id)
    return query.order_by(DangKyMonHoc.id).all()


@router.get("/{registration_id}", response_model=RegistrationResponse)
def get_registration(registration_id: int, db: Session = Depends(get_db)):
    registration = (
        db.query(DangKyMonHoc)
        .filter(DangKyMonHoc.id == registration_id)
        .first()
    )
    if registration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đăng ký môn học.",
        )
    return registration


@router.post(
    "",
    response_model=RegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_registration(data: RegistrationData, db: Session = Depends(get_db)):
    values = data.model_dump()
    _validate_references(db, values)
    _ensure_unique(db, values["lop_id"], values["mon_id"], values["hoc_ky_id"])
    registration = DangKyMonHoc(**values)
    try:
        return commit_db(registration, db)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lớp đã đăng ký môn học này trong học kỳ đã chọn.",
        ) from exc


@router.patch("/{registration_id}", response_model=RegistrationResponse)
def update_registration(
    registration_id: int,
    data: RegistrationUpdate,
    db: Session = Depends(get_db),
):
    registration = (
        db.query(DangKyMonHoc)
        .filter(DangKyMonHoc.id == registration_id)
        .first()
    )
    if registration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đăng ký môn học.",
        )

    updates = data.model_dump(exclude_unset=True)
    if any(value is None for value in updates.values()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Thông tin đăng ký môn học không được để trống.",
        )
    values = {
        "lop_id": registration.lop_id,
        "mon_id": registration.mon_id,
        "hoc_ky_id": registration.hoc_ky_id,
        "so_luong": registration.so_luong,
        **updates,
    }
    if values["hoc_ky_id"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Vui lòng chọn học kỳ cho đăng ký môn học.",
        )
    _validate_references(db, values)
    _ensure_unique(
        db,
        values["lop_id"],
        values["mon_id"],
        values["hoc_ky_id"],
        exclude_id=registration.id,
    )
    if values["hoc_ky_id"] != registration.hoc_ky_id and (
        db.query(ThoiKhoaBieu.id)
        .filter(
            ThoiKhoaBieu.dang_ky_mon_hoc_id == registration.id,
            ThoiKhoaBieu.hoc_ky_id != values["hoc_ky_id"],
        )
        .first()
        is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể đổi học kỳ vì đăng ký đã có thời khóa biểu ở học kỳ khác.",
        )
    for field, value in updates.items():
        setattr(registration, field, value)
    try:
        db.commit()
        db.refresh(registration)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lớp đã đăng ký môn học này trong học kỳ đã chọn.",
        ) from exc
    return registration


@router.delete("/{registration_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_registration(registration_id: int, db: Session = Depends(get_db)):
    registration = (
        db.query(DangKyMonHoc)
        .filter(DangKyMonHoc.id == registration_id)
        .first()
    )
    if registration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đăng ký môn học.",
        )
    if (
        db.query(ThoiKhoaBieu)
        .filter(ThoiKhoaBieu.dang_ky_mon_hoc_id == registration_id)
        .first()
        is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể xóa đăng ký môn học đang có thời khóa biểu.",
        )
    db.delete(registration)
    db.commit()
