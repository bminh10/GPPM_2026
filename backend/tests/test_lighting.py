import base64
import hashlib
import os
import secrets
import tempfile
import time
import unittest

_directory = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_directory.name, "lighting.db")
os.environ["JWT_SECRET"] = secrets.token_urlsafe(48)
os.environ["HASH_KEY"] = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()

from fastapi.testclient import TestClient
from sqlalchemy import event
from app.lighting.models import LightingDevice, RoomLight
from app.lighting.service import OFFLINE_SECONDS, COMMAND_TIMEOUT_SECONDS
from core.crypto import seal
from core.security import create_token
from db.database import Base, Role, SessionLocal, User, engine
from main import app

KEY = "test-only-device-key-not-a-real-secret-12345"

def tearDownModule():
    engine.dispose()
    _directory.cleanup()


class LightingTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.drop_all(engine)
        Base.metadata.create_all(engine)
        with SessionLocal.begin() as db:
            db.add_all([Role(id=1, name="Super Admin"), Role(id=2, name="User")])
            db.flush()
            db.add_all([
                User(id=1, user_name="admin", email="admin@example.test", role_id=1),
                User(id=2, user_name="viewer", email="viewer@example.test", role_id=2),
            ])
            for room in ("A101", "A102"):
                device_id = f"esp32-{room.lower()}"
                db.add(LightingDevice(
                    id=device_id, key_hash=hashlib.sha256(KEY.encode()).hexdigest(),
                    campus_id="nhon-duc", room_id=room,
                ))
                db.flush()
                for light in ("light-1", "light-2"):
                    db.add(RoomLight(device_id=device_id, campus_id="nhon-duc", room_id=room, light_id=light))
        self.client = TestClient(app)
        self.login(1)

    def tearDown(self):
        self.client.close()

    def login(self, user_id):
        self.client.cookies.set("Hash", seal({
            "access_token": create_token(user_id, "access"),
            "refresh_token": create_token(user_id, "refresh"),
        }))

    def headers(self, room="a101"):
        return {"X-Device-Id": f"esp32-{room}", "X-Device-Key": KEY}

    def connect(self, room="a101"):
        response = self.client.post("/iot/device/connect", headers=self.headers(room))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def sync(self, state, sequence, room="a101"):
        response = self.client.post("/iot/device/sync", headers=self.headers(room), json={
            **state, "sequence": sequence,
        })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def command(self, on, revision):
        return self.client.put("/lighting/rooms/nhon-duc/A101/lights/light-1", json={
            "on": on, "expected_revision": revision,
        })

    def status(self, room="A101", light="light-1"):
        response = self.client.get("/lighting/lights")
        self.assertEqual(response.status_code, 200, response.text)
        return next(item for item in response.json() if item["room_id"] == room and item["light_id"] == light)

    def test_sync_reuses_locked_lights_and_command_avoids_refresh(self):
        state = self.connect()
        statements = []

        def record(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", record)
        try:
            self.sync(state, 0)
            light_reads = [
                sql for sql in statements
                if sql.startswith("SELECT") and "FROM room_light" in sql
            ]
            self.assertEqual(len(light_reads), 1)
            statements.clear()
            response = self.command(True, state["lights"][0]["revision"])
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["pending"])
            # User/role, target lookup, then device/light locks; no post-commit refresh.
            self.assertEqual(sum(sql.startswith("SELECT") for sql in statements), 5)
        finally:
            event.remove(engine, "before_cursor_execute", record)

    def test_two_way_and_board_isolation(self):
        state = self.sync(self.connect(), 0)
        other = self.sync(self.connect("a102"), 0, "a102")
        revision = state["lights"][0]["revision"]
        response = self.command(True, revision)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["pending"])
        self.assertFalse(response.json()["reported_on"])
        # Previous report cannot cancel the newer command.
        state = self.sync(state, 1)
        self.assertTrue(state["lights"][0]["on"])
        self.assertTrue(self.status()["pending"])
        state = self.sync(state, 2)
        self.assertFalse(self.status()["pending"])
        self.assertTrue(self.status()["reported_on"])
        self.assertFalse(self.status(light="light-2")["reported_on"])
        self.assertFalse(self.status(room="A102")["reported_on"])
        self.sync(other, 1, "a102")
        # Physical button reports the same acknowledged revision with a new state.
        state["lights"][0]["on"] = False
        self.sync(state, 3)
        self.assertFalse(self.status()["reported_on"])
        self.assertFalse(self.status()["desired_on"])
        with SessionLocal() as db:
            self.assertFalse(db.query(RoomLight).filter_by(room_id="A101", light_id="light-1").one().reported_on)

    def test_auth_and_device_scoping(self):
        self.client.cookies.clear()
        self.assertEqual(self.client.get("/lighting/lights").status_code, 401)
        self.assertEqual(self.client.post("/iot/device/connect").status_code, 422)
        self.assertEqual(self.client.post("/iot/device/connect", headers={
            **self.headers(), "X-Device-Key": "x" * 40,
        }).status_code, 401)
        state = self.connect()
        state["lights"][0]["light_id"] = "not-assigned"
        self.assertEqual(self.client.post("/iot/device/sync", headers=self.headers(), json={
            **state, "sequence": 0,
        }).status_code, 422)
        self.login(2)
        self.assertEqual(self.command(True, 1).status_code, 403)

    def test_stale_command_session_and_sequence(self):
        state = self.sync(self.connect(), 0)
        rev = state["lights"][0]["revision"]
        self.assertEqual(self.command(True, rev).status_code, 200)
        self.assertEqual(self.command(False, rev).status_code, 409)
        self.assertEqual(self.client.post("/iot/device/sync", headers=self.headers(), json={
            **state, "sequence": 0,
        }).status_code, 409)
        fresh = self.connect()
        self.assertEqual(self.client.post("/iot/device/sync", headers=self.headers(), json={
            **state, "sequence": 10,
        }).status_code, 409)
        self.sync(fresh, 0)
        self.assertTrue(self.status()["reported_on"])

    def test_offline_and_timeout(self):
        self.assertEqual(self.command(True, 0).status_code, 409)
        state = self.sync(self.connect(), 0)
        self.assertEqual(self.command(True, state["lights"][0]["revision"]).status_code, 200)
        with SessionLocal.begin() as db:
            light = db.query(RoomLight).filter_by(room_id="A101", light_id="light-1").one()
            light.requested_at = time.time() - COMMAND_TIMEOUT_SECONDS - 2
        self.assertTrue(self.status()["timed_out"])
        with SessionLocal.begin() as db:
            db.get(LightingDevice, "esp32-a101").last_seen = time.time() - OFFLINE_SECONDS - 2
        self.assertFalse(self.status()["online"])
        self.assertFalse(self.status()["reported_on"])

    def test_duplicate_or_future_reports_are_rejected(self):
        state = self.connect()
        duplicate = {**state, "sequence": 0, "lights": [state["lights"][0], state["lights"][0]]}
        self.assertEqual(self.client.post("/iot/device/sync", headers=self.headers(), json=duplicate).status_code, 422)
        state["lights"][0]["revision"] += 100
        self.assertEqual(self.client.post("/iot/device/sync", headers=self.headers(), json={
            **state, "sequence": 0,
        }).status_code, 409)


if __name__ == "__main__":
    unittest.main()
