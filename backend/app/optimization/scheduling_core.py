from dataclasses import dataclass, field
from datetime import date, time, timedelta
from functools import lru_cache
from math import ceil
import os
from pathlib import Path
from typing import Iterable

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


@dataclass
class WeeklyAvailability:
    room_busy_masks: dict[tuple[int, int], int]
    class_busy_masks: dict[tuple[int, int], int]
    slot_masks: dict[int, int]
    _option_count_cache: dict[tuple[int, int, tuple[int, ...]], int] = field(
        default_factory=dict,
        init=False,
        repr=False,
    )
    _available_slots_cache: dict[tuple[int, int, int], list[int]] = field(
        default_factory=dict,
        init=False,
        repr=False,
    )

    @classmethod
    def build(
        cls,
        rooms: Iterable[CandidateRoom],
        class_ids: Iterable[int],
        fixed_schedules: list[FixedSchedule],
        weekdays: list[int],
        time_slots: list[tuple[time, time]],
        start_date: date,
        end_date: date,
    ) -> "WeeklyAvailability":
        room_ids = {room.id for room in rooms}
        class_id_set = set(class_ids)
        slot_masks = {
            index: 1 << index for index in range(len(time_slots))
        }
        room_busy_masks: dict[tuple[int, int], int] = {}
        class_busy_masks: dict[tuple[int, int], int] = {}
        for fixed in fixed_schedules:
            if (
                fixed.day_of_week not in weekdays
                or not weekday_occurs(
                    max(start_date, fixed.start_date),
                    min(end_date, fixed.end_date),
                    fixed.day_of_week,
                )
            ):
                continue
            slot_mask = 0
            for index, (start_time, end_time) in enumerate(time_slots):
                if start_time < fixed.end_time and fixed.start_time < end_time:
                    slot_mask |= 1 << index
            if not slot_mask:
                continue
            if fixed.room_id in room_ids:
                key = (fixed.room_id, fixed.day_of_week)
                room_busy_masks[key] = room_busy_masks.get(key, 0) | slot_mask
            if fixed.class_id in class_id_set:
                key = (fixed.class_id, fixed.day_of_week)
                class_busy_masks[key] = class_busy_masks.get(key, 0) | slot_mask

        return cls(room_busy_masks, class_busy_masks, slot_masks)

    def available_option_count(
        self,
        room_id: int,
        class_id: int,
        weekdays: list[int],
    ) -> int:
        cache_key = (room_id, class_id, tuple(weekdays))
        cached_count = self._option_count_cache.get(cache_key)
        if cached_count is not None:
            return cached_count
        room_busy = self.room_busy_masks
        class_busy = self.class_busy_masks
        available_count = sum(
            not (
                (room_busy.get((room_id, day), 0) | class_busy.get((class_id, day), 0))
                & slot_mask
            )
            for day in weekdays
            for slot_mask in self.slot_masks.values()
        )
        self._option_count_cache[cache_key] = available_count
        return available_count

    def available_slot_indices(
        self,
        room_id: int,
        class_id: int,
        day: int,
    ) -> list[int]:
        cache_key = (room_id, class_id, day)
        cached_slots = self._available_slots_cache.get(cache_key)
        if cached_slots is not None:
            return cached_slots
        busy_mask = self.room_busy_masks.get((room_id, day), 0) | (
            self.class_busy_masks.get((class_id, day), 0)
        )
        available_slots = [
            slot_index
            for slot_index, overlap_mask in self.slot_masks.items()
            if not busy_mask & overlap_mask
        ]
        self._available_slots_cache[cache_key] = available_slots
        return available_slots


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


def weekday_occurs(start_date: date, end_date: date, day_of_week: int) -> bool:
    if start_date > end_date:
        return False
    first_day = start_date + timedelta(
        days=(day_of_week - 2 - start_date.weekday()) % 7
    )
    return first_day <= end_date


def _solver_worker_count(full_allocation: bool) -> int:
    try:
        available_cpus = len(os.sched_getaffinity(0))
    except (AttributeError, OSError):
        available_cpus = os.cpu_count() or 1

    quota_paths = (
        (Path("/sys/fs/cgroup/cpu.max"),),
        (
            Path("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"),
            Path("/sys/fs/cgroup/cpu/cpu.cfs_period_us"),
        ),
    )
    for paths in quota_paths:
        try:
            if len(paths) == 1:
                quota_text, period_text = paths[0].read_text().split()
                if quota_text == "max":
                    continue
                quota, period = int(quota_text), int(period_text)
            else:
                quota, period = (int(path.read_text()) for path in paths)
        except (OSError, ValueError):
            continue
        if quota > 0 and period > 0:
            available_cpus = min(available_cpus, ceil(quota / period))
            break

    workers = max(1, min(8, available_cpus - 1))
    return workers if full_allocation else max(1, workers // 2)


@lru_cache(maxsize=256)
def _time_to_microseconds(value: time) -> int:
    return (
        (value.hour * 60 + value.minute) * 60 + value.second
    ) * 1_000_000 + value.microsecond


def _add_non_overlapping_constraints(
    model: cp_model.CpModel,
    candidates: list[tuple[time, time, cp_model.IntVar]],
) -> None:
    events: dict[int, tuple[list[cp_model.IntVar], list[cp_model.IntVar]]] = {}
    for start_time, end_time, variable in candidates:
        start = _time_to_microseconds(start_time)
        end = _time_to_microseconds(end_time)
        if start >= end:
            continue
        events.setdefault(start, ([], []))[1].append(variable)
        events.setdefault(end, ([], []))[0].append(variable)

    active: dict[int, cp_model.IntVar] = {}
    added_groups: set[frozenset[int]] = set()
    for boundary in sorted(events):
        ending, starting = events[boundary]
        for variable in ending:
            active.pop(variable.index, None)
        for variable in starting:
            active[variable.index] = variable
        if len(active) > 1:
            group = frozenset(active)
            if group not in added_groups:
                model.add_at_most_one(list(active.values()))
                added_groups.add(group)


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
    availability: WeeklyAvailability | None = None,
) -> list[int]:
    """Keep the best-fitting rooms plus flexible alternatives for each meeting."""
    fixed_by_room_day: dict[tuple[int, int], list[FixedSchedule]] = {}
    fixed_by_class_day: dict[tuple[int, int], list[FixedSchedule]] = {}
    if availability is None:
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
        if availability is not None:
            available_options = availability.available_option_count(
                room.id,
                class_id,
                weekdays,
            )
        else:
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
    candidates_prevalidated: bool = False,
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
    if not candidates_prevalidated:
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

        if not candidates_prevalidated:
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
    )
    day_slot_balance_terms = _add_load_balance_terms(
        model,
        by_day_slot,
        "day_slot",
    )
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
            day_balance_terms
        ),
        "day_slot_balance": sum(
            day_slot_balance_terms
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
    )


