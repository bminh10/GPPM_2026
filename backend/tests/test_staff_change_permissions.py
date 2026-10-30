import unittest

from core.permissions import is_request_allowed


class StaffChangePermissionTests(unittest.TestCase):
    def test_staff_can_submit_updates_to_approval_eligible_data(self):
        for path in (
            "/campus/1",
            "/faculties/1",
            "/majors/1",
            "/classes/1",
            "/rooms/1",
            "/subjects/1",
            "/semesters/1",
            "/time-slots/1",
            "/course-registrations/1",
            "/schedules/1",
        ):
            with self.subTest(path=path):
                self.assertTrue(is_request_allowed("Cán bộ nhân viên", "PATCH", path))

    def test_staff_can_view_but_not_review_change_requests(self):
        self.assertTrue(is_request_allowed("staff", "GET", "/approvals/changes"))
        self.assertFalse(
            is_request_allowed(
                "staff",
                "POST",
                "/approvals/changes/request-id/approve",
            )
        )
        self.assertTrue(
            is_request_allowed(
                "admin",
                "POST",
                "/approvals/changes/request-id/approve",
            )
        )

    def test_create_and_delete_permissions_are_unchanged(self):
        self.assertTrue(is_request_allowed("staff", "POST", "/rooms"))
        self.assertTrue(is_request_allowed("staff", "DELETE", "/rooms/1"))


if __name__ == "__main__":
    unittest.main()
