"""Filter channels to only keep sports channels.

Much more permissive than before — matches group containing 'sport',
URL patterns, and a broad keyword list.
"""
from __future__ import annotations

import logging
import re

from models import Channel

logger = logging.getLogger(__name__)

DEFAULT_SPORT_KEYWORDS = [
    # Major networks
    "bein", "be in", "dazn", "sky sport", "espn", "fox sport",
    "bt sport", "tnt sport", "supersport", "super sport",
    "eurosport", "sport tv", "canal+ sport", "canal sport",
    "movistar", "eleven sport", "sport 1", "sport1", "sport 2", "sport2",
    "sport 3", "sport3", "sport 4", "sport 5",
    "arena sport", "nova sport", "setanta", "viaplay",
    "star sport", "sony sport", "willow", "tsn",
    "rmc sport", "sport klub", "match tv",
    "ziggo sport", "sport digital", "sportsnet",
    "bein max", "bein connect", "sport 24", "sport hd",
    "tnt", "sports net", "ten sport", "ten cricket",
    # Leagues / events
    "premier league", "la liga", "serie a", "bundesliga", "ligue 1",
    "champions league", "europa league", "conference league",
    "nba", "nfl", "nhl", "mlb", "mls",
    "ufc", "mma", "boxing", "kickbox", "bellator",
    "cricket", "ipl", "f1", "formula", "moto gp", "motogp",
    "tennis", "golf", "rugby", "wwe", "wrc", "nascar",
    "strongman", "wrestling", "fight", "racing",
    "football", "soccer", "basketball", "baseball", "volleyball",
    "handball", "hockey", "swim", "olympic", "athletics",
    "cycling", "tour de france", "giro", "vuelta",
    # Regional
    "globo esporte", "sportv", "sporttv", "kombat sport",
    "persiana sport", "sport express", "match premier",
    "sport italia", "sport mediaset", "dazn",
    "pluto sport", "freesport", "laola",
]

SPORT_GROUP_PATTERNS = re.compile(
    r'sport|deportes|esport|спорт|رياضة|spor',
    re.IGNORECASE,
)


def filter_sports(
    channels: list[Channel],
    keywords: list[str] | None = None,
) -> list[Channel]:
    """Keep channels matching sport keywords, group containing 'sport', or sport URLs."""
    kws = [k.lower() for k in (keywords or DEFAULT_SPORT_KEYWORDS)]
    kept: list[Channel] = []
    for ch in channels:
        searchable = f"{ch.name} {ch.group} {ch.tvg_name}".lower()

        if any(kw in searchable for kw in kws):
            kept.append(ch)
            continue

        if ch.group and SPORT_GROUP_PATTERNS.search(ch.group):
            kept.append(ch)
            continue

        url_lower = ch.url.lower()
        if any(hint in url_lower for hint in ("sport", "dazn", "bein", "espn")):
            kept.append(ch)
            continue

    dropped = len(channels) - len(kept)
    logger.info(
        "Sport filter: kept %d, dropped %d non-sport channels",
        len(kept), dropped,
    )
    return kept
