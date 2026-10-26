import unittest
from datetime import date, time

from ortools.sat.python import cp_model

from app.optimization.scheduling_core import (
    CandidateRoom,
    FixedSchedule,
    MeetingRequirement,
    ScheduleCandidate,
    WeeklyAvailability,
    build_weekly_model,
)


class WeeklyAvailabilityTests(unittest.TestCase):
    def test_fixed_meetings_block_only_intersecting_slots(self):
        slots = [
            (time(8), time(9, 30)),
            (time(9), time(10)),
            (time(10), time(11)),
        ]
        availability = WeeklyAvailability.build(
            [CandidateRoom(1, 40)],
            [10],
            [
                FixedSchedule(
                    room_id=1,
                    class_id=None,
                    day_of_week=2,
                    start_date=date(2026, 10, 26),
                    end_date=date(2026, 11, 30),
                    start_time=time(8, 15),
                    end_time=time(8, 45),
                ),
                FixedSchedule(
                    room_id=2,
                    class_id=10,
                    day_of_week=2,
                    start_date=date(2026, 10, 26),
                    end_date=date(2026, 11, 30),
                    start_time=time(10, 15),
                    end_time=time(10, 45),
                ),
            ],
            [2],
            slots,
            date(2026, 10, 26),
            date(2026, 11, 30),
        )

        self.assertEqual(
            availability.available_slot_indices(1, 10, 2),
            [1],
        )
        self.assertEqual(availability.available_option_count(1, 10, [2]), 1)


class WeeklyModelTests(unittest.TestCase):
    def _maximum_coverage(self, first: ScheduleCandidate, second: ScheduleCandidate) -> int:
        requirements = [
            MeetingRequirement("first", 1, False),
            MeetingRequirement("second", 2, False),
        ]
        built = build_weekly_model(
            requirements,
            [first, second],
            [],
            date(2026, 10, 26),
            date(2026, 11, 1),
        )
        built.model.maximize(built.objectives["coverage"])

        solver = cp_model.CpSolver()
        status = solver.solve(built.model)
        self.assertIn(status, (cp_model.OPTIMAL, cp_model.FEASIBLE))
        return sum(solver.boolean_value(variable) for variable in built.served_vars.values())

    @staticmethod
    def _candidate(
        requirement_id: str,
        registration_id: int,
        class_id: int,
        room_id: int,
        start_time: time,
        end_time: time,
    ) -> ScheduleCandidate:
        return ScheduleCandidate(
            requirement_id=requirement_id,
            registration_id=registration_id,
            class_id=class_id,
            room_id=room_id,
            room_is_thuc_hanh=False,
            room_capacity=40,
            required_capacity=30,
            day_of_week=2,
            time_slot_id=registration_id,
            start_time=start_time,
            end_time=end_time,
        )

    def test_overlapping_class_or_room_conflicts_but_adjacent_slots_do_not(self):
        first = self._candidate(
            "first", 1, 1, 1, time(9), time(10)
        )
        self.assertEqual(
            self._maximum_coverage(
                first,
                self._candidate("second", 2, 1, 2, time(9, 30), time(10, 30)),
            ),
            1,
        )
        self.assertEqual(
            self._maximum_coverage(
                first,
                self._candidate("second", 2, 2, 1, time(9, 30), time(10, 30)),
            ),
            1,
        )
        self.assertEqual(
            self._maximum_coverage(
                first,
                self._candidate("second", 2, 2, 1, time(10), time(11)),
            ),
            2,
        )


if __name__ == "__main__":
    unittest.main()
