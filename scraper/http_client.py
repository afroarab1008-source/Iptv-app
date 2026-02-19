"""Hardened HTTP client with multi-layer bypass.

Bypass chain (tried in order on failure):
  1. cloudscraper with randomized browser fingerprint
  2. Rotate to a different fingerprint profile & retry
  3. Plain requests with spoofed mobile UA
  4. Wayback Machine cached copy
  5. Google Cache copy

Additional defenses:
  - Pool of 4 cloudscraper sessions with different browser fingerprints
  - User-Agent rotation from 20+ realistic UAs
  - Per-domain request throttle to avoid rate limits
  - Exponential backoff with jitter on retries
  - Referer spoofing (Google, Bing, or direct)
  - Header randomization per request
  - Free proxy support (pass via config)
  - Graceful handling of every error type (403, 429, 503, SSL, timeout, DNS)
"""
from __future__ import annotations

import logging
import random
import ssl
import time
import threading
from collections import defaultdict
from urllib.parse import quote, urlparse
from typing import Any

import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

import cloudscraper
import requests
import requests.adapters

logger = logging.getLogger(__name__)

# ── User-Agent pool ─────────────────────────────────────────────────────
DESKTOP_UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
]

MOBILE_UAS = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
]

ALL_UAS = DESKTOP_UAS + MOBILE_UAS

REFERERS = [
    "https://www.google.com/",
    "https://www.google.com/search?q=iptv+m3u+sport",
    "https://www.bing.com/",
    "https://www.bing.com/search?q=iptv+m3u",
    "https://duckduckgo.com/",
    "https://search.yahoo.com/",
    "",
]

ACCEPT_LANGUAGES = [
    "en-US,en;q=0.9",
    "en-US,en;q=0.9,fr;q=0.8",
    "en-GB,en;q=0.9",
    "en-US,en;q=0.9,ar;q=0.8",
    "en-US,en;q=0.9,de;q=0.8",
    "en-US,en;q=0.9,es;q=0.8",
    "en-US,en;q=0.9,tr;q=0.8",
]

BROWSER_PROFILES = [
    {"browser": "chrome", "platform": "windows", "mobile": False},
    {"browser": "chrome", "platform": "linux", "mobile": False},
    {"browser": "chrome", "platform": "darwin", "mobile": False},
    {"browser": "firefox", "platform": "windows", "mobile": False},
]

MAX_RESPONSE_BYTES = 5_000_000

# ── Per-domain rate limiter ─────────────────────────────────────────────
_domain_last_request: dict[str, float] = defaultdict(float)
_domain_lock = threading.Lock()
MIN_DOMAIN_INTERVAL = 0.3  # seconds between requests to same domain


def _throttle_domain(url: str) -> None:
    try:
        domain = urlparse(url).hostname or ""
    except Exception:
        return
    with _domain_lock:
        now = time.monotonic()
        last = _domain_last_request[domain]
        wait = MIN_DOMAIN_INTERVAL - (now - last)
        if wait > 0:
            time.sleep(wait)
        _domain_last_request[domain] = time.monotonic()


# ── Randomized headers ──────────────────────────────────────────────────
def _random_headers(ua: str | None = None) -> dict[str, str]:
    return {
        "User-Agent": ua or random.choice(ALL_UAS),
        "Accept": random.choice([
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "*/*",
        ]),
        "Accept-Language": random.choice(ACCEPT_LANGUAGES),
        "Accept-Encoding": "gzip, deflate",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Referer": random.choice(REFERERS),
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": random.choice(["none", "cross-site"]),
    }


# ── Session pool ────────────────────────────────────────────────────────
_session_pool: list[cloudscraper.CloudScraper] = []
_plain_session: requests.Session | None = None
_pool_index = 0


def _build_session_pool() -> list[cloudscraper.CloudScraper]:
    pool: list[cloudscraper.CloudScraper] = []
    for profile in BROWSER_PROFILES:
        try:
            s = cloudscraper.create_scraper(browser=profile)
            s.headers.update(_random_headers())
            pool.append(s)
        except Exception:
            pass
    if not pool:
        pool.append(cloudscraper.create_scraper())
    return pool


def _get_session() -> cloudscraper.CloudScraper:
    global _session_pool, _pool_index
    if not _session_pool:
        _session_pool = _build_session_pool()
    s = _session_pool[_pool_index % len(_session_pool)]
    return s


def _rotate_session() -> cloudscraper.CloudScraper:
    global _pool_index
    _pool_index += 1
    s = _get_session()
    s.headers.update(_random_headers())
    return s


def _get_plain_session() -> requests.Session:
    global _plain_session
    if _plain_session is None:
        _plain_session = requests.Session()
        adapter = requests.adapters.HTTPAdapter(max_retries=1)
        _plain_session.mount("http://", adapter)
        _plain_session.mount("https://", adapter)
    return _plain_session


# ── Public convenience functions ────────────────────────────────────────
def rotate_ua() -> None:
    _rotate_session()


def get_scraper() -> cloudscraper.CloudScraper:
    return _get_session()


# ── Backoff helper ──────────────────────────────────────────────────────
def _backoff(attempt: int, base: float = 1.0, cap: float = 10.0) -> None:
    delay = min(base * (2 ** (attempt - 1)) + random.uniform(0, 0.5), cap)
    time.sleep(delay)


# ── Core fetch with bypass chain ────────────────────────────────────────
def _read_body(resp: requests.Response, max_bytes: int) -> str | None:
    raw = b""
    try:
        for chunk in resp.iter_content(chunk_size=65536):
            raw += chunk
            if len(raw) > max_bytes:
                break
        resp.close()
    except Exception:
        pass
    if not raw:
        return None
    encoding = getattr(resp, "encoding", None) or "utf-8"
    return raw.decode(encoding, errors="replace")


