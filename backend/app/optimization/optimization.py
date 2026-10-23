from collections import defaultdict
from datetime import date, time, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from ortools.sat.python import cp_model

from app.schedules.schedules import find_conflicts
from db.database import (
    CaHoc,
    Campus,
    DangKyMonHoc,
    HocKy,
    Lop,
    MonHoc,
    PhongHoc,
    ThoiKhoaBieu,
    get_db,
)

router = APIRouter(prefix="/optimization", tags=["Tối ưu"])
MAX_CANDIDATE_ASSIGNMENTS = 100_000


class RoomAllocationRequest(BaseModel):
    dang_ky_mon_hoc_id: int
    hoc_ky_id: int
    ca_hoc_id: int
    day_of_week: int = Field(ge=2, le=8)
    start_date: date
    end_date: date
    is_thuc_hanh: bool = False


class AutomaticScheduleRequest(BaseModel):
    hoc_ky_id: int
    campus_id: int
    mode: Literal["missing", "all"] = "missing"
    practice_registration_ids: list[int] = Field(default_factory=list)
    practice_percentage: int = Field(default=50, ge=1, le=99)


def _has_weekday_between(start_date: date, end_date: date, day_of_week: int) -> bool:
    first_day = start_date + timedelta(days=(day_of_week - 2 - start_date.weekday()) % 7)
    return first_day <= end_date


