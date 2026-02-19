"""Deduplication — only remove exact URL duplicates.

Fuzzy name dedup was too aggressive (removing different streams that happen
to have similar names). Now we only dedup on exact URL match.
"""
from __future__ import annotations

import logging

from models import Channel

logger = logging.getLogger(__name__)


def deduplicate(channels: list[Channel], fuzzy: bool = False) -> list[Channel]:
    """Remove duplicate channels by exact URL.

    Keeps the entry with the highest metadata_score for each URL.
    fuzzy parameter is accepted for backwards compat but ignored.
    """
    by_url: dict[str, Channel] = {}
    for ch in channels:
        existing = by_url.get(ch.url)
        if existing is None or ch.metadata_score > existing.metadata_score:
            by_url[ch.url] = ch
    unique = list(by_url.values())
    removed = len(channels) - len(unique)
    logger.info("URL dedup removed %d duplicates (%d -> %d)", removed, len(channels), len(unique))
    return unique
