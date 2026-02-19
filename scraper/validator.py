"""Protocol-aware stream validator — armored against access blocks.

- HTTP/HTTPS: custom stream headers, SSL bypass, redirect following,
  reads actual stream bytes to confirm alive
- RTSP/RTMP/MMS/SRT: TCP connect to host:port
- UDP/RTP/IGMP: marked alive (can't probe remotely)

Every check is wrapped in try/except — never crashes.
"""
from __future__ import annotations

import asyncio
import logging
import random
import ssl
import time
from urllib.parse import urlparse

import aiohttp

from models import Channel

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 10
DEFAULT_CONCURRENCY = 120

MULTICAST_PROTOCOLS = {"UDP", "RTP", "IGMP"}
TCP_PROBE_PROTOCOLS = {"RTSP", "RTMP", "MMS", "SRT"}
HTTP_PROTOCOLS = {"HTTP"}

DEFAULT_PORTS: dict[str, int] = {
    "rtsp": 554, "rtmp": 1935, "rtmps": 1935, "rtmpe": 1935,
    "mms": 1755, "mmsh": 1755, "mmst": 1755, "srt": 9000,
}

STREAM_CONTENT_TYPES = {
    "application/vnd.apple.mpegurl", "application/x-mpegurl",
    "video/mp2t", "video/mp4", "application/octet-stream",
    "video/x-flv", "audio/mpegurl", "audio/x-mpegurl",
    "video/x-ms-asf", "video/mpeg", "audio/mpeg",
    "application/dash+xml", "video/webm",
}

STREAM_UAS = [
    "VLC/3.0.20 LibVLC/3.0.20",
    "Lavf/60.16.100",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "ExoPlayer/2.19.1",
    "Kodi/20.0",
    "okhttp/4.12.0",
    "stagefright/1.2 (Linux;Android 14)",
    "IPTVPlayer/1.0",
]

STREAM_HEADERS = {
    "Accept": "*/*",
    "Accept-Encoding": "identity",
    "Connection": "keep-alive",
}


def _random_stream_headers() -> dict[str, str]:
    h = dict(STREAM_HEADERS)
    h["User-Agent"] = random.choice(STREAM_UAS)
    return h


def _create_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    ctx.set_ciphers("DEFAULT@SECLEVEL=0")
    return ctx


async def _check_http(
    session: aiohttp.ClientSession,
    channel: Channel,
    timeout: int,
    semaphore: asyncio.Semaphore,
) -> Channel:
    """Validate HTTP stream with bypass headers and multiple strategies."""
    async with semaphore:
        headers_list = [
            _random_stream_headers(),
            {**_random_stream_headers(), "Referer": "https://www.google.com/"},
            {**_random_stream_headers(), "User-Agent": "VLC/3.0.20 LibVLC/3.0.20", "Range": "bytes=0-"},
        ]

        for attempt, headers in enumerate(headers_list):
            start = time.monotonic()
            try:
                async with session.get(
                    channel.url,
                    timeout=aiohttp.ClientTimeout(total=timeout),
                    allow_redirects=True,
                    headers=headers,
                    ssl=False,
                ) as resp:
                    if resp.status == 200 or resp.status == 206:
                        content_type = (resp.content_type or "").lower()
                        is_stream = any(ct in content_type for ct in STREAM_CONTENT_TYPES)
                        is_text = "text/html" in content_type

                        first_bytes = await resp.content.read(4096)
                        elapsed = (time.monotonic() - start) * 1000

                        has_data = len(first_bytes) > 0
                        looks_like_m3u = b"#EXTINF" in first_bytes or b"#EXTM3U" in first_bytes
                        looks_like_ts = (
                            (len(first_bytes) >= 3 and first_bytes[0:1] == b"\x47")
                            or (len(first_bytes) > 188 and first_bytes[188:189] == b"\x47")
                        )

                        channel.is_alive = has_data and (is_stream or looks_like_m3u or looks_like_ts or not is_text)
                        channel.response_time_ms = round(elapsed, 1)
                        return channel

                    if resp.status == 403 and attempt < len(headers_list) - 1:
                        continue

                    if resp.status == 302 or resp.status == 301:
                        continue

                    channel.is_alive = False
                    channel.response_time_ms = None
                    return channel

            except aiohttp.ClientSSLError:
                if attempt < len(headers_list) - 1:
                    continue
                channel.is_alive = False
                channel.response_time_ms = None
            except asyncio.TimeoutError:
                channel.is_alive = False
                channel.response_time_ms = None
            except aiohttp.ClientConnectorError:
                channel.is_alive = False
                channel.response_time_ms = None
            except Exception:
                if attempt < len(headers_list) - 1:
                    continue
                channel.is_alive = False
                channel.response_time_ms = None

    return channel


async def _check_tcp(
    channel: Channel,
    timeout: int,
    semaphore: asyncio.Semaphore,
) -> Channel:
    async with semaphore:
        start = time.monotonic()
        try:
            parsed = urlparse(channel.url)
            host = parsed.hostname or ""
            scheme = (parsed.scheme or "").lower()
            port = parsed.port or DEFAULT_PORTS.get(scheme, 554)
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=timeout,
            )
            elapsed = (time.monotonic() - start) * 1000
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            channel.is_alive = True
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

    ssl_ctx = _create_ssl_context()
    connector = aiohttp.TCPConnector(
        limit=concurrency,
        ssl=ssl_ctx,
        enable_cleanup_closed=True,
        force_close=True,
    )

    http_chs: list[Channel] = []
    tcp_chs: list[Channel] = []

    for ch in channels:
        if ch.protocol in HTTP_PROTOCOLS:
            http_chs.append(ch)
        elif ch.protocol in TCP_PROBE_PROTOCOLS:
            tcp_chs.append(ch)
        elif ch.protocol in MULTICAST_PROTOCOLS:
            ch.is_alive = True
        else:
            ch.is_alive = None

    logger.info(
        "Validating: %d HTTP, %d TCP, %d multicast",
        len(http_chs), len(tcp_chs),
        sum(1 for c in channels if c.protocol in MULTICAST_PROTOCOLS),
    )

    tasks: list[asyncio.Task] = []
    try:
        async with aiohttp.ClientSession(connector=connector) as session:
            for ch in http_chs:
                tasks.append(asyncio.create_task(_check_http(session, ch, timeout, semaphore)))
            for ch in tcp_chs:
                tasks.append(asyncio.create_task(_check_tcp(ch, timeout, semaphore)))
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as exc:
        logger.warning("Validation session error: %s — marking unchecked as unknown", exc)

    return channels


def validate_streams(
    channels: list[Channel],
    timeout: int = DEFAULT_TIMEOUT,
    concurrency: int = DEFAULT_CONCURRENCY,
) -> list[Channel]:
    """Validate channels — reads actual stream bytes, SSL bypass, custom headers."""
    if not channels:
        return channels
    logger.info("Validating %d streams (timeout=%ds, concurrency=%d)…", len(channels), timeout, concurrency)
    try:
        results = asyncio.run(_validate_all(channels, timeout, concurrency))
    except Exception as exc:
        logger.error("Validation crashed: %s — returning channels as-is", exc)
        return channels
    alive = sum(1 for ch in results if ch.is_alive is True)
    dead = sum(1 for ch in results if ch.is_alive is False)
    logger.info("Validation: %d alive, %d dead out of %d", alive, dead, len(results))
    return results
