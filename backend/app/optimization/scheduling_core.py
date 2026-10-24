from dataclasses import dataclass
from datetime import date, time, timedelta
from math import ceil

from ortools.sat.python import cp_model


@dataclass(frozen=True)
class MeetingRequirement:
    id: str
    registration_id: int
    is_thuc_hanh: bool


@dataclass(frozen=True)
class ScheduleCandidate:
    requirement_id: str
    registration_id: int
    class_id: int | None
    room_id: int
    room_is_thuc_hanh: bool
    room_capacity: int
    required_capacity: int
    day_of_week: int
    time_slot_id: int
    start_time: time
    end_time: time


@dataclass(frozen=True)
class FixedSchedule:
    room_id: int
    class_id: int | None
    day_of_week: int
    start_date: date
    end_date: date
    start_time: time
    end_time: time


@dataclass(frozen=True)
class CandidateRoom:
    id: int
    capacity: int


@dataclass(frozen=True)
class ScheduleSolveResult:
    status: int
    selected_candidates: list[ScheduleCandidate]
    unscheduled_requirement_ids: list[str]
    objective_value: float
    best_objective_bound: float
    relative_gap: float


@dataclass
class BuiltWeeklyModel:
    model: cp_model.CpModel
    candidate_vars: dict[ScheduleCandidate, cp_model.IntVar]
    served_vars: dict[str, cp_model.IntVar]
    objectives: dict[str, cp_model.LinearExpr]
    balance_terms: dict[
        str,
        list[tuple[cp_model.LinearExpr, list[cp_model.IntVar]]],
    ]


def weekday_occurs(start_date: date, end_date: date, day_of_week: int) -> bool:
    if start_date > end_date:
        return False
    first_day = start_date + timedelta(
        days=(day_of_week - 2 - start_date.weekday()) % 7
    )
    return first_day <= end_date


def _add_non_overlapping_constraints(
    model: cp_model.CpModel,
    candidates: list[tuple[time, time, cp_model.IntVar]],
) -> None:
    boundaries = sorted(
        {
            boundary
            for start_time, end_time, _ in candidates
            for boundary in (start_time, end_time)
        }
    )
    for segment_start, segment_end in zip(boundaries, boundaries[1:]):
        overlapping = [
            variable
            for start_time, end_time, variable in candidates
            if start_time < segment_end and segment_start < end_time
        ]
        if len(overlapping) > 1:
            model.add_at_most_one(overlapping)


def _fixed_schedule_overlaps(
    candidate: ScheduleCandidate,
    fixed: FixedSchedule,
    start_date: date,
    end_date: date,
) -> bool:
    if fixed.day_of_week != candidate.day_of_week:
        return False
    overlap_start = max(start_date, fixed.start_date)
    overlap_end = min(end_date, fixed.end_date)
    if not weekday_occurs(overlap_start, overlap_end, candidate.day_of_week):
        return False
    return (
        candidate.start_time < fixed.end_time
        and fixed.start_time < candidate.end_time
    )


def _fixed_schedule_blocks_slot(
    fixed_schedules: list[FixedSchedule],
    day_of_week: int,
    start_time: time,
    end_time: time,
    start_date: date,
    end_date: date,
) -> bool:
    return any(
        fixed.day_of_week == day_of_week
        and weekday_occurs(
            max(start_date, fixed.start_date),
            min(end_date, fixed.end_date),
            day_of_week,
        )
        and start_time < fixed.end_time
        and fixed.start_time < end_time
        for fixed in fixed_schedules
    )


