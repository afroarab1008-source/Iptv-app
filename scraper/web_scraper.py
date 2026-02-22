"""Scrape web pages and paste sites for M3U/M3U8 playlist content.

Uses BeautifulSoup for HTML parsing and cloudscraper for anti-bot bypass.
"""
from __future__ import annotations

import logging
import re
from ipaddress import ip_address
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from http_client import fetch

logger = logging.getLogger(__name__)

_STREAM_SCHEMES = r'(?:https?|rtsp|rtp|udp|igmp|rtmp[ste]*|mms[ht]?|srt)'

M3U_URL_RE = re.compile(
    r'https?://[^\s<>"\')\]]+\.m3u8?(?:\?[^\s<>"\')\]]*)?',
    re.IGNORECASE,
)

STREAM_URL_RE = re.compile(
    _STREAM_SCHEMES + r'://[^\s<>"\')\]]+',
    re.IGNORECASE,
)

M3U_CONTENT_MARKERS = ("#EXTM3U", "#EXTINF")

NON_HTTP_STREAM_SCHEMES = {"rtsp", "rtp", "udp", "igmp", "rtmp", "rtmps", "rtmpe", "rtmpte", "mms", "mmsh", "mmst", "srt"}
HTTP_STREAM_HINTS = (
    ".m3u", ".m3u8", ".mpd", ".ts", ".m4s", ".mp4", ".aac",
    "/manifest", "/playlist", "/stream", "/hls", "/live",
    "type=m3u", "output=ts", "output=m3u8", "format=m3u",
)
MULTICAST_HOST_PORT_RE = re.compile(
    r'(?<![\d.])((?:22[4-9]|23\d)\.(?:\d{1,3}\.){2}\d{1,3})'
    r'(?:\s*:\s*|\s+on\s+port\s+|\s+port\s+|\s+)'
    r'(\d{2,5})(?!\d)',
    re.IGNORECASE,
)

PASTE_RAW_PATTERNS: dict[str, str] = {
    "pastebin.com": "https://pastebin.com/raw/{paste_id}",
    "rentry.co": "https://rentry.co/{paste_id}/raw",
    "rentry.org": "https://rentry.org/{paste_id}/raw",
    "dpaste.org": "https://dpaste.org/{paste_id}/raw",
    "dpaste.com": "https://dpaste.com/{paste_id}/raw",
    "paste.ee": "https://paste.ee/r/{paste_id}",
    "hastebin.com": "https://hastebin.com/raw/{paste_id}",
    "ghostbin.com": "https://ghostbin.com/paste/{paste_id}/raw",
    "controlc.com": "https://controlc.com/{paste_id}",
    "nopaste.net": "https://nopaste.net/raw/{paste_id}",
    "paste2.org": "https://paste2.org/{paste_id}/raw",
    "justpaste.it": "https://justpaste.it/{paste_id}",
    "textbin.net": "https://textbin.net/raw/{paste_id}",
}


def _resolve_paste_raw_url(url: str) -> str | None:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    path_parts = [p for p in parsed.path.strip("/").split("/") if p]
    if not path_parts or "/raw" in url:
        return None
    paste_id = path_parts[-1]
    for domain, template in PASTE_RAW_PATTERNS.items():
        if domain in host:
            raw_url = template.format(paste_id=paste_id)
            if raw_url != url:
                return raw_url
    return None


def _looks_like_m3u(text: str) -> bool:
    head = text[:5000]
    return any(marker in head for marker in M3U_CONTENT_MARKERS)


def _normalize_candidate_url(url: str) -> str:
    return (
        url.replace("\\/", "/")
        .replace("\\u002F", "/")
        .strip()
        .strip("\"'()[]{}<>")
        .rstrip(".,;")
    )


def _is_multicast_ipv4(host: str) -> bool:
    try:
        return ip_address(host).is_multicast
    except ValueError:
        return False


