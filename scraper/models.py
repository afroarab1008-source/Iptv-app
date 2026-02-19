from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse

IPTV_PROTOCOLS = {
    "http": "HTTP",
    "https": "HTTP",
    "rtsp": "RTSP",
    "rtp": "RTP",
    "udp": "UDP",
    "igmp": "IGMP",
    "rtmp": "RTMP",
    "rtmps": "RTMP",
    "rtmpe": "RTMP",
    "rtmpte": "RTMP",
    "mms": "MMS",
    "mmsh": "MMS",
    "mmst": "MMS",
    "srt": "SRT",
}


def detect_protocol(url: str) -> str:
    """Detect the streaming protocol from a URL."""
    try:
        scheme = urlparse(url).scheme.lower()
    except Exception:
        scheme = ""
    return IPTV_PROTOCOLS.get(scheme, scheme.upper() or "UNKNOWN")


@dataclass
class Channel:
    """Represents a single IPTV channel parsed from an M3U playlist."""

    url: str
    name: str = ""
    group: str = ""
    tvg_id: str = ""
    tvg_name: str = ""
    tvg_logo: str = ""
    tvg_country: str = ""
    tvg_language: str = ""
    tvg_url: str = ""
    is_alive: Optional[bool] = None
    response_time_ms: Optional[float] = None
    source: str = ""
    protocol: str = ""
    extra_tags: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.protocol:
            self.protocol = detect_protocol(self.url)

    @property
    def metadata_score(self) -> int:
        """Count of non-empty metadata fields — used to pick the richer duplicate."""
        score = 0
        for val in (
            self.name, self.group, self.tvg_id, self.tvg_name,
            self.tvg_logo, self.tvg_country, self.tvg_language,
        ):
            if val:
                score += 1
        return score

    @property
    def is_multicast(self) -> bool:
        return self.protocol in ("UDP", "RTP", "IGMP")

    @property
    def is_http(self) -> bool:
        return self.protocol == "HTTP"

    def to_m3u_entry(self) -> str:
        parts = ['#EXTINF:-1']
        if self.tvg_id:
            parts.append(f' tvg-id="{self.tvg_id}"')
        if self.tvg_name:
            parts.append(f' tvg-name="{self.tvg_name}"')
        if self.tvg_logo:
            parts.append(f' tvg-logo="{self.tvg_logo}"')
        if self.tvg_country:
            parts.append(f' tvg-country="{self.tvg_country}"')
        if self.tvg_language:
            parts.append(f' tvg-language="{self.tvg_language}"')
        if self.tvg_url:
            parts.append(f' tvg-url="{self.tvg_url}"')
        if self.group:
            parts.append(f' group-title="{self.group}"')
        parts.append(f',{self.name}')
        return "".join(parts) + "\n" + self.url
