# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import unittest

from core.permissions import can_deactivate_accounts


class AccountDeactivationPermissionTests(unittest.TestCase):
    def test_only_super_admin_can_deactivate_accounts(self):
        self.assertTrue(can_deactivate_accounts("Super Admin"))
        self.assertTrue(can_deactivate_accounts("1 Super Admin"))
        self.assertFalse(can_deactivate_accounts("Admin"))
        self.assertFalse(can_deactivate_accounts("2 Admin"))
        self.assertFalse(can_deactivate_accounts("User"))


if __name__ == "__main__":
    unittest.main()