def select_candidate_rooms(
    rooms: list[CandidateRoom],
    required_capacity: int,
    class_id: int,
    fixed_schedules: list[FixedSchedule],
    weekdays: list[int],
    time_slots: list[tuple[time, time]],
    start_date: date,
    end_date: date,
    max_rooms: int = 12,
    best_capacity_rooms: int = 8,
) -> list[int]:
    """Keep the best-fitting rooms plus flexible alternatives for each meeting."""
    fixed_by_room_day: dict[tuple[int, int], list[FixedSchedule]] = {}
    fixed_by_class_day: dict[tuple[int, int], list[FixedSchedule]] = {}
    for fixed in fixed_schedules:
        fixed_by_room_day.setdefault(
            (fixed.room_id, fixed.day_of_week), []
        ).append(fixed)
        if fixed.class_id is not None:
            fixed_by_class_day.setdefault(
                (fixed.class_id, fixed.day_of_week), []
            ).append(fixed)

    ranked_rooms = []
    for room in rooms:
        available_options = sum(
            not _fixed_schedule_blocks_slot(
                [
                    *fixed_by_room_day.get((room.id, day), []),
                    *fixed_by_class_day.get((class_id, day), []),
                ],
                day,
                start_time,
                end_time,
                start_date,
                end_date,
            )
            for day in weekdays
            for start_time, end_time in time_slots
        )
        if available_options:
            ranked_rooms.append((room, available_options))

    best_fit = sorted(
        ranked_rooms,
        key=lambda item: (
            item[0].capacity - required_capacity,
            -item[1],
            item[0].id,
        ),
    )
    best_fit_groups: dict[
        tuple[int, int],
        list[tuple[CandidateRoom, int]],
    ] = {}
    for item in best_fit:
        rank = (item[0].capacity - required_capacity, -item[1])
        best_fit_groups.setdefault(rank, []).append(item)
    rotated_best_fit = []
    for group in best_fit_groups.values():
        offset = class_id % len(group)
        rotated_best_fit.extend(group[offset:] + group[:offset])

    selected = rotated_best_fit[: min(best_capacity_rooms, max_rooms)]
    selected_ids = {room.id for room, _ in selected}
    flexible = sorted(
        (item for item in ranked_rooms if item[0].id not in selected_ids),
        key=lambda item: (
            -item[1],
            item[0].capacity - required_capacity,
            item[0].id,
        ),
    )
    flexible_groups: dict[
        tuple[int, int],
        list[tuple[CandidateRoom, int]],
    ] = {}
    for item in flexible:
        rank = (-item[1], item[0].capacity - required_capacity)
        flexible_groups.setdefault(rank, []).append(item)
    rotated_flexible = []
    for group in flexible_groups.values():
        offset = class_id % len(group)
        rotated_flexible.extend(group[offset:] + group[:offset])
    selected.extend(rotated_flexible[: max_rooms - len(selected)])
    return [room.id for room, _ in selected]


