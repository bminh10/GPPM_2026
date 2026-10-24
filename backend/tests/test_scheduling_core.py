import unittest
from datetime import date, time

from ortools.sat.python import cp_model

from app.optimization.scheduling_core import (
    CandidateRoom,
    FixedSchedule,
    MeetingRequirement,
    ScheduleCandidate,
    select_candidate_rooms,
    solve_weekly_schedule,
)


class WeeklyScheduleSolverTests(unittest.TestCase):
    def setUp(self) -> None:
        self.start_date = date(2026, 9, 1)
        self.end_date = date(2026, 12, 31)

    def test_candidate_room_selection_spreads_equivalent_rooms_across_classes(self) -> None:
        rooms = [CandidateRoom(id=room_id, capacity=50) for room_id in range(1, 31)]

        selected_by_class = [
            set(
                select_candidate_rooms(
                    rooms,
                    40,
                    class_id,
                    [],
                    list(range(2, 9)),
                    [(time(8), time(10))],
                    self.start_date,
                    self.end_date,
                )
            )
            for class_id in range(19)
        ]

        self.assertTrue(all(len(selected) == 12 for selected in selected_by_class))
        self.assertEqual(set.union(*selected_by_class), {room.id for room in rooms})

    def candidate(
        self,
        requirement_id: str,
        registration_id: int,
        room_id: int,
        room_is_practice: bool = False,
        room_capacity: int = 40,
        required_capacity: int = 30,
        day_of_week: int = 2,
        time_slot_id: int = 1,
        start_time: time = time(8),
        end_time: time = time(10),
        class_id: int | None = None,
    ) -> ScheduleCandidate:
        return ScheduleCandidate(
            requirement_id=requirement_id,
            registration_id=registration_id,
            class_id=registration_id if class_id is None else class_id,
            room_id=room_id,
            room_is_thuc_hanh=room_is_practice,
            room_capacity=room_capacity,
            required_capacity=required_capacity,
            day_of_week=day_of_week,
            time_slot_id=time_slot_id,
            start_time=start_time,
            end_time=end_time,
        )

    def solve(
        self,
        requirements: list[MeetingRequirement],
        candidates: list[ScheduleCandidate],
        fixed: list[FixedSchedule] | None = None,
    ):
        result = solve_weekly_schedule(
            requirements,
            candidates,
            fixed or [],
            self.start_date,
            self.end_date,
            max_time_seconds=2,
        )
        return (
            result.status,
            result.selected_candidates,
            result.objective_value,
            result.unscheduled_requirement_ids,
        )

    def test_selects_one_fixed_weekly_slot_from_candidates(self) -> None:
        requirements = [MeetingRequirement("1:theory", 1, False)]
        candidates = [
            self.candidate("1:theory", 1, 1, day_of_week=2),
            self.candidate("1:theory", 1, 2, day_of_week=3),
        ]

        solver_status, selected, _, _ = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(len(selected), 1)
        self.assertIn(selected[0].day_of_week, {2, 3})

    def test_rejects_weekday_outside_schedule_period(self) -> None:
        requirements = [MeetingRequirement("1:theory", 1, False)]
        candidates = [
            self.candidate("1:theory", 1, 1, day_of_week=2),
        ]

        result = solve_weekly_schedule(
            requirements,
            candidates,
            [],
            date(2026, 9, 1),
            date(2026, 9, 1),
            max_time_seconds=2,
        )

        self.assertIn(result.status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(result.selected_candidates, [])
        self.assertEqual(result.unscheduled_requirement_ids, ["1:theory"])

    def test_blocks_same_class_time_overlap_in_different_rooms(self) -> None:
        requirements = [
            MeetingRequirement("1:theory", 1, False),
            MeetingRequirement("2:theory", 2, False),
        ]
        candidates = [
            self.candidate(
                "1:theory",
                1,
                1,
                start_time=time(8),
                end_time=time(10),
                class_id=1,
            ),
            self.candidate(
                "2:theory",
                2,
                2,
                start_time=time(8),
                end_time=time(10),
                class_id=1,
            ),
        ]

        solver_status, selected, _, unscheduled = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(len(selected), 1)
        self.assertEqual(len(unscheduled), 1)

    def test_allows_same_class_meetings_in_non_overlapping_times(self) -> None:
        requirements = [
            MeetingRequirement("1:theory", 1, False),
            MeetingRequirement("2:theory", 2, False),
        ]
        candidates = [
            self.candidate(
                "1:theory",
                1,
                1,
                start_time=time(8),
                end_time=time(10),
                class_id=1,
            ),
            self.candidate(
                "2:theory",
                2,
                2,
                start_time=time(10),
                end_time=time(12),
                class_id=1,
            ),
        ]

        solver_status, selected, _, _ = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(len(selected), 2)

    def test_blocks_room_time_overlap_between_classes(self) -> None:
        requirements = [
            MeetingRequirement("1:theory", 1, False),
            MeetingRequirement("2:theory", 2, False),
        ]
        candidates = [
            self.candidate("1:theory", 1, 1),
            self.candidate("2:theory", 2, 1),
        ]

        solver_status, selected, _, unscheduled = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(len(selected), 1)
        self.assertEqual(len(unscheduled), 1)

    def test_practical_course_can_have_separate_theory_and_practice(self) -> None:
        requirements = [
            MeetingRequirement("1:theory", 1, False),
            MeetingRequirement("1:practice", 1, True),
        ]
        candidates = [
            self.candidate("1:theory", 1, 1),
            self.candidate(
                "1:practice",
                1,
                2,
                room_is_practice=True,
                day_of_week=3,
            ),
        ]

        solver_status, selected, _, _ = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual({candidate.requirement_id for candidate in selected}, {
            "1:theory",
            "1:practice",
        })

    def test_practical_and_theory_meetings_for_same_class_cannot_overlap(self) -> None:
        requirements = [
            MeetingRequirement("1:theory", 1, False),
            MeetingRequirement("1:practice", 1, True),
        ]
        candidates = [
            self.candidate("1:theory", 1, 1),
            self.candidate("1:practice", 1, 2, room_is_practice=True),
        ]

        solver_status, selected, _, unscheduled = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(len(selected), 1)
        self.assertEqual(len(unscheduled), 1)

    def test_excludes_room_with_insufficient_capacity_or_wrong_type(self) -> None:
        requirements = [MeetingRequirement("1:practice", 1, True)]
        candidates = [
            self.candidate(
                "1:practice",
                1,
                1,
                room_is_practice=True,
                room_capacity=20,
            ),
            self.candidate("1:practice", 1, 2, room_is_practice=False),
        ]

        solver_status, selected, _, unscheduled = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(selected, [])
        self.assertEqual(unscheduled, ["1:practice"])

    def test_prefers_the_smallest_suitable_room(self) -> None:
        requirements = [MeetingRequirement("1:theory", 1, False)]
        candidates = [
            self.candidate("1:theory", 1, 1, room_capacity=36),
            self.candidate("1:theory", 1, 2, room_capacity=60),
        ]

        solver_status, selected, _, _ = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0].room_id, 1)

    def test_reports_final_objective_bound_and_gap(self) -> None:
        requirements = [MeetingRequirement("1:theory", 1, False)]
        candidates = [
            self.candidate("1:theory", 1, 1, room_capacity=35),
        ]

        result = solve_weekly_schedule(
            requirements,
            candidates,
            [],
            self.start_date,
            self.end_date,
            max_time_seconds=2,
        )

        self.assertEqual(result.status, cp_model.OPTIMAL)
        self.assertEqual(result.objective_value, 5)
        self.assertEqual(result.best_objective_bound, 5)
        self.assertEqual(result.relative_gap, 0)

    def test_room_selection_keeps_best_fits_and_caps_room_options(self) -> None:
        rooms = [
            CandidateRoom(id=room_id, capacity=capacity)
            for room_id, capacity in (
                [(room_id, 50) for room_id in range(1, 21)]
                + [(room_id, 80) for room_id in range(21, 31)]
            )
        ]

        selected = select_candidate_rooms(
            rooms,
            required_capacity=45,
            class_id=1,
            fixed_schedules=[],
            weekdays=[2, 3, 4, 5, 6, 7, 8],
            time_slots=[(time(8), time(10)), (time(13), time(15))],
            start_date=self.start_date,
            end_date=self.end_date,
        )

        self.assertEqual(len(selected), 12)
        self.assertTrue(set(selected).issubset({room.id for room in rooms}))
        self.assertEqual(
            sum(room_id <= 20 for room_id in selected),
            12,
        )

    def test_room_selection_avoids_rooms_blocked_by_fixed_schedules(self) -> None:
        rooms = [CandidateRoom(id=room_id, capacity=50) for room_id in range(1, 5)]
        fixed = [
            FixedSchedule(
                room_id=room_id,
                class_id=100 + room_id,
                day_of_week=2,
                start_date=self.start_date,
                end_date=self.end_date,
                start_time=time(8),
                end_time=time(10),
            )
            for room_id in (1, 2)
        ]

        selected = select_candidate_rooms(
            rooms,
            required_capacity=45,
            class_id=1,
            fixed_schedules=fixed,
            weekdays=[2],
            time_slots=[(time(8), time(10))],
            start_date=self.start_date,
            end_date=self.end_date,
            max_rooms=4,
        )

        self.assertEqual(set(selected), {3, 4})

    def test_avoids_sunday_when_a_weekday_is_available(self) -> None:
        requirements = [MeetingRequirement("1:theory", 1, False)]
        candidates = [
            self.candidate("1:theory", 1, 1, day_of_week=8),
            self.candidate("1:theory", 1, 2, day_of_week=5),
        ]

        solver_status, selected, _, _ = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0].day_of_week, 5)

    def test_keeps_sunday_available_when_no_weekday_is_feasible(self) -> None:
        requirements = [MeetingRequirement("1:theory", 1, False)]
        candidates = [
            self.candidate("1:theory", 1, 1, day_of_week=8),
        ]

        solver_status, selected, _, _ = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0].day_of_week, 8)

    def test_spreads_meetings_across_weekdays_before_using_sunday(self) -> None:
        requirements = [
            MeetingRequirement(f"{registration_id}:theory", registration_id, False)
            for registration_id in range(1, 7)
        ]
        candidates = [
            self.candidate(
                requirement.id,
                requirement.registration_id,
                room_id=1,
                day_of_week=day_of_week,
                class_id=requirement.registration_id,
            )
            for requirement in requirements
            for day_of_week in range(2, 9)
        ]

        solver_status, selected, _, _ = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(len(selected), 6)
        self.assertEqual(
            {candidate.day_of_week for candidate in selected},
            set(range(2, 8)),
        )

    def test_balances_meetings_across_time_slots(self) -> None:
        requirements = [
            MeetingRequirement(f"{registration_id}:theory", registration_id, False)
            for registration_id in range(1, 5)
        ]
        candidates = [
            self.candidate(
                requirement.id,
                requirement.registration_id,
                room_id=requirement.registration_id,
                day_of_week=2,
                time_slot_id=slot_id,
                start_time=time(8 if slot_id == 1 else 13),
                end_time=time(10 if slot_id == 1 else 15),
            )
            for requirement in requirements
            for slot_id in (1, 2)
        ]

        solver_status, selected, _, _ = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(
            {slot_id: sum(candidate.time_slot_id == slot_id for candidate in selected)
             for slot_id in (1, 2)},
            {1: 2, 2: 2},
        )

    def test_uses_sunday_only_when_weekdays_cannot_fit_all_meetings(self) -> None:
        requirements = [
            MeetingRequirement("1:theory", 1, False),
            MeetingRequirement("2:theory", 2, False),
        ]
        candidates = [
            self.candidate("1:theory", 1, room_id=1, day_of_week=2),
            self.candidate("2:theory", 2, room_id=1, day_of_week=2),
            self.candidate("1:theory", 1, room_id=1, day_of_week=8),
            self.candidate(
                "2:theory",
                2,
                room_id=1,
                day_of_week=8,
                time_slot_id=2,
                start_time=time(10),
                end_time=time(12),
            ),
        ]

        solver_status, selected, _, _ = self.solve(requirements, candidates)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(len(selected), 2)
        self.assertEqual(
            sum(candidate.day_of_week == 8 for candidate in selected),
            1,
        )

    def test_fixed_room_schedule_blocks_recurring_overlap(self) -> None:
        requirements = [MeetingRequirement("1:theory", 1, False)]
        candidates = [self.candidate("1:theory", 1, 5)]
        fixed = [
            FixedSchedule(
                room_id=5,
                class_id=1,
                day_of_week=2,
                start_date=date(2026, 10, 5),
                end_date=date(2026, 10, 5),
                start_time=time(9),
                end_time=time(11),
            )
        ]

        solver_status, selected, _, unscheduled = self.solve(requirements, candidates, fixed)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(selected, [])
        self.assertEqual(unscheduled, ["1:theory"])

    def test_fixed_schedule_outside_period_does_not_block_candidate(self) -> None:
        requirements = [MeetingRequirement("1:theory", 1, False)]
        candidates = [self.candidate("1:theory", 1, 5)]
        fixed = [
            FixedSchedule(
                room_id=5,
                class_id=2,
                day_of_week=2,
                start_date=date(2025, 10, 6),
                end_date=date(2025, 10, 6),
                start_time=time(9),
                end_time=time(11),
            )
        ]

        solver_status, selected, _, _ = self.solve(requirements, candidates, fixed)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(len(selected), 1)

    def test_fixed_schedule_blocks_same_class_in_another_room(self) -> None:
        requirements = [MeetingRequirement("1:theory", 1, False)]
        candidates = [self.candidate("1:theory", 1, 5)]
        fixed = [
            FixedSchedule(
                room_id=99,
                class_id=1,
                day_of_week=2,
                start_date=date(2026, 10, 5),
                end_date=date(2026, 10, 5),
                start_time=time(9),
                end_time=time(11),
            )
        ]

        solver_status, selected, _, unscheduled = self.solve(requirements, candidates, fixed)

        self.assertIn(solver_status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        self.assertEqual(selected, [])
        self.assertEqual(unscheduled, ["1:theory"])


if __name__ == "__main__":
    unittest.main()
