from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from ortools.sat.python import cp_model

from app.auth.dependencies import get_current_user
from app.schedules.schedules import find_conflicts
from app.optimization.scheduling_core import (
    FixedSchedule,
    MeetingRequirement,
    ScheduleCandidate,
    solve_weekly_schedule,
    weekday_occurs,
)
from app.subjects.subject_rules import determine_is_thuc_hanh
from db.database import (
    CaHoc,
    Campus,
    DangKyMonHoc,
    HocKy,
    Khoa,
    Lop,
    MonHoc,
    Nganh,
    PhongHoc,
    ThoiKhoaBieu,
    get_db,
)

router = APIRouter(prefix="/optimization", tags=["Tối ưu"])
MAX_CANDIDATE_ASSIGNMENTS = 100_000


class RoomAllocationRequest(BaseModel):
    dang_ky_mon_hoc_id: int
    hoc_ky_id: int
    campus_id: int | None = None
    ca_hoc_id: int
    day_of_week: int = Field(ge=2, le=8)
    start_date: date
    end_date: date
    is_thuc_hanh: bool = False


class AutomaticScheduleRequest(BaseModel):
    hoc_ky_id: int
    campus_id: int
    mode: Literal["missing", "all"] = "missing"
    registration_ids: list[int] | None = None
    khoa_ids: list[int] | None = None


def _has_complete_schedule_coverage(
    schedules: list[ThoiKhoaBieu],
    start_date: date,
    end_date: date,
    required_types: set[bool],
) -> bool:
    return bool(required_types) and all(
        any(
            schedule.is_thuc_hanh == is_practice
            and schedule.start_date <= start_date
            and schedule.end_date >= end_date
            and weekday_occurs(
                max(schedule.start_date, start_date),
                min(schedule.end_date, end_date),
                schedule.day_of_week,
            )
            for schedule in schedules
        )
        for is_practice in required_types
    )


def _first_weekday(start_date: date, end_date: date, day_of_week: int) -> date:
    first_day = start_date + timedelta(
        days=(day_of_week - 2 - start_date.weekday()) % 7
    )
    if first_day > end_date:
        raise ValueError("No occurrence of the selected weekday in the schedule range.")
    return first_day


def _weekday_count(start_date: date, end_date: date, day_of_week: int) -> int:
    first_day = _first_weekday(start_date, end_date, day_of_week)
    return 1 + (end_date - first_day).days // 7


