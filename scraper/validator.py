from __future__ import annotations

import asyncio
import logging
import time

import aiohttp

from models import Channel

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 10
DEFAULT_CONCURRENCY = 50


async def _check_stream(
    session: aiohttp.ClientSession,
    channel: Channel,
    timeout: int,
    semaphore: asyncio.Semaphore,
) -> Channel:
    async with semaphore:
        start = time.monotonic()
        try:
            async with session.head(channel.url, timeout=aiohttp.ClientTimeout(total=timeout), allow_redirects=True) as resp:
                elapsed = (time.monotonic() - start) * 1000
                channel.is_alive = resp.status < 400
                channel.response_time_ms = round(elapsed, 1)
        except Exception:
            try:
                async with session.get(channel.url, timeout=aiohttp.ClientTimeout(total=timeout), allow_redirects=True) as resp:
                    elapsed = (time.monotonic() - start) * 1000
                    channel.is_alive = resp.status < 400
                    channel.response_time_ms = round(elapsed, 1)
            except Exception:
                channel.is_alive = False
                channel.response_time_ms = None
    return channel


async def _validate_all(
    channels: list[Channel],
    timeout: int = DEFAULT_TIMEOUT,
    concurrency: int = DEFAULT_CONCURRENCY,
) -> list[Channel]:
    semaphore = asyncio.Semaphore(concurrency)
    connector = aiohttp.TCPConnector(limit=concurrency, ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = [_check_stream(session, ch, timeout, semaphore) for ch in channels]
        results = await asyncio.gather(*tasks)
    return list(results)


def validate_streams(
    channels: list[Channel],
    timeout: int = DEFAULT_TIMEOUT,
    concurrency: int = DEFAULT_CONCURRENCY,
) -> list[Channel]:
    """Validate a list of channels and set is_alive / response_time_ms on each."""
    logger.info("Validating %d streams (timeout=%ds, concurrency=%d)…", len(channels), timeout, concurrency)
    results = asyncio.run(_validate_all(channels, timeout, concurrency))
    alive = sum(1 for ch in results if ch.is_alive)
    logger.info("Validation complete: %d alive, %d dead out of %d", alive, len(results) - alive, len(results))
    return results
