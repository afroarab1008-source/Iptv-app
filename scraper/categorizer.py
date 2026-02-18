from __future__ import annotations

import logging
from collections import defaultdict

from models import Channel

logger = logging.getLogger(__name__)

GENRE_KEYWORDS: dict[str, list[str]] = {
    "News": ["news", "cnn", "bbc", "al jazeera", "fox news", "msnbc", "sky news", "euronews"],
    "Sports": ["sport", "espn", "fox sports", "bein", "dazn", "nba", "nfl", "fifa", "cricket"],
    "Entertainment": ["entertainment", "hbo", "showtime", "comedy", "drama", "movie", "film", "cinema"],
    "Kids": ["kids", "cartoon", "disney", "nick", "baby", "junior", "child"],
    "Music": ["music", "mtv", "vh1", "vevo", "radio", "hits"],
    "Documentary": ["documentary", "discovery", "national geographic", "natgeo", "history"],
    "Religious": ["religious", "church", "god", "bible", "quran", "worship", "faith"],
    "Education": ["education", "science", "learning", "lecture", "university"],
    "Shopping": ["shopping", "qvc", "hsn", "shop"],
    "Lifestyle": ["lifestyle", "food", "cooking", "travel", "fashion", "home", "garden"],
}


def _guess_genre(channel: Channel) -> str:
    """Infer genre from channel name and group if not already categorized."""
    searchable = f"{channel.name} {channel.group}".lower()
    for genre, keywords in GENRE_KEYWORDS.items():
        for kw in keywords:
            if kw in searchable:
                return genre
    return "General"


def categorize(channels: list[Channel]) -> dict[str, dict[str, list[Channel]]]:
    """Group channels into nested dicts: by_country, by_language, by_genre.

    Returns::

        {
            "by_country":  {"US": [...], "UK": [...]},
            "by_language": {"English": [...], "Spanish": [...]},
            "by_genre":    {"News": [...], "Sports": [...]},
        }
    """
    by_country: dict[str, list[Channel]] = defaultdict(list)
    by_language: dict[str, list[Channel]] = defaultdict(list)
    by_genre: dict[str, list[Channel]] = defaultdict(list)

    for ch in channels:
        country = ch.tvg_country.strip() or "Uncategorized"
        for c in country.split(";"):
            c = c.strip()
            if c:
                by_country[c].append(ch)

        language = ch.tvg_language.strip() or "Unknown"
        for lang in language.split(";"):
            lang = lang.strip()
            if lang:
                by_language[lang].append(ch)

        genre = ch.group.strip() if ch.group.strip() else _guess_genre(ch)
        by_genre[genre].append(ch)

    logger.info(
        "Categorized %d channels into %d countries, %d languages, %d genres",
        len(channels), len(by_country), len(by_language), len(by_genre),
    )
    return {
        "by_country": dict(by_country),
        "by_language": dict(by_language),
        "by_genre": dict(by_genre),
    }
