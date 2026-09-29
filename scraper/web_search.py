"""Multi-engine web search for premium sports IPTV M3U links — MAXIMUM VOLUME.

Sources:
  - Google + DuckDuckGo in 15+ languages
  - 19 Telegram public channels
  - 80+ aggregator M3U URLs (iptv-org countries/languages/categories)
  - IPTV listing sites (iptvcat, fluxustv, listm3u, comfortskillz, etc.)
  - Xtream Codes panel URL pattern scanning
  - Paste sites (pastebin, rentry, justpaste)
  - Russian self-updating IPTV sites
  - Concurrent 12-worker page scraping with raw stream URL extraction
"""
from __future__ import annotations

import base64
import concurrent.futures
import logging
import re
import time
from html import unescape
from ipaddress import ip_address
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup
from duckduckgo_search import DDGS

from http_client import fetch, fetch_simple, rotate_ua

logger = logging.getLogger(__name__)

_STREAM_SCHEMES = r'(?:https?|rtsp|rtp|udp|igmp|rtmp[ste]*|mms[ht]?|srt)'

M3U_LINK_RE = re.compile(
    r'https?://[^\s<>"\')\]]+\.m3u8?(?:\?[^\s<>"\')\]]*)?',
    re.IGNORECASE,
)

STREAM_URL_RE = re.compile(
    _STREAM_SCHEMES + r'://[^\s<>"\')\]]+',
    re.IGNORECASE,
)

M3U_CONTENT_RE = re.compile(r'#EXTM3U|#EXTINF', re.IGNORECASE)

BASE64_M3U_RE = re.compile(r'[A-Za-z0-9+/]{40,}={0,2}')

XTREAM_GET_RE = re.compile(
    r'https?://[^\s<>"\')\]]+/get\.php\?username=[^\s<>"\')\]&]+&password=[^\s<>"\')\]&]+',
    re.IGNORECASE,
)

XTREAM_PLAYER_API_RE = re.compile(
    r'https?://[^\s<>"\')\]]+/player_api\.php\?username=[^\s<>"\')\]&]+&password=[^\s<>"\')\]&]+',
    re.IGNORECASE,
)

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

