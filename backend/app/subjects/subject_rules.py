# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import os


def configured_practical_subject_codes() -> frozenset[str]:
    return frozenset(
        code.strip().casefold()
        for code in os.getenv("PRACTICAL_SUBJECT_CODES", "").split(",")
        if code.strip()
    )


def determine_is_thuc_hanh(code: str) -> bool:
    return code.strip().casefold() in configured_practical_subject_codes()