def build_weekly_model(
    requirements: list[MeetingRequirement],
    candidates: list[ScheduleCandidate],
    fixed_schedules: list[FixedSchedule],
    start_date: date,
    end_date: date,
) -> BuiltWeeklyModel:
    """Build a soft-coverage model; each requirement may remain unassigned."""
    model = cp_model.CpModel()
    candidate_vars: dict[ScheduleCandidate, cp_model.IntVar] = {}
    candidates_by_requirement: dict[str, list[cp_model.IntVar]] = {
        requirement.id: [] for requirement in requirements
    }
    by_room_day: dict[tuple[int, int], list[tuple[time, time, cp_model.IntVar]]] = {}
    by_class_day: dict[tuple[int, int], list[tuple[time, time, cp_model.IntVar]]] = {}
    by_day: dict[int, list[cp_model.IntVar]] = {}
    by_day_slot: dict[tuple[int, int], list[cp_model.IntVar]] = {}
    by_room: dict[int, list[cp_model.IntVar]] = {}
    served_vars: dict[str, cp_model.IntVar] = {}
    requirement_types = {
        requirement.id: requirement.is_thuc_hanh for requirement in requirements
    }
    fixed_by_room_day: dict[tuple[int, int], list[FixedSchedule]] = {}
    fixed_by_class_day: dict[tuple[int, int], list[FixedSchedule]] = {}
    for fixed in fixed_schedules:
        fixed_by_room_day.setdefault(
            (fixed.room_id, fixed.day_of_week), []
        ).append(fixed)
        if fixed.class_id is not None:
            fixed_by_class_day.setdefault(
                (fixed.class_id, fixed.day_of_week), []
            ).append(fixed)

    for index, candidate in enumerate(candidates):
        if candidate.requirement_id not in requirement_types:
            continue
        if candidate.room_is_thuc_hanh != requirement_types[candidate.requirement_id]:
            continue
        if candidate.room_capacity < candidate.required_capacity:
            continue
        if not weekday_occurs(start_date, end_date, candidate.day_of_week):
            continue

        relevant_fixed = [
            *fixed_by_room_day.get((candidate.room_id, candidate.day_of_week), []),
            *(
                fixed_by_class_day.get(
                    (candidate.class_id, candidate.day_of_week), []
                )
                if candidate.class_id is not None
                else []
            ),
        ]
        if any(
            _fixed_schedule_overlaps(candidate, fixed, start_date, end_date)
            and (
                fixed.room_id == candidate.room_id
                or (
                    candidate.class_id is not None
                    and fixed.class_id == candidate.class_id
                )
            )
            for fixed in relevant_fixed
        ):
            continue

        variable = model.new_bool_var(f"candidate_{index}")
        candidate_vars[candidate] = variable
        candidates_by_requirement[candidate.requirement_id].append(variable)
        by_room_day.setdefault(
            (candidate.room_id, candidate.day_of_week), []
        ).append((candidate.start_time, candidate.end_time, variable))
        if candidate.class_id is not None:
            by_class_day.setdefault(
                (candidate.class_id, candidate.day_of_week), []
            ).append((candidate.start_time, candidate.end_time, variable))
        by_day.setdefault(candidate.day_of_week, []).append(variable)
        by_day_slot.setdefault(
            (candidate.day_of_week, candidate.time_slot_id), []
        ).append(variable)
        by_room.setdefault(candidate.room_id, []).append(variable)

    for requirement in requirements:
        requirement_candidates = candidates_by_requirement[requirement.id]
        served = model.new_bool_var(f"served_{requirement.id}")
        model.add(sum(requirement_candidates) == served)
        served_vars[requirement.id] = served

    for grouped_candidates in by_room_day.values():
        _add_non_overlapping_constraints(model, grouped_candidates)
    for grouped_candidates in by_class_day.values():
        _add_non_overlapping_constraints(model, grouped_candidates)

    day_balance_terms = _add_load_balance_terms(
        model,
        by_day,
        "day",
        len(requirements),
    )
    day_slot_balance_terms = _add_load_balance_terms(
        model,
        by_day_slot,
        "day_slot",
        len(requirements),
    )
    for terms in (day_balance_terms, day_slot_balance_terms):
        for load, indicators in terms:
            for threshold, indicator in enumerate(indicators, start=1):
                model.add(load < threshold).only_enforce_if(indicator.Not())
    _add_room_symmetry_breaking(
        model,
        by_room,
        candidates,
        fixed_schedules,
    )

    objective_expressions = {
        "coverage": sum(served_vars.values()),
        "sunday": sum(
            variable
            for candidate, variable in candidate_vars.items()
            if candidate.day_of_week == 8
        ),
        "day_balance": sum(
            (2 * threshold - 1) * indicator
            for _, indicators in day_balance_terms
            for threshold, indicator in enumerate(indicators, start=1)
        ),
        "day_slot_balance": sum(
            (2 * threshold - 1) * indicator
            for _, indicators in day_slot_balance_terms
            for threshold, indicator in enumerate(indicators, start=1)
        ),
        "room_cost": sum(
            (candidate.room_capacity - candidate.required_capacity) * variable
            for candidate, variable in candidate_vars.items()
        ),
    }

    return BuiltWeeklyModel(
        model=model,
        candidate_vars=candidate_vars,
        served_vars=served_vars,
        objectives=objective_expressions,
        balance_terms={
            "day_balance": day_balance_terms,
            "day_slot_balance": day_slot_balance_terms,
        },
    )


def _add_load_balance_terms(
    model: cp_model.CpModel,
    loads: dict[object, list[cp_model.IntVar]],
    name: str,
    max_load: int,
) -> list[tuple[cp_model.LinearExpr, list[cp_model.IntVar]]]:
    terms = []
    for key, assignments in loads.items():
        load = sum(assignments)
        indicators = [
            model.new_bool_var(f"{name}_{key}_load_{threshold}")
            for threshold in range(
                1,
                min(len(assignments), max_load) + 1,
            )
        ]
        terms.append((load, indicators))
    return terms