# ── Search queries in 15+ languages ─────────────────────────────────────
DEFAULT_SEARCH_QUERIES = [
    # English — general
    "bein sport m3u m3u8 playlist working 2026",
    "bein sports iptv m3u free working",
    "dazn iptv m3u8 stream link",
    "sky sports iptv m3u playlist free",
    "espn iptv m3u m3u8 live stream",
    "bein sport hd m3u pastebin",
    "bein sport m3u github raw",
    "dazn m3u8 free stream link",
    "sky sports premier league m3u iptv",
    "supersport iptv m3u playlist",
    "fox sports m3u8 iptv stream",
    "bt sport tnt sports m3u iptv",
    "sport iptv m3u playlist all channels working",
    "premium sport channels m3u8 live free",
    "bein sport m3u rentry justpaste",
    "arena sport m3u iptv link",
    "eurosport m3u8 iptv free 2026",
    "star sports m3u m3u8 iptv",
    "sony sports m3u iptv free",
    "willow cricket m3u8 live",
    "nba nfl m3u8 iptv stream free",
    "free iptv m3u sports 2026",
    "iptv playlist m3u sport hd",
    "sport m3u daily updated playlist",
    # English — IPTV apps & Xtream Codes
    "iptv smarters pro m3u playlist url free sport",
    "tivimate m3u playlist url free working",
    "xtream codes iptv free trial sport m3u",
    "iptv smarters m3u url sport channels 2026",
    "xciptv ibo player m3u playlist sport",
    "iptv m3u url free daily updated all channels",
    "free iptv links m3u playlist updated today",
    "daily iptv m3u list free 2026",
    # English — site-specific
    "site:pastebin.com bein sport m3u EXTINF",
    "site:pastebin.com iptv sport m3u8",
    "site:rentry.co iptv sport m3u",
    "site:rentry.org sport m3u",
    "site:justpaste.it bein sport m3u",
    "site:controlc.com iptv m3u sport",
    "site:paste.ee iptv m3u sport",
    "site:github.com iptv m3u sport playlist",
    "site:dpaste.org iptv m3u",
    # Arabic (beIN Sports heartland)
    "bein sport m3u قنوات رياضية",
    "iptv bein sport m3u مجاني",
    "بين سبورت m3u8 مباشر",
    "iptv m3u قنوات رياضية 2026",
    "bein sport m3u عربي مجاني",
    "روابط iptv مجانية m3u رياضة",
    "iptv m3u بث مباشر رياضي",
    "iptv مجاني m3u قنوات بين سبورت",
    # French
    "bein sport m3u gratuit",
    "iptv sport m3u france gratuit",
    "canal+ sport m3u8 iptv gratuit",
    "rmc sport m3u iptv lien",
    "iptv m3u sport gratuit 2026",
    "liste iptv m3u sport gratuit",
    "lien m3u iptv bein sport canal",
    # Turkish
    "bein sport m3u türkiye",
    "iptv spor m3u8 canlı",
    "bein sport m3u canlı izle",
    "ücretsiz iptv m3u spor kanalları",
    "iptv m3u güncel spor 2026",
    # Spanish
    "bein sport m3u iptv gratis",
    "movistar deportes m3u iptv",
    "dazn m3u8 iptv gratis españa",
    "iptv deportes m3u lista gratis",
    "lista iptv m3u deportes 2026 gratis",
    "iptv m3u canales deportivos gratis",
    # Portuguese
    "sport tv m3u iptv gratis",
    "iptv desporto m3u lista",
    "iptv m3u esporte grátis 2026",
    "lista iptv m3u esportes brasil",
    # Italian
    "dazn m3u iptv italia gratis",
    "sky sport m3u italia",
    "iptv sport m3u lista italiana gratis",
    # German
    "sky sport m3u iptv kostenlos",
    "dazn m3u8 iptv deutsch",
    "iptv sport m3u kostenlos 2026",
    # Russian
    "iptv m3u спорт бесплатно 2026",
    "бесплатные iptv m3u плейлисты спорт",
    "самообновляемые iptv плейлисты m3u спорт",
    "iptv плейлист m3u спортивные каналы",
    # Persian / Farsi
    "iptv m3u ورزشی رایگان",
    "bein sport m3u رایگان",
    # Hindi
    "iptv m3u sports free hindi",
    "star sports m3u free iptv hindi",
    "sony sports m3u iptv hindi",
    # Korean
    "iptv m3u 스포츠 무료",
    # Japanese
    "iptv m3u スポーツ 無料",
    # Chinese
    "iptv m3u 体育 免费",
    "iptv m3u 体育频道 免费直播",
    # Indonesian / Malay
    "iptv m3u sport gratis indonesia",
    "iptv m3u sukan percuma",
    # Polish
    "iptv m3u sport za darmo 2026",
    "canal+ sport m3u polska",
    # Romanian
    "iptv m3u sport gratis romania",
    "digi sport m3u iptv",
    # Dutch
    "ziggo sport m3u iptv gratis",
    # Greek
    "iptv m3u αθλητικά δωρεάν",
    # Thai
    "iptv m3u กีฬา ฟรี",
    # Vietnamese
    "iptv m3u thể thao miễn phí",
    # Swedish
    "iptv m3u sport gratis 2026",
]

