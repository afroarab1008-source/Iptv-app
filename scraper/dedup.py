from __future__ import annotations

import logging
from difflib import SequenceMatcher

from models import Channel

logger = logging.getLogger(__name__)

FUZZY_THRESHOLD = 0.85


def _normalize_name(name: str) -> str:
    return name.lower().strip()


def deduplicate(channels: list[Channel], fuzzy: bool = True) -> list[Channel]:
    """Remove duplicate channels.

    First pass: exact URL dedup (keep entry with highest metadata_score).
    Second pass (optional): fuzzy name matching among remaining channels.
    """
    # --- exact URL dedup ---
    by_url: dict[str, Channel] = {}
    for ch in channels:
        existing = by_url.get(ch.url)
        if existing is None or ch.metadata_score > existing.metadata_score:
            by_url[ch.url] = ch
    unique = list(by_url.values())
    removed_exact = len(channels) - len(unique)
    logger.info("Exact URL dedup removed %d duplicates (%d -> %d)", removed_exact, len(channels), len(unique))

    if not fuzzy:
        return unique

    # --- fuzzy name dedup ---
    keep: list[Channel] = []
    seen_names: list[str] = []
    removed_fuzzy = 0

    for ch in unique:
        norm = _normalize_name(ch.name)
        if not norm:
            keep.append(ch)
            continue
        is_dup = False
        for existing_name in seen_names:
            if SequenceMatcher(None, norm, existing_name).ratio() >= FUZZY_THRESHOLD:
                is_dup = True
                break
        if is_dup:
            removed_fuzzy += 1
        else:
            keep.append(ch)
            seen_names.append(norm)

    logger.info("Fuzzy name dedup removed %d near-duplicates (%d -> %d)", removed_fuzzy, len(unique), len(keep))
    return keep
