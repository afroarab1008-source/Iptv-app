from __future__ import annotations

import logging
import re
from typing import Sequence

from models import Channel

logger = logging.getLogger(__name__)

_ATTR_RE = re.compile(r'([\w-]+)="([^"]*)"')

VALID_SCHEMES = {
    "http", "https", "rtsp", "rtp", "udp", "igmp",
    "rtmp", "rtmps", "rtmpe", "rtmpte",
    "mms", "mmsh", "mmst", "srt",
}


def _is_stream_url(line: str) -> bool:
    """Check if a line looks like a stream URL (any IPTV protocol)."""
    stripped = line.strip()
    for scheme in VALID_SCHEMES:
        if stripped.lower().startswith(scheme + "://"):
            return True
    return False


def _parse_extinf(line: str) -> dict[str, str]:
    """Extract attributes and channel name from an #EXTINF line."""
    attrs: dict[str, str] = {}
    for match in _ATTR_RE.finditer(line):
        attrs[match.group(1).lower()] = match.group(2)
    comma_idx = line.rfind(",")
    if comma_idx != -1:
        attrs["_name"] = line[comma_idx + 1:].strip()
    return attrs


def parse_m3u(text: str, source: str = "") -> list[Channel]:
    """Parse raw M3U text into a list of Channel objects."""
    channels: list[Channel] = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("#EXTINF"):
            attrs = _parse_extinf(line)
            url = ""
            j = i + 1
            while j < len(lines):
                candidate = lines[j].strip()
                if candidate and not candidate.startswith("#"):
                    if _is_stream_url(candidate):
                        url = candidate
                    break
                j += 1
            if url:
                channel = Channel(
                    url=url,
                    name=attrs.get("_name", ""),
                    group=attrs.get("group-title", ""),
                    tvg_id=attrs.get("tvg-id", ""),
                    tvg_name=attrs.get("tvg-name", ""),
                    tvg_logo=attrs.get("tvg-logo", ""),
                    tvg_country=attrs.get("tvg-country", ""),
                    tvg_language=attrs.get("tvg-language", ""),
                    tvg_url=attrs.get("tvg-url", ""),
                    source=source,
                )
                channels.append(channel)
                i = j + 1
                continue
        i += 1
    logger.info("Parsed %d channels from %s", len(channels), source or "input")
    return channels


def parse_multiple(sources: Sequence[tuple[str, str]]) -> list[Channel]:
    """Parse multiple (source_label, raw_text) pairs and return a combined list."""
    all_channels: list[Channel] = []
    for label, text in sources:
        all_channels.extend(parse_m3u(text, source=label))
    return all_channels
