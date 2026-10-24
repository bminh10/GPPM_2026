from dataclasses import dataclass
from datetime import date, time, timedelta

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


def build_weekly_model(
    requirements: list[MeetingRequirement],
    candidates: list[ScheduleCandidate],
    fixed_schedules: list[FixedSchedule],
    start_date: date,
    end_date: date,
) -> tuple[
    cp_model.CpModel,
    dict[ScheduleCandidate, cp_model.IntVar],
    dict[int, str],
]:
    model = cp_model.CpModel()
    candidate_vars: dict[ScheduleCandidate, cp_model.IntVar] = {}
    candidates_by_requirement: dict[str, list[cp_model.IntVar]] = {
        requirement.id: [] for requirement in requirements
    }
    by_room_day: dict[tuple[int, int], list[tuple[time, time, cp_model.IntVar]]] = {}
    by_class_day: dict[tuple[int, int], list[tuple[time, time, cp_model.IntVar]]] = {}
    room_cost_terms = []
    max_room_cost_by_requirement: dict[str, int] = {}
    sunday_assignments = []
    requirement_by_assumption: dict[int, str] = {}
    requirement_types = {
        requirement.id: requirement.is_thuc_hanh for requirement in requirements
    }

    for index, candidate in enumerate(candidates):
        if candidate.requirement_id not in requirement_types:
            continue
        if candidate.room_is_thuc_hanh != requirement_types[candidate.requirement_id]:
            continue
        if candidate.room_capacity < candidate.required_capacity:
            continue
        if not weekday_occurs(start_date, end_date, candidate.day_of_week):
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
        room_cost = (candidate.room_capacity - candidate.required_capacity) * 100
        room_cost_terms.append(room_cost * variable)
        max_room_cost_by_requirement[candidate.requirement_id] = max(
            max_room_cost_by_requirement.get(candidate.requirement_id, 0),
            room_cost,
        )
        if candidate.day_of_week == 8:
            sunday_assignments.append(variable)

        for fixed in fixed_schedules:
            if fixed.day_of_week != candidate.day_of_week:
                continue
            if (
                fixed.room_id != candidate.room_id
                and fixed.class_id != candidate.class_id
            ):
                continue
            overlap_start = max(start_date, fixed.start_date)
            overlap_end = min(end_date, fixed.end_date)
            if not weekday_occurs(
                overlap_start,
                overlap_end,
                candidate.day_of_week,
            ):
                continue
            if not (
                candidate.start_time < fixed.end_time
                and fixed.start_time < candidate.end_time
            ):
                continue
            if fixed.room_id == candidate.room_id or (
                candidate.class_id is not None
                and fixed.class_id == candidate.class_id
            ):
                model.add(variable == 0)

    for requirement in requirements:
        assumption = model.new_bool_var(f"require_{requirement.id}")
        model.add(sum(candidates_by_requirement[requirement.id]) == 1).only_enforce_if(
            assumption
        )
        model.add_assumption(assumption)
        requirement_by_assumption[assumption.index] = requirement.id

    for grouped_candidates in by_room_day.values():
        _add_non_overlapping_constraints(model, grouped_candidates)
    for grouped_candidates in by_class_day.values():
        _add_non_overlapping_constraints(model, grouped_candidates)

    room_cost_upper_bound = sum(max_room_cost_by_requirement.values())
    weekday_cost = room_cost_upper_bound + 1
    weekday_load_upper_bound = len(requirements) ** 2
    sunday_cost = (
        weekday_load_upper_bound * weekday_cost + room_cost_upper_bound + 1
    )
    objective_terms = [
        sunday_cost * sum(sunday_assignments),
        *room_cost_terms,
    ]

    for day_of_week in range(2, 8):
        day_assignments = [
            variable
            for candidate, variable in candidate_vars.items()
            if candidate.day_of_week == day_of_week
        ]
        if not day_assignments:
            continue
        day_load = sum(day_assignments)
        for threshold in range(
            1,
            min(len(day_assignments), len(requirements)) + 1,
        ):
            load_reached = model.new_bool_var(
                f"weekday_{day_of_week}_load_{threshold}"
            )
            model.add(day_load >= threshold).only_enforce_if(load_reached)
            model.add(day_load < threshold).only_enforce_if(load_reached.Not())
            objective_terms.append(
                weekday_cost * (2 * threshold - 1) * load_reached
            )

    model.minimize(sum(objective_terms))
    return model, candidate_vars, requirement_by_assumption


def solve_weekly_schedule(
    requirements: list[MeetingRequirement],
    candidates: list[ScheduleCandidate],
    fixed_schedules: list[FixedSchedule],
    start_date: date,
    end_date: date,
    max_time_seconds: int = 30,
) -> tuple[int, list[ScheduleCandidate], float, list[str]]:
    def solve_candidates(
        available_candidates: list[ScheduleCandidate],
    ) -> tuple[int, list[ScheduleCandidate], float, list[str]]:
        model, candidate_vars, requirement_by_assumption = build_weekly_model(
            requirements,
            available_candidates,
            fixed_schedules,
            start_date,
            end_date,
        )
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = max_time_seconds
        solver.parameters.num_search_workers = 8
        solver.parameters.random_seed = 42
        solver_status = solver.solve(model)
        selected = [
            candidate
            for candidate, variable in candidate_vars.items()
            if solver.boolean_value(variable)
        ] if solver_status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else []
        infeasible_requirements = []
        if solver_status == cp_model.INFEASIBLE:
            for assumption in solver.sufficient_assumptions_for_infeasibility():
                literal_index = assumption if assumption >= 0 else -assumption - 1
                requirement_id = requirement_by_assumption.get(literal_index)
                if requirement_id is not None:
                    infeasible_requirements.append(requirement_id)
        objective_value = solver.objective_value if solver_status in (
            cp_model.OPTIMAL,
            cp_model.FEASIBLE,
        ) else 0.0
        return solver_status, selected, objective_value, infeasible_requirements

    weekday_candidates = [
        candidate for candidate in candidates if candidate.day_of_week != 8
    ]
    if len(weekday_candidates) != len(candidates):
        weekday_result = solve_candidates(weekday_candidates)
        if weekday_result[0] != cp_model.INFEASIBLE:
            return weekday_result

    return solve_candidates(candidates)