def _add_room_symmetry_breaking(
    model: cp_model.CpModel,
    by_room: dict[int, list[cp_model.IntVar]],
    candidates: list[ScheduleCandidate],
    fixed_schedules: list[FixedSchedule],
) -> None:
    room_attributes: dict[int, tuple[bool, int]] = {}
    candidate_signatures: dict[int, list[tuple[object, ...]]] = {}
    for candidate in candidates:
        room_attributes[candidate.room_id] = (
            candidate.room_is_thuc_hanh,
            candidate.room_capacity,
        )
        candidate_signatures.setdefault(candidate.room_id, []).append(
            (
                candidate.requirement_id,
                candidate.required_capacity,
                candidate.day_of_week,
                candidate.time_slot_id,
                candidate.start_time,
                candidate.end_time,
            )
        )
    fixed_room_signatures: dict[int, tuple[tuple[object, ...], ...]] = {}
    for room_id in room_attributes:
        fixed_room_signatures[room_id] = tuple(
            sorted(
                (
                    fixed.day_of_week,
                    fixed.start_date,
                    fixed.end_date,
                    fixed.start_time,
                    fixed.end_time,
                )
                for fixed in fixed_schedules
                if fixed.room_id == room_id
            )
        )

    equivalent_rooms: dict[
        tuple[
            bool,
            int,
            tuple[tuple[object, ...], ...],
            tuple[tuple[object, ...], ...],
        ],
        list[int],
    ] = {}
    for room_id, (is_practice, capacity) in room_attributes.items():
        key = (
            is_practice,
            capacity,
            fixed_room_signatures[room_id],
            tuple(sorted(candidate_signatures[room_id])),
        )
        equivalent_rooms.setdefault(key, []).append(room_id)

    for room_ids in equivalent_rooms.values():
        room_ids.sort()
        for first_room, next_room in zip(room_ids, room_ids[1:]):
            model.add(
                sum(by_room.get(first_room, []))
                >= sum(by_room.get(next_room, []))
            )


def _greedy_weekly_assignment(
    requirements: list[MeetingRequirement],
    candidate_vars: dict[ScheduleCandidate, cp_model.IntVar],
) -> list[ScheduleCandidate]:
    candidates_by_requirement: dict[str, list[ScheduleCandidate]] = {
        requirement.id: [] for requirement in requirements
    }
    for candidate in candidate_vars:
        candidates_by_requirement[candidate.requirement_id].append(candidate)

    assigned: list[ScheduleCandidate] = []
    day_load: dict[int, int] = {}
    day_slot_load: dict[tuple[int, int], int] = {}
    room_load: dict[int, int] = {}
    ordered_requirements = sorted(
        requirements,
        key=lambda requirement: (
            len(candidates_by_requirement[requirement.id]),
            requirement.id,
        ),
    )
    for requirement in ordered_requirements:
        feasible = [
            candidate
            for candidate in candidates_by_requirement[requirement.id]
            if not any(
                candidate.day_of_week == existing.day_of_week
                and candidate.start_time < existing.end_time
                and existing.start_time < candidate.end_time
                and (
                    candidate.room_id == existing.room_id
                    or (
                        candidate.class_id is not None
                        and candidate.class_id == existing.class_id
                    )
                )
                for existing in assigned
            )
        ]
        if not feasible:
            continue
        selected = min(
            feasible,
            key=lambda candidate: (
                candidate.day_of_week == 8,
                day_load.get(candidate.day_of_week, 0),
                day_slot_load.get(
                    (candidate.day_of_week, candidate.time_slot_id),
                    0,
                ),
                candidate.room_capacity - candidate.required_capacity,
                room_load.get(candidate.room_id, 0),
                candidate.day_of_week,
                candidate.time_slot_id,
                candidate.room_id,
            ),
        )
        assigned.append(selected)
        day_load[selected.day_of_week] = (
            day_load.get(selected.day_of_week, 0) + 1
        )
        slot_key = (selected.day_of_week, selected.time_slot_id)
        day_slot_load[slot_key] = day_slot_load.get(slot_key, 0) + 1
        room_load[selected.room_id] = room_load.get(selected.room_id, 0) + 1
    return assigned