def _looks_like_http_stream_url(url: str) -> bool:
    parsed = urlparse(url)
    path = (parsed.path or "").lower()
    query = (parsed.query or "").lower()
    combined = f"{path}?{query}"
    return any(hint in combined for hint in HTTP_STREAM_HINTS)


def _extract_raw_stream_urls(text: str) -> list[str]:
    normalized_text = text.replace("\\/", "/").replace("\\u002F", "/")
    candidates = STREAM_URL_RE.findall(normalized_text)

    for host, port in MULTICAST_HOST_PORT_RE.findall(normalized_text):
        if _is_multicast_ipv4(host):
            candidates.append(f"udp://{host}:{port}")

    seen: set[str] = set()
    urls: list[str] = []
    for candidate in candidates:
        stream_url = _normalize_candidate_url(candidate)
        if not stream_url:
            continue
        parsed = urlparse(stream_url)
        scheme = (parsed.scheme or "").lower()
        if scheme in {"http", "https"} and not _looks_like_http_stream_url(stream_url):
            continue
        if scheme in NON_HTTP_STREAM_SCHEMES and not parsed.hostname:
            continue
        if stream_url not in seen:
            seen.add(stream_url)
            urls.append(stream_url)
    return urls


def _make_synthetic_m3u(urls: list[str], title_prefix: str = "Captured IPTV Stream") -> str:
    if not urls:
        return ""
    lines = ["#EXTM3U"]
    for index, stream_url in enumerate(urls, start=1):
        lines.append(f'#EXTINF:-1 group-title="Captured",{title_prefix} {index}')
        lines.append(stream_url)
    return "\n".join(lines)


def _extract_m3u_urls(html: str, base_url: str = "") -> list[str]:
    normalized_html = html.replace("\\/", "/").replace("\\u002F", "/")
    found = M3U_URL_RE.findall(normalized_html)
    try:
        soup = BeautifulSoup(normalized_html, "lxml")
        for tag in soup.find_all("a", href=True):
            href = tag["href"]
            if ".m3u" in href.lower():
                if base_url:
                    href = urljoin(base_url, href)
                found.append(href)
    except Exception:
        pass
    if base_url:
        found = [urljoin(base_url, u) for u in found]
    return list(dict.fromkeys(found))


def _is_paste_site(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return any(domain in host for domain in PASTE_RAW_PATTERNS)


def scrape_page_for_playlists(url: str, timeout: int = 12, depth: int = 0) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []

    raw_url = _resolve_paste_raw_url(url)
    fetch_target = raw_url or url

    text = fetch(fetch_target, timeout=timeout)
    if text is None:
        return results

    if _looks_like_m3u(text):
        results.append((url, text))
        return results

    m3u_links = _extract_m3u_urls(text, base_url=url)
    for link in m3u_links[:25]:
        m3u_text = fetch(link, timeout=8)
        if m3u_text and _looks_like_m3u(m3u_text):
            results.append((link, m3u_text))

    seen_result_urls = {stream_url for stream_url, _ in results}
    raw_stream_urls = [u for u in _extract_raw_stream_urls(text) if u not in seen_result_urls]
    if raw_stream_urls:
        synthetic = _make_synthetic_m3u(raw_stream_urls[:200])
        if synthetic:
            results.append((f"raw:{url}", synthetic))

    if depth < 1:
        try:
            soup = BeautifulSoup(text, "lxml")
            for tag in soup.find_all("a", href=True):
                href = urljoin(url, tag["href"])
                if _is_paste_site(href) and href not in {l for l, _ in results}:
                    results.extend(scrape_page_for_playlists(href, timeout=timeout, depth=depth + 1))
        except Exception:
            pass

    return results


def scrape_urls(urls: list[str], timeout: int = 12) -> list[tuple[str, str]]:
    all_results: list[tuple[str, str]] = []
    for url in urls:
        all_results.extend(scrape_page_for_playlists(url, timeout=timeout))
    return all_results
