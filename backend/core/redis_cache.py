import json
import logging
import os
import time
from json import JSONDecodeError
from typing import Any

from redis import Redis, RedisError

logger = logging.getLogger(__name__)
DEFAULT_CACHE_TTL_SECONDS = 30
REDIS_RETRY_DELAY_SECONDS = 30
_client: Redis | None = None
_disabled = False
_retry_after = 0.0


def _mark_unavailable(client: Redis) -> None:
    global _client, _retry_after
    if _client is client:
        _client = None
    _retry_after = time.monotonic() + REDIS_RETRY_DELAY_SECONDS
    client.close()


def _get_client() -> Redis | None:
    global _client, _disabled
    if _disabled:
        return None
    if time.monotonic() < _retry_after:
        return None
    if _client is not None:
        return _client

    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        logger.warning("Redis cache is disabled because REDIS_URL is not configured.")
        _disabled = True
        return None

    client = Redis.from_url(
        redis_url,
        decode_responses=True,
        socket_connect_timeout=0.25,
        socket_timeout=0.25,
    )
    try:
        client.ping()
    except RedisError:
        logger.exception("Redis cache is unavailable; continuing without response caching.")
        _mark_unavailable(client)
        return None

    _client = client
    return client


def get_cached_json(key: str) -> Any | None:
    client = _get_client()
    if client is None:
        return None
    try:
        value = client.get(key)
    except RedisError:
        logger.exception("Redis cache read failed for key %s.", key)
        _mark_unavailable(client)
        return None
    if value is None:
        return None
    try:
        return json.loads(value)
    except JSONDecodeError:
        logger.exception("Redis cache entry is invalid JSON for key %s.", key)
        return None


def set_cached_json(
    key: str,
    value: Any,
    ttl_seconds: int = DEFAULT_CACHE_TTL_SECONDS,
) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        client.set(key, json.dumps(value, default=str), ex=ttl_seconds)
    except RedisError:
        logger.exception("Redis cache write failed for key %s.", key)
        _mark_unavailable(client)


def invalidate_cache_prefix(prefix: str) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        keys = list(client.scan_iter(match=f"{prefix}*"))
        if keys:
            client.delete(*keys)
    except RedisError:
        logger.exception("Redis cache invalidation failed for prefix %s.", prefix)
        _mark_unavailable(client)