def _add_load_balance_terms(
    model: cp_model.CpModel,
    loads: dict[object, list[cp_model.IntVar]],
    name: str,
) -> list[cp_model.IntVar]:
    squared_loads = []
    for index, assignments in enumerate(loads.values()):
        load = model.new_int_var(0, len(assignments), f"{name}_load_{index}")
        model.add(load == sum(assignments))
        squared_load = model.new_int_var(
            0,
            len(assignments) ** 2,
            f"{name}_squared_load_{index}",
        )
        model.add_multiplication_equality(squared_load, [load, load])
        squared_loads.append(squared_load)
    return squared_loads


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
    fixed_by_room: dict[int, list[FixedSchedule]] = {}
    for fixed in fixed_schedules:
        fixed_by_room.setdefault(fixed.room_id, []).append(fixed)
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
                for fixed in fixed_by_room.get(room_id, [])
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
    intervals = sorted(
        {
            (candidate.start_time, candidate.end_time)
            for candidate in candidate_vars
        }
    )
    interval_indices = {
        interval: index for index, interval in enumerate(intervals)
    }
    interval_masks = {
        interval: sum(
            1 << index
            for index, other in enumerate(intervals)
            if interval[0] < other[1] and other[0] < interval[1]
        )
        for interval in intervals
    }
    assigned_by_room_day: dict[tuple[int, int], int] = {}
    assigned_by_class_day: dict[tuple[int, int], int] = {}
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
        feasible = []
        for candidate in candidates_by_requirement[requirement.id]:
            interval = (candidate.start_time, candidate.end_time)
            conflict_mask = interval_masks[interval]
            room_occupancy = assigned_by_room_day.get(
                (candidate.room_id, candidate.day_of_week),
                0,
            )
            class_occupancy = (
                assigned_by_class_day.get(
                    (candidate.class_id, candidate.day_of_week),
                    0,
                )
                if candidate.class_id is not None
                else 0
            )
            if not (room_occupancy | class_occupancy) & conflict_mask:
                feasible.append(candidate)
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
        selected_interval_mask = 1 << interval_indices[
            (selected.start_time, selected.end_time)
        ]
        room_key = (selected.room_id, selected.day_of_week)
        assigned_by_room_day[room_key] = (
            assigned_by_room_day.get(room_key, 0) | selected_interval_mask
        )
        if selected.class_id is not None:
            class_key = (selected.class_id, selected.day_of_week)
            assigned_by_class_day[class_key] = (
                assigned_by_class_day.get(class_key, 0) | selected_interval_mask
            )
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
    candidates_prevalidated: bool = False,
) -> ScheduleSolveResult:
    built_model = build_weekly_model(
        requirements,
        candidates,
        fixed_schedules,
        start_date,
        end_date,
        candidates_prevalidated,
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
    coverage_is_maximized = len(previous_solution) < len(requirements)
    if not coverage_is_maximized:
        for served in built_model.served_vars.values():
            model.add(served == 1)
    remaining_stages = [
        ("sunday", False, 0),
        ("day_balance", False, max(1, ceil(len(requirements) * 0.01))),
        ("day_slot_balance", False, max(1, ceil(len(requirements) * 0.01))),
        ("room_cost", False, 0),
    ]
    stages = ([
        ("coverage", True, 0, 0.4),
    ] if coverage_is_maximized else []) + [
        (
            name,
            maximize,
            tolerance,
            0.15 if coverage_is_maximized else 0.25,
        )
        for name, maximize, tolerance in remaining_stages
    ]
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
        solver.parameters.num_workers = _solver_worker_count(
            full_allocation=stage_name == "coverage",
        )
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
    minimum_room_cost: dict[str, int] = {}
    for candidate in candidate_vars:
        cost = candidate.room_capacity - candidate.required_capacity
        current = minimum_room_cost.get(candidate.requirement_id)
        if current is None or cost < current:
            minimum_room_cost[candidate.requirement_id] = cost
    lower_bound = sum(
        minimum_room_cost[requirement_id]
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
