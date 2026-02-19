#!/usr/bin/env python3
"""Premium Sports IPTV Scraper v3 — Hardened.

Full bypass chain, multi-engine search, never crashes.
Every step is wrapped in try/except — always exports whatever was found.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import traceback

from categorizer import categorize
from dedup import deduplicate
from exporter import export
from parser import parse_m3u, parse_multiple
from sport_filter import filter_sports
from validator import validate_streams

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")


def _setup_logging(verbose: bool = False) -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    level = logging.DEBUG if verbose else logging.INFO
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    console = logging.StreamHandler(sys.stdout)
    console.setStream(
        open(sys.stdout.fileno(), mode="w", encoding="utf-8", errors="replace", closefd=False)
    )
    handlers: list[logging.Handler] = [
        console,
        logging.FileHandler(os.path.join(LOG_DIR, "scraper.log"), encoding="utf-8"),
    ]
    logging.basicConfig(level=level, format=fmt, handlers=handlers)


def _load_config() -> dict:
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logging.error("Failed to load config: %s — using defaults", exc)
        return {}


def _safe_step(name: str, fn, *args, default=None, **kwargs):
    """Run a scraping step safely — never crashes, logs errors, returns default on failure."""
    try:
        return fn(*args, **kwargs)
    except Exception as exc:
        logging.error("[%s] FAILED: %s", name, exc)
        logging.debug("[%s] Traceback:\n%s", name, traceback.format_exc())
        return default


def run_scrape(config: dict | None = None) -> None:
    """Execute a full premium sports scrape run — hardened, never crashes."""
    t0 = time.monotonic()
    cfg = config or _load_config()
    token = cfg.get("github_token")
    output_dir = os.path.join(os.path.dirname(__file__), cfg.get("output_dir", "output"))
    sport_keywords = cfg.get("sport_keywords")

    logging.info("=" * 60)
    logging.info("Premium Sports IPTV Scraper v3 — Hardened")
    logging.info("Bypass: cloudscraper + fingerprint rotation + Wayback + GCache")
    logging.info("Engines: Google + DuckDuckGo + Telegram + 50+ aggregators")
    logging.info("=" * 60)

    raw_sources: list[tuple[str, str]] = []

    # --- Step 1: Multi-engine internet search + Telegram + aggregators ---
    def _do_web_search():
        from web_search import search_internet
        web_cfg = cfg.get("web_search", {})
        return search_internet(
            queries=web_cfg.get("queries"),
            max_per_engine=web_cfg.get("max_per_engine", 15),
            pause_between_queries=web_cfg.get("pause_between_queries", 1.5),
        )

    web_results = _safe_step("Web Search", _do_web_search, default=[])
    raw_sources.extend(web_results)
    logging.info("Web+TG+Aggregators: %d M3U sources (%.0fs)", len(web_results), time.monotonic() - t0)

    # --- Step 2: GitHub discovery ---
    def _do_github():
        from github_search import discover_and_fetch
        gh_cfg = cfg.get("github_search", {})
        return discover_and_fetch(
            queries=gh_cfg.get("queries"),
            token=token,
            max_repos_per_query=gh_cfg.get("max_repos_per_query", 15),
            max_files_per_repo=gh_cfg.get("max_files_per_repo", 30),
        )

    t1 = time.monotonic()
    gh_results = _safe_step("GitHub Search", _do_github, default=[])
    raw_sources.extend(gh_results)
    logging.info("GitHub: %d M3U sources (%.0fs)", len(gh_results), time.monotonic() - t1)

    # --- Step 3: Pinned sources ---
    def _do_pinned():
        from fetcher import fetch_sources
        pinned_sources = cfg.get("sources", [])
        return fetch_sources(pinned_sources, token=token) if pinned_sources else []

    pinned_results = _safe_step("Pinned Sources", _do_pinned, default=[])
    raw_sources.extend(pinned_results)

    logging.info(
        "Total sources: web+tg=%d  github=%d  pinned=%d  combined=%d",
        len(web_results), len(gh_results), len(pinned_results), len(raw_sources),
    )

    if not raw_sources:
        logging.warning("No M3U sources found at all — check your internet connection.")
        return

    # --- Parse ---
    channels = _safe_step("Parse", parse_multiple, raw_sources, default=[])
    logging.info("Total channels parsed: %d", len(channels))

    if not channels:
        logging.warning("No channels could be parsed from the sources.")
        return

    # --- Filter sports ---
    channels = _safe_step("Sport Filter", filter_sports, channels, keywords=sport_keywords, default=channels)

    if not channels:
        logging.warning("No sport channels found in this run.")
        return

    # --- Dedup ---
    channels = _safe_step("Dedup", deduplicate, channels, default=channels)

    # --- Validate ---
    val_cfg = cfg.get("validation", {})
    logging.info("Validating %d streams — bypass headers + SSL override…", len(channels))
    channels = _safe_step(
        "Validate",
        validate_streams,
        channels,
        timeout=val_cfg.get("timeout", 10),
        concurrency=val_cfg.get("concurrency", 120),
        default=channels,
    )
    alive = [ch for ch in channels if ch.is_alive is True]
    dead_count = sum(1 for ch in channels if ch.is_alive is False)
    unchecked = sum(1 for ch in channels if ch.is_alive is None)
    logging.info("Alive: %d | Dead: %d | Unchecked: %d", len(alive), dead_count, unchecked)

    export_channels = alive if alive else channels

    # --- Categorize & export ---
    categories = _safe_step("Categorize", categorize, export_channels, default={})
    report_path = _safe_step("Export", export, export_channels, categories or {}, output_dir=output_dir, default="")

    elapsed = time.monotonic() - t0
    logging.info("=" * 60)
    logging.info("Scrape complete — %d working sport channels in %.0fs", len(alive), elapsed)
    if report_path:
        logging.info("Report: %s", report_path)
    logging.info("=" * 60)


def cmd_scrape(_args: argparse.Namespace) -> None:
    try:
        run_scrape()
    except Exception as exc:
        logging.error("FATAL scrape error: %s", exc)
        logging.debug(traceback.format_exc())


def cmd_schedule(_args: argparse.Namespace) -> None:
    import scheduler as sched_mod
    cfg = _load_config()
    interval = cfg.get("schedule_interval_hours", 4)

    def _safe_run():
        try:
            run_scrape(config=cfg)
        except Exception as exc:
            logging.error("Scheduled run crashed: %s — will retry next cycle", exc)

    sched_mod.start(_safe_run, interval_hours=interval)


def cmd_validate(args: argparse.Namespace) -> None:
    try:
        cfg = _load_config()
        val_cfg = cfg.get("validation", {})
        sport_keywords = cfg.get("sport_keywords")
        with open(args.file, encoding="utf-8") as f:
            text = f.read()
        channels = parse_m3u(text, source=args.file)
        channels = filter_sports(channels, keywords=sport_keywords)
        logging.info("Loaded %d sport channels from %s", len(channels), args.file)
        channels = validate_streams(
            channels,
            timeout=val_cfg.get("timeout", 10),
            concurrency=val_cfg.get("concurrency", 120),
        )
        alive = [ch for ch in channels if ch.is_alive]
        logging.info("Results: %d alive, %d dead", len(alive), len(channels) - len(alive))
        output_dir = os.path.join(os.path.dirname(__file__), cfg.get("output_dir", "output"))
        categories = categorize(alive)
        export(alive, categories, output_dir=output_dir)
    except Exception as exc:
        logging.error("Validate error: %s", exc)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Premium Sports IPTV Scraper v3 — hardened, never crashes"
    )
    ap.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging")
    sub = ap.add_subparsers(dest="command", required=True)

    sub.add_parser("scrape", help="Run a single scrape").set_defaults(func=cmd_scrape)
    sub.add_parser("schedule", help="Scrape every N hours").set_defaults(func=cmd_schedule)

    p_val = sub.add_parser("validate", help="Re-validate an existing M3U file")
    p_val.add_argument("file", help="Path to the M3U file to validate")
    p_val.set_defaults(func=cmd_validate)

    args = ap.parse_args()
    _setup_logging(verbose=args.verbose)
    args.func(args)


if __name__ == "__main__":
    main()