@router.post("/schedule")
def automatically_schedule_semester(
    data: AutomaticScheduleRequest,
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    semester = db.query(HocKy).filter(HocKy.id == data.hoc_ky_id).first()
    if semester is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy học kỳ (id={data.hoc_ky_id}).",
        )
    campus = db.query(Campus).filter(Campus.id == data.campus_id).first()
    if campus is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy cơ sở đào tạo (id={data.campus_id}).",
        )
    if semester.start_date > semester.end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Khoảng ngày của học kỳ không hợp lệ.",
        )
    allocation_start_date = max(date.today(), semester.start_date)
    if allocation_start_date > semester.end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Học kỳ đã kết thúc, không còn thời gian để phân bổ lịch học.",
        )

    semester_registrations = (
        db.query(DangKyMonHoc)
        .filter(DangKyMonHoc.hoc_ky_id == semester.id)
        .order_by(DangKyMonHoc.id)
        .all()
    )
    semester_registration_ids = {
        registration.id for registration in semester_registrations
    }
    if data.registration_ids is not None and data.khoa_ids is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Chỉ truyền danh sách đăng ký hoặc danh sách khoa, không truyền đồng thời.",
        )
    if data.khoa_ids is not None:
        selected_faculty_ids = set(data.khoa_ids)
        if not selected_faculty_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Vui lòng chọn ít nhất một khoa để phân bổ.",
            )
        existing_faculty_ids = {
            faculty_id
            for (faculty_id,) in db.query(Khoa.id)
            .filter(Khoa.id.in_(selected_faculty_ids))
            .all()
        }
        if existing_faculty_ids != selected_faculty_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Một hoặc nhiều khoa được chọn không tồn tại.",
            )
        registrations = (
            db.query(DangKyMonHoc)
            .join(Lop, DangKyMonHoc.lop_id == Lop.id)
            .join(Nganh, Lop.nganh_id == Nganh.id)
            .filter(
                DangKyMonHoc.hoc_ky_id == semester.id,
                Nganh.khoa_id.in_(selected_faculty_ids),
            )
            .order_by(DangKyMonHoc.id)
            .all()
        )
    elif data.registration_ids is not None:
        requested_registration_ids = set(data.registration_ids)
        if not requested_registration_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Vui lòng chọn ít nhất một đăng ký môn học để phân bổ.",
            )
        if requested_registration_ids - semester_registration_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Danh sách đăng ký phải thuộc học kỳ đang chọn.",
            )
        registrations = [
            registration
            for registration in semester_registrations
            if registration.id in requested_registration_ids
        ]
    else:
        registrations = semester_registrations
    existing_target_schedules = (
        db.query(ThoiKhoaBieu)
        .filter(ThoiKhoaBieu.hoc_ky_id == semester.id)
        .order_by(ThoiKhoaBieu.id)
        .all()
    )
    existing_room_ids = {
        schedule.phong_hoc_id for schedule in existing_target_schedules
    }
    existing_room_campuses = {
        room.id: room.campus_id
        for room in db.query(PhongHoc)
        .filter(PhongHoc.id.in_(existing_room_ids))
        .all()
    }
    subjects = (
        db.query(MonHoc)
        .filter(MonHoc.id.in_({registration.mon_id for registration in semester_registrations}))
        .all()
    )
    subjects_by_id = {subject.id: subject for subject in subjects}
    practice_by_registration = {
        registration.id: (
            subjects_by_id[registration.mon_id].is_thuc_hanh
            or determine_is_thuc_hanh(subjects_by_id[registration.mon_id].code)
        )
        for registration in semester_registrations
        if registration.mon_id in subjects_by_id
    }

    schedules_by_registration: dict[int, list[ThoiKhoaBieu]] = {}
    other_campus_schedule_registration_ids: set[int] = set()
    for schedule in existing_target_schedules:
        if schedule.end_date < allocation_start_date:
            continue
        if existing_room_campuses.get(schedule.phong_hoc_id) == campus.id:
            schedules_by_registration.setdefault(
                schedule.dang_ky_mon_hoc_id,
                [],
            ).append(schedule)
        else:
            other_campus_schedule_registration_ids.add(
                schedule.dang_ky_mon_hoc_id
            )
    scheduled_registration_ids = {
        registration_id
        for registration_id, registration_schedules in schedules_by_registration.items()
        if _has_complete_schedule_coverage(
            registration_schedules,
            allocation_start_date,
            semester.end_date,
            {False, True} if practice_by_registration.get(registration_id, False) else {False},
        )
    }
    if data.mode == "missing":
        pending_registrations = [
            registration
            for registration in registrations
            if registration.id not in scheduled_registration_ids
            or registration.id in other_campus_schedule_registration_ids
        ]
        pending_registration_ids = {
            registration.id for registration in pending_registrations
        }
        schedules_to_replace = [
            schedule
            for schedule in existing_target_schedules
            if schedule.end_date >= allocation_start_date
            and schedule.dang_ky_mon_hoc_id in pending_registration_ids
        ]
    else:
        pending_registrations = registrations
        selected_registration_ids = {
            registration.id for registration in pending_registrations
        }
        schedules_to_replace = [
            schedule
            for schedule in existing_target_schedules
            if schedule.end_date >= allocation_start_date
            and schedule.dang_ky_mon_hoc_id in selected_registration_ids
        ]

    if not pending_registrations:
        return {
            "mode": data.mode,
            "campus_id": campus.id,
            "campus_name": campus.name,
            "scheduled_count": 0,
            "replaced_count": 0,
            "message": (
                "Không có đăng ký môn học nào cần xếp lịch."
                if data.mode == "missing"
                else "Học kỳ chưa có đăng ký môn học."
            ),
            "allocations": [],
        }

    historical_schedules = [
        schedule
        for schedule in schedules_to_replace
        if schedule.start_date < allocation_start_date
    ]
    historical_schedule_copies = [
        ThoiKhoaBieu(
            dang_ky_mon_hoc_id=schedule.dang_ky_mon_hoc_id,
            phong_hoc_id=schedule.phong_hoc_id,
            hoc_ky_id=schedule.hoc_ky_id,
            ca_hoc_id=schedule.ca_hoc_id,
            day_of_week=schedule.day_of_week,
            start_date=schedule.start_date,
            end_date=allocation_start_date - timedelta(days=1),
            teacher_name=schedule.teacher_name,
            is_thuc_hanh=schedule.is_thuc_hanh,
        )
        for schedule in historical_schedules
    ]

    time_slots = (
        db.query(CaHoc)
        .filter(CaHoc.start_time < CaHoc.end_time)
        .order_by(CaHoc.start_time, CaHoc.id)
        .all()
    )
    rooms = (
        db.query(PhongHoc)
        .filter(PhongHoc.campus_id == campus.id)
        .order_by(PhongHoc.capacity, PhongHoc.name)
        .all()
    )
    if not time_slots:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Chưa có ca học hợp lệ để tạo thời khóa biểu.",
        )
    class_names = {
        school_class.id: school_class.name
        for school_class in db.query(Lop)
        .filter(Lop.id.in_({registration.lop_id for registration in pending_registrations}))
        .all()
    }
    def registration_label(registration: DangKyMonHoc) -> str:
        class_name = class_names.get(registration.lop_id, f"Lớp {registration.lop_id}")
        subject = subjects_by_id.get(registration.mon_id)
        subject_name = subject.name if subject is not None else f"Môn {registration.mon_id}"
        return f"{subject_name} / {class_name}"

    replaced_schedule_ids = {schedule.id for schedule in schedules_to_replace}
    preserved_schedule_by_registration: dict[int, ThoiKhoaBieu] = {}
    for schedule in schedules_to_replace:
        preserved_schedule_by_registration.setdefault(
            schedule.dang_ky_mon_hoc_id,
            schedule,
        )
    fixed_schedule_query = db.query(ThoiKhoaBieu).filter(
        ThoiKhoaBieu.start_date <= semester.end_date,
        ThoiKhoaBieu.end_date >= allocation_start_date,
    )
    if replaced_schedule_ids:
        fixed_schedule_query = fixed_schedule_query.filter(
            ThoiKhoaBieu.id.notin_(replaced_schedule_ids)
        )
    fixed_schedules = fixed_schedule_query.all()
    fixed_schedule_ids = {schedule.id for schedule in fixed_schedules}
    fixed_slots = (
        db.query(CaHoc)
        .filter(
            CaHoc.id.in_({schedule.ca_hoc_id for schedule in fixed_schedules})
        )
        .all()
        if fixed_schedule_ids
        else []
    )
    fixed_slot_by_id = {slot.id: slot for slot in fixed_slots}
    fixed_schedule_data = [
        FixedSchedule(
            room_id=schedule.phong_hoc_id,
            class_id=schedule.lop_id,
            day_of_week=schedule.day_of_week,
            start_date=schedule.start_date,
            end_date=schedule.end_date,
            start_time=fixed_slot_by_id[schedule.ca_hoc_id].start_time,
            end_time=fixed_slot_by_id[schedule.ca_hoc_id].end_time,
        )
        for schedule in fixed_schedules
        if schedule.ca_hoc_id in fixed_slot_by_id
    ]
    registrations_without_rooms: list[tuple[DangKyMonHoc, str]] = []
    teacher_by_registration = {
        registration_id: (schedule.teacher_name or "").strip().casefold()
        for registration_id, schedule in preserved_schedule_by_registration.items()
    }
    meeting_requirements: list[MeetingRequirement] = []
    candidates: list[ScheduleCandidate] = []
    registrations_by_id = {registration.id: registration for registration in pending_registrations}

    for registration in pending_registrations:
        required_capacity = registration.so_luong
        is_practical_subject = practice_by_registration.get(registration.id, False)
        meeting_types = {False, True} if is_practical_subject else {False}
        eligible_rooms = [
            room
            for room in rooms
            if room.capacity is not None
            and room.capacity >= required_capacity
        ]
        for is_practical in sorted(meeting_types):
            suitable_rooms = [
                room
                for room in eligible_rooms
                if not is_practical or room.is_thuc_hanh
            ]
            if not suitable_rooms:
                if is_practical:
                    reason = "thiếu phòng thực hành đủ sức chứa"
                elif eligible_rooms:
                    reason = "không có phòng thường đủ sức chứa; phòng thực hành không dùng cho lý thuyết"
                elif rooms:
                    reason = f"không có phòng đủ {required_capacity} chỗ tại cơ sở {campus.name}"
                else:
                    reason = f"cơ sở {campus.name} chưa có phòng học"
                registrations_without_rooms.append((registration, reason))
                continue

            requirement_id = (
                f"{registration.id}:{'practice' if is_practical else 'theory'}"
            )
            meeting_requirements.append(
                MeetingRequirement(
                    id=requirement_id,
                    registration_id=registration.id,
                    is_thuc_hanh=is_practical,
                )
            )
            for day_of_week in range(2, 9):
                if not weekday_occurs(
                    allocation_start_date,
                    semester.end_date,
                    day_of_week,
                ):
                    continue
                for slot in time_slots:
                    for room in suitable_rooms:
                        if len(candidates) >= MAX_CANDIDATE_ASSIGNMENTS:
                            raise HTTPException(
                                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=(
                                    "Số lượng phương án quá lớn để tối ưu an toàn. Hãy giảm số đăng ký, "
                                    "ca học hoặc phòng tham gia rồi thử lại."
                                ),
                            )
                        candidates.append(
                            ScheduleCandidate(
                                requirement_id=requirement_id,
                                registration_id=registration.id,
                                class_id=registration.lop_id,
                                room_id=room.id,
                                room_is_thuc_hanh=room.is_thuc_hanh,
                                room_capacity=room.capacity,
                                required_capacity=required_capacity,
                                day_of_week=day_of_week,
                                time_slot_id=slot.id,
                                start_time=slot.start_time,
                                end_time=slot.end_time,
                            )
                        )

    if registrations_without_rooms:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể xếp lịch tại cơ sở đã chọn:\n"
            + "\n".join(
                f"- {registration_label(registration)}: {reason} "
                f"(cần {registration.so_luong} chỗ)."
                for registration, reason in registrations_without_rooms
            ),
        )

    solver_status, selected_candidates, objective_value, infeasible_requirements = (
        solve_weekly_schedule(
            meeting_requirements,
            candidates,
            fixed_schedule_data,
            allocation_start_date,
            semester.end_date,
        )
    )
    if solver_status == cp_model.INFEASIBLE:
        requirement_by_id = {item.id: item for item in meeting_requirements}
        diagnostic = []
        for requirement_id in infeasible_requirements:
            requirement = requirement_by_id.get(requirement_id)
            registration = (
                registrations_by_id.get(requirement.registration_id)
                if requirement is not None
                else None
            )
            if requirement is not None and registration is not None:
                meeting_type = "thực hành" if requirement.is_thuc_hanh else "lý thuyết"
                diagnostic.append(
                    f"- {registration_label(registration)} ({meeting_type})"
                )
        if not diagnostic:
            diagnostic = [
                f"- {registration_label(registration)}"
                for registration in pending_registrations
            ]
        diagnostic = diagnostic[:20]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Không thể xếp lịch cố định hằng tuần tại cơ sở {campus.name} với ca, phòng "
                "và các lịch hiện có. Nhóm đăng ký/buổi cần kiểm tra:\n"
                + "\n".join(diagnostic)
                + "\nKiểm tra số phòng đủ sức chứa, phòng thực hành, ca học và các lịch cố định "
                "đang chiếm phòng."
                + "\nChưa có lịch nào bị thay đổi."
            ),
        )
    if solver_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Bộ tối ưu chưa tìm được phương án trong thời gian cho phép. Chưa có lịch nào bị thay đổi.",
        )

    new_schedules = []
    allocations = []
    for candidate in selected_candidates:
        registration = registrations_by_id[candidate.registration_id]
        room = next(room for room in rooms if room.id == candidate.room_id)
        slot = fixed_slot_by_id.get(candidate.time_slot_id)
        if slot is None:
            slot = next(item for item in time_slots if item.id == candidate.time_slot_id)
        first_meeting_date = _first_weekday(
            allocation_start_date,
            semester.end_date,
            candidate.day_of_week,
        )
        previous = preserved_schedule_by_registration.get(registration.id)
        new_schedules.append(
            ThoiKhoaBieu(
                dang_ky_mon_hoc_id=registration.id,
                phong_hoc_id=room.id,
                hoc_ky_id=semester.id,
                ca_hoc_id=slot.id,
                day_of_week=candidate.day_of_week,
                start_date=allocation_start_date,
                end_date=semester.end_date,
                teacher_name=(
                    previous.teacher_name
                    if previous is not None
                    else teacher_by_registration.get(registration.id) or None
                ),
                is_thuc_hanh=candidate.room_is_thuc_hanh,
            )
        )
        meeting_counts = {
            "theory": _weekday_count(
                allocation_start_date,
                semester.end_date,
                candidate.day_of_week,
            )
            if not candidate.room_is_thuc_hanh
            else 0,
            "practice": _weekday_count(
                allocation_start_date,
                semester.end_date,
                candidate.day_of_week,
            )
            if candidate.room_is_thuc_hanh
            else 0,
        }
        allocations.append(
            {
                "registration_id": registration.id,
                "class_id": registration.lop_id,
                "subject_id": registration.mon_id,
                "day_of_week": candidate.day_of_week,
                "date": first_meeting_date.isoformat(),
                "start_date": allocation_start_date.isoformat(),
                "end_date": semester.end_date.isoformat(),
                "time_slot_id": slot.id,
                "room_id": room.id,
                "room_name": room.name,
                "campus_id": campus.id,
                "campus_name": campus.name,
                "is_thuc_hanh": candidate.room_is_thuc_hanh,
                "meeting_counts": meeting_counts,
            }
        )

    try:
        allocated_room_ids = {schedule.phong_hoc_id for schedule in new_schedules}
        actual_selected_campus_rooms = {
            room.id: room
            for room in db.query(PhongHoc)
            .filter(
                PhongHoc.id.in_(allocated_room_ids),
                PhongHoc.campus_id == campus.id,
            )
            .all()
        } if allocated_room_ids else {}
        if allocated_room_ids != set(actual_selected_campus_rooms):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Không thể đảm bảo tất cả phòng thuộc cơ sở đã chọn. "
                    "Dữ liệu phòng có thể vừa thay đổi; vui lòng tải lại và thử lại."
                ),
            )
        for schedule in new_schedules:
            room = actual_selected_campus_rooms[schedule.phong_hoc_id]
            registration = registrations_by_id[schedule.dang_ky_mon_hoc_id]
            if (
                room.is_thuc_hanh != schedule.is_thuc_hanh
                or room.capacity is None
                or room.capacity < registration.so_luong
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Sức chứa hoặc loại phòng đã thay đổi trong lúc tối ưu. Chưa có lịch nào bị thay đổi.",
                )
        for schedule in schedules_to_replace:
            db.delete(schedule)
        db.add_all([*historical_schedule_copies, *new_schedules])
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    return {
        "mode": data.mode,
        "campus_id": campus.id,
        "campus_name": campus.name,
        "scheduled_count": len(new_schedules),
        "scheduled_meeting_count": sum(
            allocation["meeting_counts"]["theory"]
            + allocation["meeting_counts"]["practice"]
            for allocation in allocations
        ),
        "replaced_count": len(schedules_to_replace),
        "objective_value": objective_value,
        "recurring_weekly": True,
        "allocations": allocations,
    }


