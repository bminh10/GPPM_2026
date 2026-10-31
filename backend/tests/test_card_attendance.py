# Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import time
import unittest
from unittest.mock import Mock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.cards.attendance import AttendanceLog, AttendanceSession, AttendanceStation
from app.cards.router import CardScan, authenticate_reader, router
from app.cards.writer import WriteResult, write_result
from db.database import get_db


class CardAttendanceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
        with self.engine.begin() as connection:
            connection.execute(text("CREATE TABLE lop (id INTEGER PRIMARY KEY)"))
            connection.execute(text("CREATE TABLE dang_ky_mon_hoc (id INTEGER PRIMARY KEY, lop_id INTEGER)"))
            connection.execute(text("CREATE TABLE sinhvien (id INTEGER PRIMARY KEY, mssv VARCHAR(100), lop_id INTEGER)"))
            connection.execute(text("INSERT INTO lop VALUES (55), (56)"))
            connection.execute(text("INSERT INTO dang_ky_mon_hoc VALUES (894, 55), (895, 56)"))
            connection.execute(text(
                "INSERT INTO sinhvien VALUES (1, '2451000001', 894), (2, '2351000006', 894), "
                "(3, '2251000010', 894), (4, '2451012022', 895)"
            ))
        for model in (AttendanceStation, AttendanceSession, AttendanceLog, CardScan):
            model.__table__.create(self.engine)
        self.db = Session(self.engine)
        self.session = AttendanceSession(
            id="test-session", reader_id="test-reader", class_id=55, class_name="NET2601",
            admin_id=1, started_at=time.time(), ends_at=time.time() + 900,
        )
        self.station = AttendanceStation(reader_id="test-reader", session_id=self.session.id)
        self.db.add_all([self.session, self.station, CardScan(reader_id="test-reader", received_at=0, payload="")])
        self.db.commit()
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[authenticate_reader] = lambda: "test-reader"
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    def scan(self, mssv, **overrides):
        payload = {
            "uid": "AA:BB:CC:DD", "card_type": "MIFARE 1KB", "read_status": "ok",
            "block": 4, "data_hex": mssv.encode("ascii").ljust(16, b"\x00").hex().upper(), "detail": "",
        }
        payload.update(overrides)
        response = self.client.post("/iot/card-reader/scans", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["attendance"]

    def test_roster_members_with_different_prefixes_are_recorded(self):
        for mssv in ("2451000001", "2351000006", "2251000010"):
            with self.subTest(mssv=mssv):
                result = self.scan(mssv)
                self.assertEqual(result["status"], "recorded")
                self.assertEqual(result["message"], "Điểm danh thành công")
        self.assertEqual(self.db.query(AttendanceLog).count(), 3)

    def test_unknown_and_other_class_students_are_rejected(self):
        for mssv in ("9999999999", "2451012022"):
            with self.subTest(mssv=mssv):
                result = self.scan(mssv)
                self.assertEqual(result["status"], "invalid")
                self.assertIn("không thuộc", result["message"])
        self.assertEqual(self.db.query(AttendanceLog).count(), 0)

    def test_duplicate_is_not_recorded_twice(self):
        self.assertEqual(self.scan("2451000001")["status"], "recorded")
        self.assertEqual(self.scan("2451000001")["status"], "duplicate")
        self.assertEqual(self.db.query(AttendanceLog).count(), 1)

    def test_removed_roster_member_cannot_use_existing_log_to_pass(self):
        self.scan("2451000001")
        self.db.execute(text("DELETE FROM sinhvien WHERE mssv = '2451000001'"))
        self.db.commit()
        self.assertEqual(self.scan("2451000001")["status"], "invalid")
        self.assertEqual(self.db.query(AttendanceLog).count(), 1)

    def test_no_closed_or_expired_session_rejects_scans(self):
        for state in ("none", "closed", "expired"):
            with self.subTest(state=state):
                self.station.session_id = None if state == "none" else self.session.id
                self.session.closed_at = time.time() if state == "closed" else None
                self.session.ends_at = time.time() - 1 if state == "expired" else time.time() + 900
                self.db.commit()
                self.assertEqual(self.scan("2451000001")["status"], "outside")
        self.assertEqual(self.db.query(AttendanceLog).count(), 0)

    def test_legacy_session_without_class_is_rejected(self):
        self.session.class_id = None
        self.db.commit()
        self.assertEqual(self.scan("2451000001")["status"], "invalid")
        self.assertEqual(self.db.query(AttendanceLog).count(), 0)

    def test_unreadable_or_malformed_card_is_rejected(self):
        cases = (
            {"read_status": "read_error", "data_hex": None},
            {"read_status": "uid_only", "data_hex": None},
            {"block": 5},
            {"data_hex": bytes(16).hex().upper()},
            {"data_hex": b"2451000001\x00X\x00\x00\x00\x00".hex().upper()},
        )
        for overrides in cases:
            with self.subTest(overrides=overrides):
                self.assertEqual(self.scan("2451000001", **overrides)["status"], "invalid")
        self.assertEqual(self.db.query(AttendanceLog).count(), 0)

    def test_blank_card_has_specific_message(self):
        result = self.scan("")
        self.assertEqual(result["status"], "invalid")
        self.assertEqual(result["message"], "Thẻ không có dữ liệu")
        self.assertEqual(self.db.query(AttendanceLog).count(), 0)

    def test_read_error_and_malformed_data_are_not_reported_as_blank(self):
        for overrides in (
            {"read_status": "read_error", "data_hex": None},
            {"read_status": "uid_only", "data_hex": None},
            {"data_hex": "FF" * 16},
            {"block": 5, "data_hex": "00" * 16},
        ):
            with self.subTest(overrides=overrides):
                result = self.scan("", **overrides)
                self.assertEqual(result["status"], "invalid")
                self.assertEqual(result["message"], "Không đọc được MSSV đúng định dạng")
        self.assertEqual(self.db.query(AttendanceLog).count(), 0)


class CardWriterReadBackTests(unittest.TestCase):
    def test_variable_length_mssv_read_back(self):
        for mssv in ("2251000010", "SV-A_2026", "1234567890123456"):
            with self.subTest(mssv=mssv):
                job = Mock(id="a" * 36, uid="AA:BB:CC:DD", mssv=mssv, state="writing")
                result = WriteResult(
                    job_id=job.id, uid=job.uid, success=True,
                    data_hex=mssv.encode("ascii").ljust(16, b"\x00").hex().upper(), detail="Read back OK",
                )
                db = Mock()
                with patch("app.cards.writer.station"), patch("app.cards.writer.current_job", return_value=job):
                    self.assertEqual(write_result(result, writer_id="writer", db=db), {"received": True})
                self.assertEqual(job.state, "succeeded")
                db.commit.assert_called_once()

    def test_mismatched_read_back_is_rejected(self):
        job = Mock(id="a" * 36, uid="AA:BB:CC:DD", mssv="2251000010", state="writing")
        result = WriteResult(
            job_id=job.id, uid=job.uid, success=True, data_hex="00" * 16, detail="Wrong bytes",
        )
        db = Mock()
        with patch("app.cards.writer.station"), patch("app.cards.writer.current_job", return_value=job):
            with self.assertRaises(HTTPException) as error:
                write_result(result, writer_id="writer", db=db)
        self.assertEqual(error.exception.status_code, 422)
        db.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
