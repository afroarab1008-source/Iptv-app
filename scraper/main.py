#!/usr/bin/env python3
"""IPTV M3U Link Scraper — CLI entry point."""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys

from categorizer import categorize
from dedup import deduplicate
from exporter import export
from fetcher import fetch_sources
from github_search import discover_and_fetch
from parser import parse_m3u, parse_multiple
from validator import validate_streams

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")


def _setup_logging(verbose: bool = False) -> None:
    os.makedirs(LOG_DIR, exist_ok=True)
    level = logging.DEBUG if verbose else logging.INFO
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    handlers: list[logging.Handler] = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(LOG_DIR, "scraper.log"), encoding="utf-8"),
    ]
    logging.basicConfig(level=level, format=fmt, handlers=handlers)


def _load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def run_scrape(skip_validate: bool = False, premium: bool = False, config: dict | None = None) -> None:
    """Execute a single scrape run."""
    cfg = config or _load_config()
    token = cfg.get("github_token")
    output_dir = os.path.join(os.path.dirname(__file__), cfg.get("output_dir", "output"))

    if premium:
        logging.info("=== Premium scrape run started ===")
        sources = cfg.get("premium_sources", []) + cfg.get("sources", [])
    else:
        logging.info("=== Scrape run started ===")
        sources = cfg["sources"]

    raw_sources = fetch_sources(sources, token=token)

    if premium:
        search_cfg = cfg.get("github_search", {})
        if search_cfg.get("enabled", True):
            logging.info("Running GitHub search for premium IPTV repos…")
            search_results = discover_and_fetch(
                queries=search_cfg.get("queries"),
                token=token,
                max_repos_per_query=search_cfg.get("max_repos_per_query", 5),
                max_files_per_repo=search_cfg.get("max_files_per_repo", 20),
            )
            raw_sources.extend(search_results)

    channels = parse_multiple(raw_sources)
    logging.info("Total channels parsed: %d", len(channels))

    channels = deduplicate(channels, fuzzy=True)

    val_cfg = cfg.get("validation", {})
    if not skip_validate and val_cfg.get("enabled", True):
        channels = validate_streams(
            channels,
            timeout=val_cfg.get("timeout", 10),
            concurrency=val_cfg.get("concurrency", 50),
        )
        channels = [ch for ch in channels if ch.is_alive]
        logging.info("Channels alive after validation: %d", len(channels))

    categories = categorize(channels)
    report_path = export(channels, categories, output_dir=output_dir)
    logging.info("=== Scrape run finished — report: %s ===", report_path)


def cmd_scrape(args: argparse.Namespace) -> None:
    run_scrape(skip_validate=args.skip_validate, premium=args.premium)


def cmd_schedule(args: argparse.Namespace) -> None:
    import scheduler as sched_mod  # deferred to avoid import-time side-effects

    cfg = _load_config()
    interval = cfg.get("schedule_interval_hours", 12)
    sched_mod.start(
        lambda: run_scrape(skip_validate=args.skip_validate, premium=args.premium, config=cfg),
        interval_hours=interval,
    )


def cmd_validate(args: argparse.Namespace) -> None:
    cfg = _load_config()
    val_cfg = cfg.get("validation", {})
    with open(args.file, encoding="utf-8") as f:
        text = f.read()
    channels = parse_m3u(text, source=args.file)
    logging.info("Loaded %d channels from %s", len(channels), args.file)
    channels = validate_streams(
        channels,
        timeout=val_cfg.get("timeout", 10),
        concurrency=val_cfg.get("concurrency", 50),
    )
    alive = [ch for ch in channels if ch.is_alive]
    dead = [ch for ch in channels if not ch.is_alive]
    logging.info("Results: %d alive, %d dead", len(alive), len(dead))

    output_dir = os.path.join(os.path.dirname(__file__), cfg.get("output_dir", "output"))
    categories = categorize(alive)
    export(alive, categories, output_dir=output_dir)


def main() -> None:
    ap = argparse.ArgumentParser(description="IPTV M3U Link Scraper")
    ap.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging")
    sub = ap.add_subparsers(dest="command", required=True)

    p_scrape = sub.add_parser("scrape", help="Run a single scrape")
    p_scrape.add_argument("--skip-validate", action="store_true", help="Skip stream validation")
    p_scrape.add_argument("--premium", action="store_true", help="Enable premium source scraping (GitHub search + extra sources)")
    p_scrape.set_defaults(func=cmd_scrape)

    p_sched = sub.add_parser("schedule", help="Start scheduled periodic scraping")
    p_sched.add_argument("--skip-validate", action="store_true", help="Skip stream validation")
    p_sched.add_argument("--premium", action="store_true", help="Enable premium source scraping")
    p_sched.set_defaults(func=cmd_schedule)

    p_val = sub.add_parser("validate", help="Re-validate an existing M3U file")
    p_val.add_argument("file", help="Path to the M3U file to validate")
    p_val.set_defaults(func=cmd_validate)

    args = ap.parse_args()
    _setup_logging(verbose=args.verbose)
    args.func(args)


if __name__ == "__main__":
    main()
