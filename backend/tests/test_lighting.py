import base64
import hashlib
import os
import secrets
import tempfile
import time
import unittest
from unittest.mock import patch
from datetime import date, datetime

_directory = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_directory.name, "lighting.db")
os.environ["JWT_SECRET"] = secrets.token_urlsafe(48)
os.environ["HASH_KEY"] = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()

from fastapi.testclient import TestClient
from sqlalchemy import event
from app.lighting.models import LightingDevice, RoomLight, LightEnergyMeter, LightEnergyInterval
from app.lighting import energy, service
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
            # Active-user middleware, user/role, target, device/light locks; no post-commit refresh.
            self.assertEqual(sum(sql.startswith("SELECT") for sql in statements), 6)
        finally:
            event.remove(engine, "before_cursor_execute", record)

    def power(self, watts, room="A101", light="light-1"):
        return self.client.put(
            f"/lighting/rooms/nhon-duc/{room}/lights/{light}/power", json={"watts": watts},
        )

    def test_energy_automatically_tracks_without_power_input(self):
        base = datetime(2026, 10, 24, 12, tzinfo=energy.LOCAL_TIMEZONE).timestamp()
        with patch.object(service.time, "time", return_value=base):
            state = self.sync(self.connect(), 0)
        state["lights"][0]["on"] = True
        with patch.object(service.time, "time", return_value=base + 5):
            state = self.sync(state, 1)
        with patch.object(service.time, "time", return_value=base + 15):
            state = self.sync(state, 2)
        with SessionLocal() as db:
            result = energy.summarize(db, 1, OFFLINE_SECONDS, now=base + 20)
            self.assertEqual(len(result["lights"]), 2)
            self.assertEqual(result["lights"][0]["watts"], energy.DEFAULT_LIGHT_WATTS)
            self.assertAlmostEqual(result["energy_kwh"], energy.DEFAULT_LIGHT_WATTS * 15 / 3_600_000)
            self.assertEqual(result["rooms"][0]["current_watts"], energy.DEFAULT_LIGHT_WATTS)
        state["lights"][0]["on"] = False
        with patch.object(service.time, "time", return_value=base + 25):
            self.sync(state, 3)
        with SessionLocal() as db:
            result = energy.summarize(db, 1, OFFLINE_SECONDS, now=base + 30)
            self.assertAlmostEqual(result["energy_kwh"], energy.DEFAULT_LIGHT_WATTS * 20 / 3_600_000)
            self.assertEqual(result["rooms"][0]["current_watts"], 0)
        # Automatic setup must not overwrite an operator's existing per-light setting.
        with patch.object(service.time, "time", return_value=base + 31):
            self.assertEqual(self.power(18).status_code, 200)
        with patch.object(service.time, "time", return_value=base + 32):
            self.sync(state, 4)
        with SessionLocal() as db:
            result = energy.summarize(db, 1, OFFLINE_SECONDS, now=base + 33)
            self.assertEqual(result["lights"][0]["watts"], 18)

    def test_energy_configuration_permissions_and_validation(self):
        self.client.cookies.clear()
        self.assertEqual(self.client.get("/lighting/energy").status_code, 401)
        self.login(2)
        self.assertEqual(self.power(20).status_code, 403)
        self.login(1)
        for watts in (0, -20, 10001, True, "20"):
            self.assertEqual(self.power(watts).status_code, 422)
        self.assertEqual(self.power(20, light="missing").status_code, 404)
        self.assertEqual(self.client.get("/lighting/energy?room_id=A101").status_code, 422)
        self.assertEqual(self.client.get("/lighting/energy?days=91").status_code, 422)
        empty = self.client.get("/lighting/energy").json()
        self.assertIsNone(empty["energy_kwh"])
        self.assertIsNone(empty["average_kwh"])
        self.assertEqual(len(empty["daily"]), 7)
        self.assertTrue(all(day["energy_kwh"] is None for day in empty["daily"]))

    def test_energy_confirmed_state_not_command_and_no_duplicate_heartbeats(self):
        base = time.time()
        with patch.object(service.time, "time", return_value=base):
            self.assertEqual(self.power(20).status_code, 200)
            state = self.sync(self.connect(), 0)
            self.assertEqual(self.command(True, state["lights"][0]["revision"]).status_code, 200)
        # Pending command is not consumption; first sync still reports GPIO off.
        with patch.object(service.time, "time", return_value=base + 5):
            state = self.sync(state, 1)
        with patch.object(service.time, "time", return_value=base + 10):
            state = self.sync(state, 2)
        with patch.object(service.time, "time", return_value=base + 20):
            state = self.sync(state, 3)
        with SessionLocal() as db:
            result = energy.summarize(db, 1, OFFLINE_SECONDS, now=base + 25)
            self.assertAlmostEqual(result["energy_kwh"], 20 * 15 / 3_600_000)
            self.assertEqual(result["lights"][0]["on_seconds"], 15)
        state["lights"][0]["on"] = False
        with patch.object(service.time, "time", return_value=base + 30):
            self.sync(state, 4)
        # New DB session represents a server restart: persisted intervals still count once.
        with SessionLocal() as db:
            result = energy.summarize(db, 1, OFFLINE_SECONDS, now=base + 35)
            self.assertAlmostEqual(result["energy_kwh"], 20 * 20 / 3_600_000)
            self.assertEqual(result["lights"][0]["current_watts"], 0)
            intervals = db.query(LightEnergyInterval).all()
            self.assertEqual(sum(i.end_at - i.start_at for i in intervals if i.on), 20)

    def test_energy_midnight_outage_power_change_and_room_average(self):
        midnight = datetime(2026, 10, 24, tzinfo=energy.LOCAL_TIMEZONE).timestamp()
        with SessionLocal.begin() as db:
            lights = db.query(RoomLight).filter_by(light_id="light-1").order_by(RoomLight.room_id).all()
            first_light_id = lights[0].id
            meter = LightEnergyMeter(
                light_id=lights[0].id, watts=20, started_at=midnight - 1800,
                state_since=midnight - 1800, on=True, confirmed_at=midnight,
            )
            db.add(meter)
            db.flush()
            # Confirmed 20 W for 30 minutes, then change to 40 W.
            energy.close_interval(db, meter, midnight, 3600)
            meter.watts = 40
            energy.record_report(db, meter, True, midnight + 1800, 3600)
            # Second configured room has only unknown time; must not dilute the average.
            db.add(LightEnergyMeter(
                light_id=lights[1].id, watts=20, started_at=midnight,
                state_since=midnight,
            ))
        with SessionLocal() as db:
            result = energy.summarize(db, 2, 3600, now=midnight + 1800)
            self.assertAlmostEqual(result["energy_kwh"], .03)
            self.assertEqual(result["configured_rooms"], 2)
            self.assertEqual(result["rooms_with_data"], 1)
            self.assertAlmostEqual(result["average_kwh"], .03)
            self.assertAlmostEqual(result["daily"][0]["energy_kwh"], .01)
            self.assertAlmostEqual(result["daily"][1]["energy_kwh"], .02)
            historical_day = energy.summarize(
                db, 1, 3600, now=midnight + 1800, end_date=date(2026, 10, 23),
            )
            self.assertEqual(historical_day["start_date"], "2026-10-23")
            self.assertEqual(historical_day["end_date"], "2026-10-23")
            self.assertEqual(len(historical_day["daily"]), 1)
            self.assertAlmostEqual(historical_day["energy_kwh"], .01)
        # No report for 2 hours: count only until the 1-hour grace boundary.
        with SessionLocal() as db:
            result = energy.summarize(db, 1, 3600, now=midnight + 9000)
            self.assertAlmostEqual(result["energy_kwh"], .06)
            self.assertIsNone(result["lights"][0]["current_watts"])
            self.assertEqual(result["lights"][0]["unknown_seconds"], 3600)
        # Reconnection closes the unknown gap rather than backfilling energy.
        with SessionLocal.begin() as db:
            meter = db.get(LightEnergyMeter, first_light_id)
            energy.record_report(db, meter, False, midnight + 9000, 3600)
        with SessionLocal() as db:
            result = energy.summarize(db, 1, 3600, campus_id="nhon-duc", room_id="A101", now=midnight + 9010)
            self.assertAlmostEqual(result["energy_kwh"], .06)
            self.assertEqual(result["lights"][0]["unknown_seconds"], 3600)
            self.assertEqual(result["lights"][0]["current_watts"], 0)
            self.assertEqual(len(result["rooms"]), 1)

    def test_energy_reconnect_does_not_invent_state_and_config_is_not_retroactive(self):
        base = time.time()
        with patch.object(service.time, "time", return_value=base):
            self.power(20)
            state = self.sync(self.connect(), 0)
        state["lights"][0]["on"] = True
        with patch.object(service.time, "time", return_value=base + 5):
            self.sync(state, 1)
        with patch.object(service.time, "time", return_value=base + 10):
            self.assertEqual(self.power(40).status_code, 200)
        with patch.object(service.time, "time", return_value=base + 15):
            self.connect()
        with SessionLocal() as db:
            result = energy.summarize(db, 1, OFFLINE_SECONDS, now=base + 25)
            self.assertAlmostEqual(result["energy_kwh"], (20 * 5 + 40 * 5) / 3_600_000)
            self.assertEqual(result["lights"][0]["unknown_seconds"], 10)
            self.assertIsNone(result["lights"][0]["current_watts"])

    def test_energy_two_lights_example_and_valid_zero_room(self):
        base = datetime(2026, 10, 24, 12, tzinfo=energy.LOCAL_TIMEZONE).timestamp()
        with SessionLocal.begin() as db:
            for light in db.query(RoomLight).all():
                db.add(LightEnergyMeter(
                    light_id=light.id, watts=20, started_at=base, state_since=base,
                    on=light.room_id == "A101", confirmed_at=base + 1800,
                ))
        with SessionLocal() as db:
            result = energy.summarize(db, 1, OFFLINE_SECONDS, now=base + 1800)
            self.assertAlmostEqual(result["energy_kwh"], .02)
            self.assertAlmostEqual(result["average_kwh"], .01)
            self.assertEqual(result["rooms_with_data"], 2)
            self.assertAlmostEqual(result["daily"][0]["energy_kwh"], .02)
            self.assertEqual(result["rooms"][1]["energy_kwh"], 0)
            self.assertEqual(result["rooms"][0]["current_watts"], 40)
            self.assertEqual(result["rooms"][1]["current_watts"], 0)
            empty = energy.summarize(db, 7, OFFLINE_SECONDS, campus_id="not-monitored", now=base + 1800)
            self.assertIsNone(empty["energy_kwh"])
            self.assertEqual(empty["configured_rooms"], 0)

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