def _practice_week_indexes(week_count: int, percentage: int) -> set[int]:
    if week_count <= 0:
        return set()
    if week_count == 1:
        return {0}
    practice_count = max(
        1,
        min(week_count - 1, (week_count * percentage + 50) // 100),
    )
    return {
        (practice_index * week_count) // practice_count
        for practice_index in range(practice_count)
    }


def _has_complete_schedule_coverage(
    schedules: list[ThoiKhoaBieu],
    start_date: date,
    end_date: date,
) -> bool:
    relevant_schedules = [
        schedule for schedule in schedules if schedule.end_date >= start_date
    ]
    if any(schedule.start_date < schedule.end_date for schedule in relevant_schedules):
        return True

    expected_week_starts = set()
    week_start = start_date - timedelta(days=start_date.weekday())
    while week_start <= end_date:
        expected_week_starts.add(week_start)
        week_start += timedelta(days=7)
    scheduled_week_starts = {
        schedule.start_date - timedelta(days=schedule.start_date.weekday())
        for schedule in relevant_schedules
        if start_date <= schedule.start_date <= end_date
    }
    if not expected_week_starts.issubset(scheduled_week_starts):
        return False
    if any(schedule.is_thuc_hanh for schedule in relevant_schedules):
        return (
            any(schedule.is_thuc_hanh for schedule in relevant_schedules)
            and any(not schedule.is_thuc_hanh for schedule in relevant_schedules)
        )
    return True


def _add_non_overlapping_constraints(
    model: cp_model.CpModel,
    groups: dict[
        tuple[int | str, date],
        list[tuple[time, time, int, cp_model.IntVar]],
    ],
) -> None:
    for candidates in groups.values():
        boundaries = sorted(
            {boundary for start_time, end_time, _, _ in candidates for boundary in (start_time, end_time)}
        )
        for segment_start, segment_end in zip(boundaries, boundaries[1:]):
            overlapping = [
                variable
                for start_time, end_time, _, variable in candidates
                if start_time < segment_end and segment_start < end_time
            ]
            if len(overlapping) > 1:
                model.add_at_most_one(overlapping)


@router.post("/schedule")
def automatically_schedule_semester(
    data: AutomaticScheduleRequest,
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

    registrations = (
        db.query(DangKyMonHoc)
        .filter(
            DangKyMonHoc.hoc_ky_id == semester.id,
        )
        .order_by(DangKyMonHoc.id)
        .all()
    )
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
    schedules_by_registration: dict[int, list[ThoiKhoaBieu]] = defaultdict(list)
    for schedule in existing_target_schedules:
        if (
            existing_room_campuses.get(schedule.phong_hoc_id) == campus.id
            and schedule.end_date >= allocation_start_date
        ):
            schedules_by_registration[schedule.dang_ky_mon_hoc_id].append(schedule)
    scheduled_registration_ids = {
        registration_id
        for registration_id, registration_schedules in schedules_by_registration.items()
        if _has_complete_schedule_coverage(
            registration_schedules,
            allocation_start_date,
            semester.end_date,
        )
    }
    if data.mode == "missing":
        pending_registrations = [
            registration
            for registration in registrations
            if registration.id not in scheduled_registration_ids
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
        schedules_to_replace = [
            schedule
            for schedule in existing_target_schedules
            if schedule.end_date >= allocation_start_date
        ]

    if not pending_registrations:
        return {
            "mode": data.mode,
            "campus_id": campus.id,
            "campus_name": campus.name,
            "scheduled_count": 0,
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

    pending_ids = {registration.id for registration in pending_registrations}
    practice_ids = set(data.practice_registration_ids)
    if practice_ids - pending_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Danh sách môn thực hành phải thuộc các đăng ký đang được xếp lịch.",
        )

    time_slots = db.query(CaHoc).order_by(CaHoc.start_time, CaHoc.id).all()
    rooms = (
        db.query(PhongHoc)
        .filter(PhongHoc.campus_id == campus.id)
        .order_by(PhongHoc.capacity, PhongHoc.name)
        .all()
    )
    if not time_slots:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Chưa có ca học để tạo thời khóa biểu.",
        )
    class_names = {
        school_class.id: school_class.name
        for school_class in db.query(Lop)
        .filter(Lop.id.in_({registration.lop_id for registration in pending_registrations}))
        .all()
    }
    subject_names = {
        subject.id: subject.name
        for subject in db.query(MonHoc)
        .filter(MonHoc.id.in_({registration.mon_id for registration in pending_registrations}))
        .all()
    }

    def registration_label(registration: DangKyMonHoc) -> str:
        class_name = class_names.get(registration.lop_id, f"Lớp {registration.lop_id}")
        subject_name = subject_names.get(registration.mon_id, f"Môn {registration.mon_id}")
        return f"{subject_name} / {class_name}"

    replaced_schedule_ids = {schedule.id for schedule in schedules_to_replace}
    preserved_schedule_by_registration: dict[int, ThoiKhoaBieu] = {}
    for schedule in schedules_to_replace:
        preserved_schedule_by_registration.setdefault(
            schedule.dang_ky_mon_hoc_id,
            schedule,
        )
    fixed_schedule_query = db.query(ThoiKhoaBieu)
    if replaced_schedule_ids:
        fixed_schedule_query = fixed_schedule_query.filter(
            ThoiKhoaBieu.id.notin_(replaced_schedule_ids)
        )
    fixed_schedules = fixed_schedule_query.all()
    fixed_schedule_ids = {schedule.id for schedule in fixed_schedules}
    fixed_registration_ids = {
        schedule.dang_ky_mon_hoc_id for schedule in fixed_schedules
    }
    fixed_registrations = (
        db.query(DangKyMonHoc)
        .filter(DangKyMonHoc.id.in_(fixed_registration_ids))
        .all()
        if fixed_registration_ids
        else []
    )
    fixed_class_by_registration = {
        registration.id: registration.lop_id for registration in fixed_registrations
    }
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
    fixed_by_class_day: dict[tuple[int, int], list[ThoiKhoaBieu]] = defaultdict(list)
    fixed_by_room_day: dict[tuple[int, int], list[ThoiKhoaBieu]] = defaultdict(list)
    fixed_by_teacher_day: dict[tuple[str, int], list[ThoiKhoaBieu]] = defaultdict(list)
    for schedule in fixed_schedules:
        school_class_id = fixed_class_by_registration.get(schedule.dang_ky_mon_hoc_id)
        if school_class_id is not None:
            fixed_by_class_day[(school_class_id, schedule.day_of_week)].append(schedule)
        fixed_by_room_day[(schedule.phong_hoc_id, schedule.day_of_week)].append(schedule)
        teacher_name = (schedule.teacher_name or "").strip().casefold()
        if teacher_name:
            fixed_by_teacher_day[(teacher_name, schedule.day_of_week)].append(schedule)

    model = cp_model.CpModel()
    allocation_vars: dict[tuple[int, int, date, int, int], cp_model.IntVar] = {}
    allocation_details: dict[
        tuple[int, int, date, int, int],
        tuple[DangKyMonHoc, PhongHoc, CaHoc, date, bool, int],
    ] = {}
    by_class_date: dict[
        tuple[int, date],
        list[tuple[time, time, int, cp_model.IntVar]],
    ] = defaultdict(list)
    by_room_date: dict[
        tuple[int, date],
        list[tuple[time, time, int, cp_model.IntVar]],
    ] = defaultdict(list)
    by_teacher_date: dict[
        tuple[str, date],
        list[tuple[time, time, int, cp_model.IntVar]],
    ] = defaultdict(list)
    objective_terms = []
    registrations_without_rooms: list[tuple[DangKyMonHoc, str]] = []
    registrations_without_rooms_ids: set[int] = set()
    teacher_by_registration = {
        registration_id: (schedule.teacher_name or "").strip().casefold()
        for registration_id, schedule in preserved_schedule_by_registration.items()
    }
    week_dates: list[list[date]] = []
    current_week_start = allocation_start_date - timedelta(
        days=allocation_start_date.weekday()
    )
    while current_week_start <= semester.end_date:
        dates_in_week = [
            current_week_start + timedelta(days=day_offset)
            for day_offset in range(7)
            if allocation_start_date
            <= current_week_start + timedelta(days=day_offset)
            <= semester.end_date
        ]
        if dates_in_week:
            week_dates.append(dates_in_week)
        current_week_start += timedelta(days=7)

    registration_meeting_counts: dict[int, dict[str, int]] = {}

    for registration in pending_registrations:
        required_capacity = registration.so_luong
        eligible_rooms = [
            room
            for room in rooms
            if room.capacity is not None
            and room.capacity >= required_capacity
        ]
        practice_week_indexes = (
            _practice_week_indexes(len(week_dates), data.practice_percentage)
            if registration.id in practice_ids
            else set()
        )
        registration_week_types = [
            week_index in practice_week_indexes
            for week_index in range(len(week_dates))
        ]

        meeting_specs = [
            (week_index, is_practical)
            for week_index, is_practical in enumerate(registration_week_types)
        ]
        if registration.id in practice_ids and len(week_dates) == 1:
            meeting_specs.append((0, False))
        registration_meeting_counts[registration.id] = {
            "theory": sum(not is_practical for _, is_practical in meeting_specs),
            "practice": sum(is_practical for _, is_practical in meeting_specs),
        }

        for meeting_index, (week_index, is_practical) in enumerate(meeting_specs):
            eligible_rooms_for_meeting = [
                room
                for room in eligible_rooms
                if not is_practical or room.is_thuc_hanh
            ]
            if not eligible_rooms_for_meeting:
                if is_practical:
                    reason = "thiếu phòng thực hành đủ sức chứa"
                elif rooms:
                    reason = f"không có phòng tại cơ sở {campus.name} đủ sức chứa"
                else:
                    reason = f"cơ sở {campus.name} chưa có phòng học"
                if registration.id not in registrations_without_rooms_ids:
                    registrations_without_rooms.append((registration, reason))
                    registrations_without_rooms_ids.add(registration.id)
                continue

            choices = []
            for meeting_date in week_dates[week_index]:
                day_of_week = meeting_date.isoweekday() + 1
                for slot in time_slots:
                    for room in eligible_rooms_for_meeting:
                        if len(allocation_vars) >= MAX_CANDIDATE_ASSIGNMENTS:
                            raise HTTPException(
                                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=(
                                    "Số lượng phương án quá lớn để tối ưu an toàn. Hãy giảm số đăng ký, "
                                    "ca học hoặc phòng tham gia rồi thử lại."
                                ),
                            )
                        key = (
                            registration.id,
                            meeting_index,
                            meeting_date,
                            slot.id,
                            room.id,
                        )
                        variable = model.new_bool_var(
                            f"registration_{registration.id}_week_{week_index}_"
                            f"{'practice' if is_practical else 'theory'}_"
                            f"date_{meeting_date.isoformat()}_slot_{slot.id}_room_{room.id}"
                        )
                        allocation_vars[key] = variable
                        allocation_details[key] = (
                            registration,
                            room,
                            slot,
                            meeting_date,
                            is_practical,
                            day_of_week,
                        )
                        choices.append(variable)
                        by_class_date[(registration.lop_id, meeting_date)].append(
                            (slot.start_time, slot.end_time, registration.id, variable)
                        )
                        by_room_date[(room.id, meeting_date)].append(
                            (slot.start_time, slot.end_time, registration.id, variable)
                        )
                        teacher_name = teacher_by_registration.get(registration.id, "")
                        if teacher_name:
                            by_teacher_date[(teacher_name, meeting_date)].append(
                                (slot.start_time, slot.end_time, registration.id, variable)
                            )
                        room_penalty = room.capacity - required_capacity
                        if not is_practical and room.is_thuc_hanh:
                            room_penalty += 1
                        objective_terms.append(room_penalty * 100 * variable)

            if choices:
                model.add_exactly_one(choices)

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

    _add_non_overlapping_constraints(model, by_class_date)
    _add_non_overlapping_constraints(model, by_room_date)
    _add_non_overlapping_constraints(model, by_teacher_date)

    for key, variable in allocation_vars.items():
        registration, room, slot, meeting_date, _, day_of_week = allocation_details[key]
        relevant_fixed = (
            fixed_by_class_day[(registration.lop_id, day_of_week)]
            + fixed_by_room_day[(room.id, day_of_week)]
        )
        teacher_name = teacher_by_registration.get(registration.id, "")
        if teacher_name:
            relevant_fixed += fixed_by_teacher_day[(teacher_name, day_of_week)]
        for fixed_schedule in relevant_fixed:
            if not _has_weekday_between(
                max(meeting_date, fixed_schedule.start_date),
                min(meeting_date, fixed_schedule.end_date),
                day_of_week,
            ):
                continue
            fixed_slot = fixed_slot_by_id.get(fixed_schedule.ca_hoc_id)
            if fixed_slot is None or slot.start_time >= fixed_slot.end_time or fixed_slot.start_time >= slot.end_time:
                continue
            fixed_class_id = fixed_class_by_registration.get(
                fixed_schedule.dang_ky_mon_hoc_id
            )
            fixed_teacher_name = (fixed_schedule.teacher_name or "").strip().casefold()
            if (
                fixed_schedule.phong_hoc_id == room.id
                or fixed_class_id == registration.lop_id
                or (teacher_name and fixed_teacher_name == teacher_name)
            ):
                model.add(variable == 0)

    model.minimize(sum(objective_terms))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30
    solver.parameters.num_search_workers = 8
    solver.parameters.random_seed = 42
    solver_status = solver.Solve(model)
    if solver_status == cp_model.INFEASIBLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Không thể xếp lịch đầy đủ tại cơ sở {campus.name} do xung đột ca, "
                "thiếu phòng khả dụng hoặc lịch cố định. Các đăng ký cần kiểm tra:\n"
                + "\n".join(
                    f"- {registration_label(registration)}"
                    for registration in pending_registrations
                )
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
    for key, variable in allocation_vars.items():
        if not solver.BooleanValue(variable):
            continue
        registration, room, slot, meeting_date, is_practice, day_of_week = allocation_details[key]
        previous = preserved_schedule_by_registration.get(registration.id)
        new_schedules.append(
            ThoiKhoaBieu(
                dang_ky_mon_hoc_id=registration.id,
                phong_hoc_id=room.id,
                hoc_ky_id=semester.id,
                ca_hoc_id=slot.id,
                day_of_week=day_of_week,
                start_date=meeting_date,
                end_date=meeting_date,
                teacher_name=previous.teacher_name if previous else None,
                is_thuc_hanh=is_practice,
            )
        )
        allocations.append(
            {
                "registration_id": registration.id,
                "class_id": registration.lop_id,
                "subject_id": registration.mon_id,
                "day_of_week": day_of_week,
                "date": meeting_date.isoformat(),
                "time_slot_id": slot.id,
                "room_id": room.id,
                "room_name": room.name,
                "campus_id": campus.id,
                "campus_name": campus.name,
                "is_thuc_hanh": is_practice,
                "meeting_counts": registration_meeting_counts[registration.id],
            }
        )

    try:
        allocated_room_ids = {schedule.phong_hoc_id for schedule in new_schedules}
        actual_selected_campus_room_ids = {
            room.id
            for room in db.query(PhongHoc)
            .filter(
                PhongHoc.id.in_(allocated_room_ids),
                PhongHoc.campus_id == campus.id,
            )
            .all()
        } if allocated_room_ids else set()
        if allocated_room_ids != actual_selected_campus_room_ids:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Không thể đảm bảo tất cả phòng thuộc cơ sở đã chọn. "
                    "Dữ liệu phòng có thể vừa thay đổi; vui lòng tải lại và thử lại."
                ),
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
        "practice_percentage": data.practice_percentage,
        "objective_value": solver.ObjectiveValue(),
        "allocations": allocations,
    }


@router.post("/room-allocation")
def suggest_room_allocation(
    data: RoomAllocationRequest,
    db: Session = Depends(get_db),
):
    if data.start_date > data.end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.",
        )
    references = (
        (DangKyMonHoc, data.dang_ky_mon_hoc_id, "đăng ký môn học"),
        (HocKy, data.hoc_ky_id, "học kỳ"),
        (CaHoc, data.ca_hoc_id, "ca học"),
    )
    for model, identifier, label in references:
        if db.query(model.id).filter(model.id == identifier).first() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Không tìm thấy {label} (id={identifier}).",
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
    class_size = registration.so_luong
    candidate_query = db.query(PhongHoc).filter(PhongHoc.capacity >= class_size)
    if data.is_thuc_hanh:
        candidate_query = candidate_query.filter(PhongHoc.is_thuc_hanh.is_(True))
    candidates = candidate_query.order_by(PhongHoc.capacity, PhongHoc.name).all()
    available_rooms = []
    for room in candidates:
        values = {
            **data.model_dump(),
            "phong_hoc_id": room.id,
        }
        if not find_conflicts(db, values):
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
    }
