import unittest
from datetime import date, time

from ortools.sat.python import cp_model

from app.optimization.scheduling_core import (
    FixedSchedule,
    MeetingRequirement,
    ScheduleCandidate,
    solve_weekly_schedule,
)


class WeeklyScheduleSolverTests(unittest.TestCase):
    def setUp(self) -> None:
        self.start_date = date(2026, 9, 1)
        self.end_date = date(2026, 12, 31)

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
        return solve_weekly_schedule(
            requirements,
            candidates,
            fixed or [],
            self.start_date,
            self.end_date,
            max_time_seconds=2,
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

        solver_status, selected, _, _ = solve_weekly_schedule(
            requirements,
            candidates,
            [],
            date(2026, 9, 1),
            date(2026, 9, 1),
            max_time_seconds=2,
        )

        self.assertEqual(solver_status, cp_model.INFEASIBLE)
        self.assertEqual(selected, [])

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

        solver_status, _, _, _ = self.solve(requirements, candidates)

        self.assertEqual(solver_status, cp_model.INFEASIBLE)

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

        solver_status, _, _, _ = self.solve(requirements, candidates)

        self.assertEqual(solver_status, cp_model.INFEASIBLE)

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

        solver_status, _, _, _ = self.solve(requirements, candidates)

        self.assertEqual(solver_status, cp_model.INFEASIBLE)

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

        solver_status, selected, _, _ = self.solve(requirements, candidates)

        self.assertEqual(solver_status, cp_model.INFEASIBLE)
        self.assertEqual(selected, [])

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

        solver_status, _, _, _ = self.solve(requirements, candidates, fixed)

        self.assertEqual(solver_status, cp_model.INFEASIBLE)

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

        solver_status, _, _, _ = self.solve(requirements, candidates, fixed)

        self.assertEqual(solver_status, cp_model.INFEASIBLE)


if __name__ == "__main__":
    unittest.main()