@router.post("/room-allocation")
def suggest_room_allocation(
    data: RoomAllocationRequest,
    _: object = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.start_date > data.end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
        )
    semester = db.query(HocKy).filter(HocKy.id == data.hoc_ky_id).first()
    if semester is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy học kỳ (id={data.hoc_ky_id}).",
        )
    if (
        data.start_date < semester.start_date
        or data.end_date > semester.end_date
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Khoảng ngày phân bổ phải nằm trong học kỳ đã chọn.",
        )
    try:
        _first_weekday(data.start_date, data.end_date, data.day_of_week)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Khoảng ngày không có lần học nào vào thứ đã chọn.",
        ) from exc
    time_slot = db.query(CaHoc).filter(CaHoc.id == data.ca_hoc_id).first()
    if time_slot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy ca học (id={data.ca_hoc_id}).",
        )
    if time_slot.start_time >= time_slot.end_time:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ca học có khung giờ không hợp lệ.",
        )
    registration = (
        db.query(DangKyMonHoc)
        .filter(DangKyMonHoc.id == data.dang_ky_mon_hoc_id)
        .first()
    )
    if registration is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy đăng ký môn học (id={data.dang_ky_mon_hoc_id}).",
        )
    if registration.hoc_ky_id != semester.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Đăng ký môn học không thuộc học kỳ đã chọn.",
        )
    subject = db.query(MonHoc).filter(MonHoc.id == registration.mon_id).first()
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy môn học (id={registration.mon_id}).",
        )
    subject_has_practice = (
        subject.is_thuc_hanh or determine_is_thuc_hanh(subject.code)
    )
    if data.is_thuc_hanh and not subject_has_practice:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Môn học chưa được cấu hình có buổi thực hành.",
        )
    if data.campus_id is not None:
        campus = db.query(Campus).filter(Campus.id == data.campus_id).first()
        if campus is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy cơ sở đào tạo (id={data.campus_id}).",
            )
    class_size = registration.so_luong
    candidate_query = db.query(PhongHoc)
    if data.campus_id is not None:
        candidate_query = candidate_query.filter(
            PhongHoc.campus_id == data.campus_id
        )
    candidates = candidate_query.order_by(PhongHoc.capacity, PhongHoc.name).all()
    available_rooms = []
    excluded_rooms = []
    for room in candidates:
        reasons = []
        if room.capacity is None or room.capacity < class_size:
            reasons.append(
                f"Sức chứa không đủ (cần {class_size}, phòng có {room.capacity or 0})."
            )
        if room.is_thuc_hanh != data.is_thuc_hanh:
            reasons.append(
                "Loại phòng không phù hợp với buổi "
                f"{'thực hành' if data.is_thuc_hanh else 'lý thuyết'}."
            )
        if reasons:
            excluded_rooms.append(
                {
                    "id": room.id,
                    "name": room.name,
                    "campus_id": room.campus_id,
                    "reasons": reasons,
                }
            )
            continue

        values = {
            **data.model_dump(),
            "phong_hoc_id": room.id,
        }
        conflicts = [
            conflict
            for conflict in find_conflicts(db, values)
            if "room" in conflict["conflict_types"]
        ]
        if conflicts:
            excluded_rooms.append(
                {
                    "id": room.id,
                    "name": room.name,
                    "campus_id": room.campus_id,
                    "reasons": ["Phòng đã có lịch khác trong cùng thời gian."],
                }
            )
        else:
            available_rooms.append(
                {
                    "id": room.id,
                    "name": room.name,
                    "building": room.building,
                    "capacity": room.capacity,
                    "is_thuc_hanh": room.is_thuc_hanh,
                    "campus_id": room.campus_id,
                }
            )
    return {
        "registration_id": registration.id,
        "class_id": registration.lop_id,
        "required_capacity": class_size,
        "suggested_room": available_rooms[0] if available_rooms else None,
        "available_rooms": available_rooms,
        "excluded_rooms": excluded_rooms,
        "message": (
            "Đã tìm thấy phòng phù hợp."
            if available_rooms
            else "Không tìm thấy phòng phù hợp; xem excluded_rooms để biết lý do."
        ),
    }