# ── 80+ known M3U aggregator URLs ───────────────────────────────────────
AGGREGATOR_URLS = [
    # iptv-org — main playlists
    "https://iptv-org.github.io/iptv/index.m3u",
    "https://iptv-org.github.io/iptv/categories/sports.m3u",
    "https://iptv-org.github.io/iptv/index.category.m3u",
    # iptv-org — sport-heavy countries
    "https://iptv-org.github.io/iptv/countries/in.m3u",
    "https://iptv-org.github.io/iptv/countries/gb.m3u",
    "https://iptv-org.github.io/iptv/countries/us.m3u",
    "https://iptv-org.github.io/iptv/countries/fr.m3u",
    "https://iptv-org.github.io/iptv/countries/de.m3u",
    "https://iptv-org.github.io/iptv/countries/it.m3u",
    "https://iptv-org.github.io/iptv/countries/es.m3u",
    "https://iptv-org.github.io/iptv/countries/tr.m3u",
    "https://iptv-org.github.io/iptv/countries/ae.m3u",
    "https://iptv-org.github.io/iptv/countries/qa.m3u",
    "https://iptv-org.github.io/iptv/countries/sa.m3u",
    "https://iptv-org.github.io/iptv/countries/br.m3u",
    "https://iptv-org.github.io/iptv/countries/pt.m3u",
    "https://iptv-org.github.io/iptv/countries/rs.m3u",
    "https://iptv-org.github.io/iptv/countries/za.m3u",
    "https://iptv-org.github.io/iptv/countries/au.m3u",
    "https://iptv-org.github.io/iptv/countries/ca.m3u",
    "https://iptv-org.github.io/iptv/countries/nl.m3u",
    "https://iptv-org.github.io/iptv/countries/pl.m3u",
    "https://iptv-org.github.io/iptv/countries/ro.m3u",
    "https://iptv-org.github.io/iptv/countries/se.m3u",
    "https://iptv-org.github.io/iptv/countries/no.m3u",
    "https://iptv-org.github.io/iptv/countries/ru.m3u",
    "https://iptv-org.github.io/iptv/countries/ge.m3u",
    "https://iptv-org.github.io/iptv/countries/eg.m3u",
    "https://iptv-org.github.io/iptv/countries/dz.m3u",
    "https://iptv-org.github.io/iptv/countries/ma.m3u",
    "https://iptv-org.github.io/iptv/countries/pk.m3u",
    "https://iptv-org.github.io/iptv/countries/id.m3u",
    "https://iptv-org.github.io/iptv/countries/my.m3u",
    "https://iptv-org.github.io/iptv/countries/th.m3u",
    "https://iptv-org.github.io/iptv/countries/kr.m3u",
    "https://iptv-org.github.io/iptv/countries/jp.m3u",
    "https://iptv-org.github.io/iptv/countries/cn.m3u",
    "https://iptv-org.github.io/iptv/countries/ar.m3u",
    "https://iptv-org.github.io/iptv/countries/co.m3u",
    "https://iptv-org.github.io/iptv/countries/mx.m3u",
    "https://iptv-org.github.io/iptv/countries/ng.m3u",
    "https://iptv-org.github.io/iptv/countries/ke.m3u",
    "https://iptv-org.github.io/iptv/countries/gh.m3u",
    "https://iptv-org.github.io/iptv/countries/ir.m3u",
    "https://iptv-org.github.io/iptv/countries/iq.m3u",
    "https://iptv-org.github.io/iptv/countries/gr.m3u",
    "https://iptv-org.github.io/iptv/countries/bg.m3u",
    "https://iptv-org.github.io/iptv/countries/hr.m3u",
    "https://iptv-org.github.io/iptv/countries/ba.m3u",
    "https://iptv-org.github.io/iptv/countries/al.m3u",
    # iptv-org — key languages
    "https://iptv-org.github.io/iptv/languages/ara.m3u",
    "https://iptv-org.github.io/iptv/languages/hin.m3u",
    "https://iptv-org.github.io/iptv/languages/por.m3u",
    "https://iptv-org.github.io/iptv/languages/tur.m3u",
    "https://iptv-org.github.io/iptv/languages/spa.m3u",
    "https://iptv-org.github.io/iptv/languages/fra.m3u",
    "https://iptv-org.github.io/iptv/languages/deu.m3u",
    "https://iptv-org.github.io/iptv/languages/ita.m3u",
    "https://iptv-org.github.io/iptv/languages/rus.m3u",
    "https://iptv-org.github.io/iptv/languages/fas.m3u",
    "https://iptv-org.github.io/iptv/languages/zho.m3u",
    "https://iptv-org.github.io/iptv/languages/jpn.m3u",
    "https://iptv-org.github.io/iptv/languages/kor.m3u",
    "https://iptv-org.github.io/iptv/languages/tha.m3u",
    "https://iptv-org.github.io/iptv/languages/ind.m3u",
    "https://iptv-org.github.io/iptv/languages/srp.m3u",
    "https://iptv-org.github.io/iptv/languages/pol.m3u",
    "https://iptv-org.github.io/iptv/languages/ron.m3u",
    "https://iptv-org.github.io/iptv/languages/nld.m3u",
    "https://iptv-org.github.io/iptv/languages/ell.m3u",
    "https://iptv-org.github.io/iptv/languages/eng.m3u",
    # Free-TV & community repos
    "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8",
    "https://raw.githubusercontent.com/botallen/iptv-m3u/main/Sports.m3u",
    "https://raw.githubusercontent.com/Ftindy/IPTV-URL/main/IPTVUrls.m3u",
    "https://raw.githubusercontent.com/joevess/IPTV/main/home.m3u8",
    "https://raw.githubusercontent.com/YanG-1989/m3u/main/Gather.m3u",
    "https://raw.githubusercontent.com/Tundrak/IPTV-Italia/main/iptvitaplus.m3u",
    "https://raw.githubusercontent.com/keyifleansen/iptv/main/iptv.m3u",
    "https://raw.githubusercontent.com/drakonkat/FreeTvM3uList/master/downloads/all.m3u",
    "https://raw.githubusercontent.com/byte-capsule/FreeTV-IPTV/main/playlist.m3u8",
    "https://raw.githubusercontent.com/phisher98/IPTV-Player/main/player.m3u8",
    "https://raw.githubusercontent.com/fanmingming/live/main/tv/m3u/ipv6.m3u",
    "https://raw.githubusercontent.com/suxuang/myIPTV/main/ipv6.m3u",
    "https://raw.githubusercontent.com/BurningC4/Chinese-IPTV/master/TV-IPV4.m3u",
    "https://raw.githubusercontent.com/Moha-o/IPTV/main/Moha.m3u",
]