def solve_weekly_schedule(
    requirements: list[MeetingRequirement],
    candidates: list[ScheduleCandidate],
    fixed_schedules: list[FixedSchedule],
    start_date: date,
    end_date: date,
    max_time_seconds: int = 30,
) -> ScheduleSolveResult:
    built_model = build_weekly_model(
        requirements,
        candidates,
        fixed_schedules,
        start_date,
        end_date,
    )
    if not requirements:
        return ScheduleSolveResult(
            status=cp_model.OPTIMAL,
            selected_candidates=[],
            unscheduled_requirement_ids=[],
            objective_value=0,
            best_objective_bound=0,
            relative_gap=0,
        )

    model = built_model.model
    candidate_vars = built_model.candidate_vars
    objectives = built_model.objectives
    balance_terms = built_model.balance_terms
    previous_solution = _greedy_weekly_assignment(
        requirements,
        candidate_vars,
    )
    previous_candidate_ids = set(previous_solution)
    previous_values = {
        variable.index: int(candidate in previous_candidate_ids)
        for candidate, variable in candidate_vars.items()
    }
    scheduled_requirement_ids = {
        candidate.requirement_id for candidate in previous_solution
    }
    previous_values.update(
        {
            variable.index: int(requirement_id in scheduled_requirement_ids)
            for requirement_id, variable in built_model.served_vars.items()
        }
    )
    previous_status = (
        cp_model.FEASIBLE
        if previous_solution or not requirements
        else cp_model.UNKNOWN
    )
    stages = (
        ("coverage", True, 0, 0.4),
        ("sunday", False, 0, 0.15),
        ("day_balance", False, max(1, ceil(len(requirements) * 0.01)), 0.15),
        (
            "day_slot_balance",
            False,
            max(1, ceil(len(requirements) * 0.01)),
            0.15,
        ),
        ("room_cost", False, 0, 0.15),
    )
    elapsed = 0.0
    last_solved_stage: str | None = None
    all_stages_optimal = True

    for stage_name, maximize, tolerance, time_share in stages:
        remaining = max_time_seconds - elapsed
        if remaining <= 0:
            all_stages_optimal = False
            break
        model.maximize(objectives[stage_name]) if maximize else model.minimize(
            objectives[stage_name]
        )
        model.clear_hints()
        for variable in [
            *candidate_vars.values(),
            *built_model.served_vars.values(),
        ]:
            if variable.index in previous_values:
                model.add_hint(variable, previous_values[variable.index])

        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = min(
            max_time_seconds * time_share,
            remaining,
        )
        solver.parameters.num_workers = 8
        solver.parameters.random_seed = 42
        solver_status = solver.solve(model)
        elapsed += solver.wall_time
        if solver_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            all_stages_optimal = False
            break

        stage_value = int(round(solver.objective_value))
        if stage_name == "coverage":
            model.add(objectives[stage_name] == stage_value)
        else:
            model.add(
                objectives[stage_name]
                <= stage_value + tolerance
            )
        if stage_name in balance_terms:
            for load, indicators in balance_terms[stage_name]:
                for threshold, indicator in enumerate(indicators, start=1):
                    model.add(load >= threshold).only_enforce_if(indicator)
        if solver_status != cp_model.OPTIMAL:
            all_stages_optimal = False

        previous_solution = [
            candidate
            for candidate, variable in candidate_vars.items()
            if solver.boolean_value(variable)
        ]
        previous_values = {
            variable.index: solver.boolean_value(variable)
            for variable in [
                *candidate_vars.values(),
                *built_model.served_vars.values(),
            ]
        }
        previous_status = solver_status
        last_solved_stage = stage_name

    status = cp_model.OPTIMAL if all_stages_optimal else cp_model.FEASIBLE
    selected_ids = {
        candidate.requirement_id for candidate in previous_solution
    }
    unscheduled = [
        requirement.id
        for requirement in requirements
        if requirement.id not in selected_ids
    ]
    objective_value = float(
        sum(
            candidate.room_capacity - candidate.required_capacity
            for candidate in previous_solution
        )
    )
    scheduled_requirement_ids = {
        candidate.requirement_id for candidate in previous_solution
    }
    lower_bound = sum(
        min(
            candidate.room_capacity - candidate.required_capacity
            for candidate in candidate_vars
            if candidate.requirement_id == requirement_id
        )
        for requirement_id in scheduled_requirement_ids
    )
    best_objective_bound = (
        min(objective_value, solver.best_objective_bound)
        if last_solved_stage == "room_cost"
        else float(lower_bound)
    )
    gap = max(0.0, objective_value - best_objective_bound) / max(
        1.0,
        objective_value,
    )
    return ScheduleSolveResult(
        status=status if previous_status != cp_model.UNKNOWN else cp_model.UNKNOWN,
        selected_candidates=previous_solution,
        unscheduled_requirement_ids=unscheduled,
        objective_value=objective_value,
        best_objective_bound=best_objective_bound,
        relative_gap=gap,
    )