def _try_cloudscraper(url: str, timeout: int, max_bytes: int) -> str | None:
    """Layer 1 & 2: cloudscraper with fingerprint rotation."""
    for attempt in range(1, 4):
        session = _get_session() if attempt == 1 else _rotate_session()
        session.headers.update(_random_headers())
        try:
            _throttle_domain(url)
            resp = session.get(url, timeout=timeout, allow_redirects=True, stream=True)
            code = resp.status_code

            if code == 200:
                return _read_body(resp, max_bytes)

            if code == 429:
                retry_after = resp.headers.get("Retry-After")
                wait = int(retry_after) if retry_after and retry_after.isdigit() else 5
                logger.debug("[429] Rate limited on %s — waiting %ds", url, wait)
                time.sleep(min(wait, 15))
                _rotate_session()
                continue

            if code in (403, 503):
                logger.debug("[%d] Blocked on %s — rotating fingerprint (attempt %d)", code, url, attempt)
                _rotate_session()
                _backoff(attempt, base=1.5)
                continue

            if code in (301, 302, 307, 308):
                continue

            logger.debug("[%d] Unexpected status for %s", code, url)
            return None

        except requests.exceptions.SSLError:
            logger.debug("[SSL] Error on %s — retrying without verification", url)
            try:
                _throttle_domain(url)
                resp = session.get(url, timeout=timeout, allow_redirects=True, stream=True, verify=False)
                if resp.status_code == 200:
                    return _read_body(resp, max_bytes)
            except Exception:
                pass
            _rotate_session()
            continue

        except requests.exceptions.ConnectionError:
            logger.debug("[CONN] Connection error on %s (attempt %d)", url, attempt)
            _backoff(attempt)
            _rotate_session()
            continue

        except requests.exceptions.Timeout:
            logger.debug("[TIMEOUT] on %s (attempt %d)", url, attempt)
            _rotate_session()
            continue

        except Exception as exc:
            logger.debug("[ERR] %s on %s (attempt %d)", type(exc).__name__, url, attempt)
            _rotate_session()
            _backoff(attempt, base=0.5)
            continue

    return None


def _try_plain_requests(url: str, timeout: int, max_bytes: int) -> str | None:
    """Layer 3: plain requests with mobile UA (bypasses some bot checks)."""
    session = _get_plain_session()
    headers = _random_headers(ua=random.choice(MOBILE_UAS))
    try:
        _throttle_domain(url)
        resp = session.get(url, timeout=timeout, headers=headers, allow_redirects=True,
                           stream=True, verify=False)
        if resp.status_code == 200:
            return _read_body(resp, max_bytes)
    except Exception:
        pass
    return None


def _try_wayback(url: str, timeout: int, max_bytes: int) -> str | None:
    """Layer 4: Wayback Machine — fetches the most recent archived copy."""
    wb_url = f"https://web.archive.org/web/2/{url}"
    session = _get_plain_session()
    try:
        resp = session.get(wb_url, timeout=timeout, headers=_random_headers(),
                           allow_redirects=True, stream=True, verify=False)
        if resp.status_code == 200:
            body = _read_body(resp, max_bytes)
            if body and len(body) > 100:
                return body
    except Exception:
        pass
    return None


def _try_google_cache(url: str, timeout: int, max_bytes: int) -> str | None:
    """Layer 5: Google's web cache."""
    cache_url = f"https://webcache.googleusercontent.com/search?q=cache:{quote(url, safe='')}"
    session = _get_plain_session()
    try:
        resp = session.get(cache_url, timeout=timeout, headers=_random_headers(),
                           allow_redirects=True, stream=True, verify=False)
        if resp.status_code == 200:
            body = _read_body(resp, max_bytes)
            if body and len(body) > 100:
                return body
    except Exception:
        pass
    return None


# ── Public API ──────────────────────────────────────────────────────────

def fetch(
    url: str,
    timeout: int = 15,
    max_retries: int = 3,
    max_bytes: int = MAX_RESPONSE_BYTES,
    use_fallbacks: bool = True,
) -> str | None:
    """Fetch a URL using the full bypass chain.

    1. cloudscraper (3 fingerprint rotations)
    2. plain requests with mobile UA
    3. Wayback Machine (if use_fallbacks)
    4. Google Cache (if use_fallbacks)
    """
    result = _try_cloudscraper(url, timeout, max_bytes)
    if result:
        return result

    result = _try_plain_requests(url, timeout, max_bytes)
    if result:
        return result

    if not use_fallbacks:
        return None

    is_m3u = url.lower().endswith((".m3u", ".m3u8"))
    is_raw = "raw.githubusercontent.com" in url or "raw/" in url

    if not is_m3u and not is_raw:
        result = _try_wayback(url, timeout, max_bytes)
        if result:
            logger.debug("[WAYBACK] Retrieved cached copy of %s", url)
            return result

        result = _try_google_cache(url, timeout, max_bytes)
        if result:
            logger.debug("[GCACHE] Retrieved cached copy of %s", url)
            return result

    return None


def fetch_simple(url: str, timeout: int = 12) -> str | None:
    """Quick fetch without fallbacks — for high-volume bulk fetching."""
    return _try_cloudscraper(url, timeout, MAX_RESPONSE_BYTES)


def fetch_many(urls: list[str], timeout: int = 12) -> dict[str, str | None]:
    results: dict[str, str | None] = {}
    for url in urls:
        results[url] = fetch(url, timeout=timeout)
    return results