# ── IPTV listing sites to scrape for M3U links ─────────────────────────
IPTV_LISTING_SITES = [
    "https://iptvcat.org/home",
    "https://listm3u.com/",
    "https://www.isitiptv.com/working-iptv-m3u-playlist-urls-list/",
    "https://comfortskillz.com/latest-m3u-playlist-url.html",
    "https://www.techpriyo.com/iptv-m3u-playlist/",
    "https://getmaxtv.com/free-iptv-m3u-playlist-2025/",
    "https://iptvm3u.us/blog/free-iptv-m3u-playlist-2025-daily-updated-100-working",
    "https://iptv.co.com/m3u/",
    "https://xtream-code.com/m3u-url/",
    "https://u.m3uiptv.com/",
    "https://m3u8-player.net/blog/free-popular-iptv-playlist/",
    "https://watchkevin.com/xtream-codes-m3u-iptv-playlist-2026/",
    "https://flixusiptv.com/iptv-playlist-2026/",
    "https://mytruemedia.com/fluxus-tv-kodi-setup-free-m3u-playlist-iptv-links/",
    "https://sat.kharkiv.ua/index.php/plejlisty/1564-besplatnye-plejlisty-po-stranam",
    "https://sat.kharkiv.ua/plejlisty/1565-besplatnye-plejlisty-po-kategoriyam",
    "https://potelevizoram.ru/iptv/playlist/samoobnovlyaemye",
    "https://oanda.ru/iptv-plejlisty-m3u/",
    "https://wvthoog.nl/capture-iptv-content/",
]

# ── Known paste URLs with beIN/sport content ────────────────────────────
KNOWN_PASTE_URLS = [
    "https://pastebin.com/raw/9cmbSZWy",
    "https://pastebin.com/raw/nPWi2Nz1",
    "https://pastebin.com/raw/kGQy4XjK",
    "https://pastebin.com/raw/XdVVW6is",
    "https://rentry.co/fm6sh/raw",
]

# ── Telegram public channels known for IPTV sharing ────────────────────
TELEGRAM_CHANNELS = [
    "freeaboriptv", "sports_iptv_m3u", "ipteeve", "iptvlinks2",
    "dailyiptvlist", "freeiptvplaylist", "iptvfreelinks1",
    "sport_m3u", "iptvfreelink", "freeiptvlinks",
    "beinsportlinks", "sportm3u8", "iptvdaily",
    "iptvsportfree", "m3ulinks", "iptvfreeserver",
    "freeiptvsport", "iptvsportlive", "m3uplaylist",
    "IPTV4EVER", "iptv_free_m3u",
]

SKIP_DOMAINS = {
    "youtube.com", "google.com", "facebook.com", "twitter.com",
    "instagram.com", "tiktok.com", "amazon.com", "apple.com",
    "microsoft.com", "linkedin.com", "wikipedia.org",
    "duckduckgo.com", "bing.com", "pinterest.com",
}

