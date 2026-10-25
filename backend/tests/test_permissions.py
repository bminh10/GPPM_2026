import unittest

from core.permissions import get_role_key, is_request_allowed


class RoleResolutionTests(unittest.TestCase):
    def test_resolves_configured_role_names(self) -> None:
        self.assertEqual(get_role_key("Super Admin"), "super_admin")
        self.assertEqual(get_role_key("Admin"), "admin")
        self.assertEqual(get_role_key("Kỹ Thuật Viên"), "technician")
        self.assertEqual(get_role_key("3 Kỹ Thuật Viên"), "technician")
        self.assertEqual(get_role_key("3"), "technician")
        self.assertEqual(get_role_key("Cán bộ nhân viên"), "staff")


class PermissionPolicyTests(unittest.TestCase):
    def test_super_admin_has_full_access(self) -> None:
        self.assertTrue(is_request_allowed("Super Admin", "DELETE", "/user/2"))
        self.assertTrue(is_request_allowed("Super Admin", "GET", "/dashboard/summary"))

    def test_admin_can_manage_but_cannot_delete(self) -> None:
        self.assertTrue(is_request_allowed("Admin", "PATCH", "/subjects/2"))
        self.assertTrue(is_request_allowed("Admin", "POST", "/card-writer/jobs"))
        self.assertFalse(is_request_allowed("Admin", "DELETE", "/subjects/2"))
        self.assertFalse(is_request_allowed("Admin", "DELETE", "/user/2"))

    def test_technician_is_limited_to_infrastructure(self) -> None:
        self.assertTrue(is_request_allowed("Kỹ Thuật Viên", "POST", "/card-attendance/sessions"))
        self.assertTrue(is_request_allowed("Kỹ Thuật Viên", "PUT", "/lighting/rooms/1/A.101/lights/1"))
        self.assertTrue(is_request_allowed("Kỹ Thuật Viên", "GET", "/rooms"))
        self.assertTrue(is_request_allowed("Kỹ Thuật Viên", "GET", "/classes"))
        self.assertTrue(is_request_allowed("Kỹ Thuật Viên", "GET", "/majors"))
        self.assertTrue(is_request_allowed("Kỹ Thuật Viên", "GET", "/dashboard/summary"))
        self.assertTrue(is_request_allowed("Kỹ Thuật Viên", "GET", "/analytics/room-utilization"))
        self.assertFalse(is_request_allowed("Kỹ Thuật Viên", "POST", "/rooms"))
        self.assertFalse(is_request_allowed("Kỹ Thuật Viên", "POST", "/classes"))
        self.assertFalse(is_request_allowed("Kỹ Thuật Viên", "POST", "/dashboard/summary"))
        self.assertFalse(is_request_allowed("Kỹ Thuật Viên", "GET", "/admin/logs"))

    def test_staff_can_manage_data_but_not_accounts_or_dashboard(self) -> None:
        self.assertTrue(is_request_allowed("Cán bộ nhân viên", "DELETE", "/subjects/2"))
        self.assertTrue(is_request_allowed("Cán bộ nhân viên", "GET", "/schedules"))
        self.assertTrue(is_request_allowed("Cán bộ nhân viên", "GET", "/auth/me"))
        self.assertFalse(is_request_allowed("Cán bộ nhân viên", "GET", "/user/all"))
        self.assertFalse(is_request_allowed("Cán bộ nhân viên", "GET", "/users"))
        self.assertFalse(is_request_allowed("Cán bộ nhân viên", "GET", "/dashboard/summary"))
        self.assertFalse(is_request_allowed("Cán bộ nhân viên", "GET", "/lighting/lights"))

    def test_unknown_roles_are_denied(self) -> None:
        self.assertFalse(is_request_allowed("Unrecognized role", "GET", "/subjects"))


if __name__ == "__main__":
    unittest.main()
