import unittest
from unittest.mock import Mock, patch

from redis import RedisError

from core import redis_cache


class RedisCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_client = redis_cache._client
        self.previous_disabled = redis_cache._disabled
        self.previous_retry_after = redis_cache._retry_after
        redis_cache._client = None
        redis_cache._disabled = False
        redis_cache._retry_after = 0.0

    def tearDown(self) -> None:
        redis_cache._client = self.previous_client
        redis_cache._disabled = self.previous_disabled
        redis_cache._retry_after = self.previous_retry_after

    def test_reads_json_from_redis(self) -> None:
        client = Mock()
        client.get.return_value = '{"count":2}'
        redis_cache._client = client

        self.assertEqual(redis_cache.get_cached_json("analytics:key"), {"count": 2})

    def test_invalidates_keys_with_matching_prefix(self) -> None:
        client = Mock()
        client.scan_iter.return_value = ["analytics:first", "analytics:second"]
        redis_cache._client = client

        redis_cache.invalidate_cache_prefix("analytics:")

        client.delete.assert_called_once_with("analytics:first", "analytics:second")

    def test_cache_is_bypassed_when_redis_url_is_missing(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            with self.assertLogs("core.redis_cache", level="WARNING"):
                self.assertIsNone(redis_cache.get_cached_json("analytics:key"))
            redis_cache.set_cached_json("analytics:key", {"count": 2})

        self.assertTrue(redis_cache._disabled)

    def test_connection_failure_uses_a_retry_cooldown(self) -> None:
        client = Mock()
        client.ping.side_effect = RedisError("offline")

        with (
            patch.dict("os.environ", {"REDIS_URL": "redis://localhost:6379/0"}),
            patch.object(redis_cache.Redis, "from_url", return_value=client) as from_url,
            patch("core.redis_cache.time.monotonic", side_effect=[1.0, 1.5, 2.0]),
        ):
            with self.assertLogs("core.redis_cache", level="ERROR"):
                self.assertIsNone(redis_cache._get_client())
            self.assertIsNone(redis_cache._get_client())

        from_url.assert_called_once()
        client.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
