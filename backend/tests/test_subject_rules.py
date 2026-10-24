import os
import unittest
from unittest.mock import patch

from app.subjects.subject_rules import determine_is_thuc_hanh


class SubjectClassificationTests(unittest.TestCase):
    def test_matches_only_configured_codes_case_insensitively(self) -> None:
        with patch.dict(os.environ, {"PRACTICAL_SUBJECT_CODES": "LAB101, CS205"}):
            self.assertTrue(determine_is_thuc_hanh("lab101"))
            self.assertTrue(determine_is_thuc_hanh(" CS205 "))
            self.assertFalse(determine_is_thuc_hanh("LAB101A"))
            self.assertFalse(determine_is_thuc_hanh("Lập trình thực hành"))

    def test_empty_configuration_does_not_infer_from_code_or_name(self) -> None:
        with patch.dict(os.environ, {"PRACTICAL_SUBJECT_CODES": ""}):
            self.assertFalse(determine_is_thuc_hanh("TH101"))
            self.assertFalse(determine_is_thuc_hanh("PRACTICE"))


if __name__ == "__main__":
    unittest.main()
