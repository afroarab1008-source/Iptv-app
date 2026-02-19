from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone

from models import Channel

logger = logging.getLogger(__name__)

M3U_HEADER = "#EXTM3U\n"


def _safe_filename(name: str) -> str:
    return re.sub(r'[^\w\-.]', '_', name).strip('_') or "unknown"


def write_m3u(channels: list[Channel], path: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(M3U_HEADER)
        for ch in channels:
            f.write(ch.to_m3u_entry() + "\n")
    logger.info("Wrote %d channels to %s", len(channels), path)


def export(
    channels: list[Channel],
    categories: dict[str, dict[str, list[Channel]]],
    output_dir: str = "output",
    split_files: bool = True,
) -> str:
    """Export the full playlist, optional split files, and a JSON report.

    Returns the path to the report JSON.
    """
    os.makedirs(output_dir, exist_ok=True)

    main_path = os.path.join(output_dir, "playlist.m3u")
    write_m3u(channels, main_path)

    # Also write to public/auto-playlist.m3u for the IPTV app to auto-load
    public_path = os.path.join(os.path.dirname(output_dir), "auto-playlist.m3u")
    write_m3u(channels, public_path)

    if split_files:
        for dim_name, groups in categories.items():
            dim_dir = os.path.join(output_dir, dim_name)
            os.makedirs(dim_dir, exist_ok=True)
            for group_name, group_channels in groups.items():
                filename = _safe_filename(group_name) + ".m3u"
                write_m3u(group_channels, os.path.join(dim_dir, filename))

    alive = sum(1 for ch in channels if ch.is_alive is True)
    dead = sum(1 for ch in channels if ch.is_alive is False)
    unchecked = sum(1 for ch in channels if ch.is_alive is None)

    category_summary: dict[str, dict[str, int]] = {}
    for dim_name, groups in categories.items():
        category_summary[dim_name] = {g: len(chs) for g, chs in groups.items()}

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_channels": len(channels),
        "alive": alive,
        "dead": dead,
        "unchecked": unchecked,
        "categories": category_summary,
    }

    report_path = os.path.join(output_dir, "report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    logger.info("Report written to %s", report_path)

    return report_path
