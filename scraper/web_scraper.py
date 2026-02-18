"""Scrape web pages and paste sites for M3U/M3U8 playlist links and inline content."""
from __future__ import annotations

import logging
import re
from urllib.parse import urljoin, urlparse

import requests

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

M3U_URL_RE = re.compile(
    r'https?://[^\s<>"\']+\.m3u8?(?:\?[^\s<>"\']*)?',
    re.IGNORECASE,
)

M3U_CONTENT_MARKERS = ("#EXTM3U", "#EXTINF")

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
}


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    return s


def _resolve_paste_raw_url(url: str) -> str | None:
    """Convert a paste site URL to its raw variant if recognized."""
    parsed = urlparse(url)
    host = parsed.hostname or ""
    path_parts = [p for p in parsed.path.strip("/").split("/") if p]
    if not path_parts:
        return None
    paste_id = path_parts[-1]

    for domain, template in PASTE_RAW_PATTERNS.items():
        if domain in host:
            raw_url = template.format(paste_id=paste_id)
            if raw_url != url:
                return raw_url
    return None


def fetch_url(url: str, timeout: int = 20) -> str | None:
    """Fetch a URL and return its text, or None on failure."""
    sess = _session()
    try:
        resp = sess.get(url, timeout=timeout, allow_redirects=True)
        if resp.status_code == 200:
            return resp.text
        logger.warning("HTTP %d for %s", resp.status_code, url)
    except requests.RequestException as exc:
        logger.warning("Failed to fetch %s: %s", url, exc)
    return None


def extract_m3u_urls(html: str, base_url: str = "") -> list[str]:
    """Pull all M3U/M3U8 URLs out of a page's HTML or text."""
    found = M3U_URL_RE.findall(html)
    if base_url:
        found = [urljoin(base_url, u) for u in found]
    return list(dict.fromkeys(found))


def _looks_like_m3u(text: str) -> bool:
    for marker in M3U_CONTENT_MARKERS:
        if marker in text[:2000]:
            return True
    return False


def scrape_page_for_playlists(url: str, timeout: int = 20) -> list[tuple[str, str]]:
    """Scrape a URL and return (source_label, m3u_text) pairs.

    If the URL itself is a raw M3U, return it directly.
    If it's a paste site, try the raw variant.
    Otherwise, extract M3U links from the page and fetch each one.
    """
    results: list[tuple[str, str]] = []

    raw_url = _resolve_paste_raw_url(url)
    fetch_target = raw_url or url

    text = fetch_url(fetch_target, timeout=timeout)
    if text is None:
        return results

    if _looks_like_m3u(text):
        results.append((url, text))
        return results

    m3u_links = extract_m3u_urls(text, base_url=url)
    logger.info("Found %d M3U links on %s", len(m3u_links), url)

    for link in m3u_links:
        m3u_text = fetch_url(link, timeout=timeout)
        if m3u_text and _looks_like_m3u(m3u_text):
            results.append((link, m3u_text))

    return results


def scrape_urls(urls: list[str], timeout: int = 20) -> list[tuple[str, str]]:
    """Scrape a list of URLs and return all discovered (label, m3u_text) pairs."""
    all_results: list[tuple[str, str]] = []
    for url in urls:
        all_results.extend(scrape_page_for_playlists(url, timeout=timeout))
    return all_results