CONCURRENT_WORKERS = 14


def _should_skip(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ""
        for skip in SKIP_DOMAINS:
            if skip in host:
                return True
    except Exception:
        return True
    return False


def _looks_like_m3u(text: str) -> bool:
    return bool(M3U_CONTENT_RE.search(text[:5000]))


def _try_base64_decode(text: str) -> str | None:
    for match in BASE64_M3U_RE.finditer(text):
        try:
            decoded = base64.b64decode(match.group()).decode("utf-8", errors="replace")
            if _looks_like_m3u(decoded):
                return decoded
        except Exception:
            continue
    return None


def _extract_m3u_links(html: str, base_url: str = "") -> list[str]:
    normalized_html = html.replace("\\/", "/").replace("\\u002F", "/")
    found = M3U_LINK_RE.findall(normalized_html)
    if base_url:
        found = [urljoin(base_url, u) for u in found]
    return list(dict.fromkeys(found))


def _normalize_candidate_url(url: str) -> str:
    return (
        unescape(url)
        .replace("\\/", "/")
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


def _is_valid_non_http_stream_target(parsed_url) -> bool:
    host = parsed_url.hostname or ""
    if not host:
        return False

    try:
        port = parsed_url.port
    except ValueError:
        return False

    scheme = (parsed_url.scheme or "").lower()
    if scheme in {"udp", "rtp", "igmp"} and port is None:
        return False
    return True


def _to_xtream_m3u_url(candidate: str) -> str | None:
    parsed = urlparse(_normalize_candidate_url(candidate))
    query = parse_qs(parsed.query, keep_blank_values=False)
    username = (query.get("username") or [""])[0].strip()
    password = (query.get("password") or [""])[0].strip()
    if not username or not password:
        return None

    output = (query.get("output") or ["ts"])[0].strip() or "ts"
    normalized_query = urlencode(
        {
            "username": username,
            "password": password,
            "type": "m3u_plus",
            "output": output,
        }
    )

    lower_path = (parsed.path or "").lower()
    if lower_path.endswith("/player_api.php"):
        path = parsed.path[:-len("player_api.php")] + "get.php"
    elif lower_path.endswith("/get.php"):
        path = parsed.path
    else:
        base = parsed.path.rstrip("/")
        path = f"{base}/get.php" if base else "/get.php"

    return urlunparse(parsed._replace(path=path, query=normalized_query, fragment=""))


def _extract_xtream_urls(html: str) -> list[str]:
    """Extract Xtream URLs (get.php/player_api.php) and normalize to m3u_plus."""
    normalized_html = html.replace("\\/", "/").replace("\\u002F", "/")
    urls = XTREAM_GET_RE.findall(normalized_html) + XTREAM_PLAYER_API_RE.findall(normalized_html)
    m3u_urls: list[str] = []
    seen: set[str] = set()
    for candidate in urls:
        normalized = _to_xtream_m3u_url(candidate)
        if normalized and normalized not in seen:
            seen.add(normalized)
            m3u_urls.append(normalized)
    return list(dict.fromkeys(m3u_urls))


def _extract_raw_stream_urls(html: str) -> list[str]:
    normalized_html = html.replace("\\/", "/").replace("\\u002F", "/")
    urls = STREAM_URL_RE.findall(normalized_html)
    for host, port in MULTICAST_HOST_PORT_RE.findall(normalized_html):
        if _is_multicast_ipv4(host):
            urls.append(f"udp://{host}:{port}")
    unique: list[str] = []
    seen: set[str] = set()
    for candidate in urls:
        stream_url = _normalize_candidate_url(candidate)
        if not stream_url:
            continue
        parsed = urlparse(stream_url)
        scheme = (parsed.scheme or "").lower()
        if scheme in {"http", "https"} and not _looks_like_http_stream_url(stream_url):
            continue
        if scheme in NON_HTTP_STREAM_SCHEMES and not _is_valid_non_http_stream_target(parsed):
            continue
        if stream_url not in seen:
            seen.add(stream_url)
            unique.append(stream_url)
    return unique


def _make_synthetic_m3u(urls: list[str]) -> str:
    if not urls:
        return ""
    lines = ["#EXTM3U"]
    for i, url in enumerate(urls):
        lines.append(f'#EXTINF:-1,Stream {i+1}')
        lines.append(url)
    return "\n".join(lines)


def _extract_links_bs4(html: str, base_url: str = "") -> list[str]:
    urls: list[str] = []
    try:
        soup = BeautifulSoup(html, "lxml")
        for tag in soup.find_all("a", href=True):
            href = tag["href"]
            if base_url:
                href = urljoin(base_url, href)
            if href.startswith("http"):
                urls.append(href)
    except Exception:
        pass
    return list(dict.fromkeys(urls))


# ── Search engines ──────────────────────────────────────────────────────

def search_duckduckgo(query: str, max_results: int = 15) -> list[str]:
    urls: list[str] = []
    try:
        with DDGS() as ddgs:
            results = ddgs.text(query, max_results=max_results)
            for r in results:
                href = r.get("href", "")
                if href and not _should_skip(href):
                    urls.append(href)
    except Exception as exc:
        logger.debug("DDG failed for %r: %s", query, exc)
    return list(dict.fromkeys(urls))


def search_google(query: str, max_results: int = 15) -> list[str]:
    urls: list[str] = []
    try:
        from googlesearch import search as gsearch
        for url in gsearch(query, num_results=max_results, lang="en"):
            if not _should_skip(url):
                urls.append(url)
    except Exception as exc:
        logger.debug("Google failed for %r: %s", query, exc)
    return list(dict.fromkeys(urls))


def _search_all_engines(query: str, max_per_engine: int = 15) -> list[str]:
    all_urls: list[str] = []
    all_urls.extend(search_google(query, max_results=max_per_engine))
    all_urls.extend(search_duckduckgo(query, max_results=max_per_engine))
    return list(dict.fromkeys(all_urls))


# ── Telegram scraper ────────────────────────────────────────────────────

def scrape_telegram_channel(channel: str) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    url = f"https://t.me/s/{channel}"
    text = fetch_simple(url, timeout=12)
    if text is None:
        return results

    m3u_links = _extract_m3u_links(text, base_url=url)
    xtream_links = _extract_xtream_urls(text)
    all_m3u_links = list(dict.fromkeys(m3u_links + xtream_links))

    for link in all_m3u_links[:25]:
        m3u_text = fetch_simple(link, timeout=10)
        if m3u_text and _looks_like_m3u(m3u_text):
            results.append((f"telegram:{channel}:{link}", m3u_text))

    raw_urls = _extract_raw_stream_urls(text)
    if raw_urls:
        synthetic = _make_synthetic_m3u(raw_urls[:200])
        if synthetic:
            results.append((f"telegram:{channel}:raw", synthetic))

    if _looks_like_m3u(text):
        results.append((f"telegram:{channel}", text))

    return results


def scrape_all_telegram(channels: list[str] | None = None) -> list[tuple[str, str]]:
    channels = channels or TELEGRAM_CHANNELS
    results: list[tuple[str, str]] = []
    logger.info("Scraping %d Telegram channels…", len(channels))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(scrape_telegram_channel, ch): ch for ch in channels}
        for fut in concurrent.futures.as_completed(futures):
            ch = futures[fut]
            try:
                items = fut.result()
                if items:
                    logger.info("  [TG] %s: %d sources", ch, len(items))
                results.extend(items)
            except Exception:
                pass
    logger.info("Telegram: %d M3U sources", len(results))
    return results


# ── Page scraping ───────────────────────────────────────────────────────

def _scrape_page(url: str) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    text = fetch(url)
    if text is None:
        return results

    if _looks_like_m3u(text):
        results.append((url, text))
        return results

    decoded = _try_base64_decode(text)
    if decoded:
        results.append((f"base64:{url}", decoded))

    m3u_links = _extract_m3u_links(text, base_url=url)
    xtream_links = _extract_xtream_urls(text)
    all_links = _extract_links_bs4(text, base_url=url)

    m3u_from_page = [l for l in all_links if ".m3u" in l.lower().split("?")[0]]
    all_m3u_links = list(dict.fromkeys(m3u_links + xtream_links + m3u_from_page))

    for link in all_m3u_links[:50]:
        m3u_text = fetch_simple(link, timeout=10)
        if m3u_text and _looks_like_m3u(m3u_text):
            results.append((link, m3u_text))

    raw_urls = _extract_raw_stream_urls(text)
    if raw_urls and not results:
        synthetic = _make_synthetic_m3u(raw_urls[:200])
        if synthetic:
            results.append((f"raw:{url}", synthetic))

    return results


def _fetch_aggregator(url: str) -> tuple[str, str] | None:
    text = fetch(url, timeout=20, max_retries=3)
    if text and _looks_like_m3u(text):
        return (url, text)
    return None


# ── Main entry ──────────────────────────────────────────────────────────

def search_internet(
    queries: list[str] | None = None,
    max_per_engine: int = 15,
    pause_between_queries: float = 1.5,
) -> list[tuple[str, str]]:
    """Search everywhere for IPTV M3U playlists — maximum volume."""
    queries = queries or DEFAULT_SEARCH_QUERIES
    seen_urls: set[str] = set()
    results: list[tuple[str, str]] = []

    # ── 1. Fetch aggregator URLs concurrently ──
    logger.info("Fetching %d aggregator URLs concurrently…", len(AGGREGATOR_URLS))
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as pool:
        futures = {pool.submit(_fetch_aggregator, url): url for url in AGGREGATOR_URLS}
        for fut in concurrent.futures.as_completed(futures):
            url = futures[fut]
            seen_urls.add(url)
            try:
                item = fut.result()
                if item:
                    results.append(item)
            except Exception:
                pass
    logger.info("Aggregators: %d M3U sources", len(results))

    # ── 2. Fetch known paste URLs ──
    logger.info("Fetching %d known paste URLs…", len(KNOWN_PASTE_URLS))
    for paste_url in KNOWN_PASTE_URLS:
        seen_urls.add(paste_url)
        try:
            text = fetch_simple(paste_url, timeout=10)
            if text and _looks_like_m3u(text):
                results.append((paste_url, text))
                logger.info("  [PASTE] %s", paste_url)
        except Exception:
            pass

    # ── 3. Telegram channels ──
    tg_results = scrape_all_telegram()
    results.extend(tg_results)

    # ── 4. Scrape IPTV listing sites for more M3U links ──
    logger.info("Scraping %d IPTV listing sites…", len(IPTV_LISTING_SITES))
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as pool:
        futures = {pool.submit(_scrape_page, url): url for url in IPTV_LISTING_SITES}
        for fut in concurrent.futures.as_completed(futures):
            url = futures[fut]
            seen_urls.add(url)
            try:
                page_results = fut.result()
                for source, text in page_results:
                    if source not in seen_urls:
                        seen_urls.add(source)
                        results.append((source, text))
                        logger.info("  [SITE] %s", source)
            except Exception:
                pass
    logger.info("IPTV sites: %d total M3U sources so far", len(results))

    # ── 5. Search all engines ──
    all_page_urls: list[str] = []
    for i, query in enumerate(queries):
        logger.info("[%d/%d] Searching: %r", i + 1, len(queries), query)
        page_urls = _search_all_engines(query, max_per_engine=max_per_engine)
        logger.info("  -> %d URLs from search engines", len(page_urls))
        all_page_urls.extend(page_urls)
        if i % 3 == 2:
            rotate_ua()
        time.sleep(pause_between_queries)

    all_page_urls = list(dict.fromkeys(all_page_urls))
    logger.info("Total unique URLs to scrape: %d", len(all_page_urls))

    # ── 6. Scrape pages concurrently ──
    urls_to_scrape = [u for u in all_page_urls if u not in seen_urls]
    logger.info("Scraping %d pages with %d workers…", len(urls_to_scrape), CONCURRENT_WORKERS)
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as pool:
        futures = {pool.submit(_scrape_page, url): url for url in urls_to_scrape}
        done_count = 0
        for fut in concurrent.futures.as_completed(futures):
            url = futures[fut]
            seen_urls.add(url)
            done_count += 1
            try:
                page_results = fut.result()
                for source, text in page_results:
                    if source not in seen_urls:
                        seen_urls.add(source)
                        results.append((source, text))
                        logger.info("  [M3U] %s", source)
            except Exception:
                pass
            if done_count % 50 == 0:
                logger.info("  Progress: %d/%d pages, %d M3U sources found", done_count, len(urls_to_scrape), len(results))

    logger.info("Internet search found %d total M3U sources", len(results))
    return results
