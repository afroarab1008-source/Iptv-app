"""Fetch M3U content from configured sources (GitHub repos, direct URLs, web pages)."""
from __future__ import annotations

import fnmatch
import logging
import time
from typing import Any

import requests

from http_client import fetch as http_fetch

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
RAW_BASE = "https://raw.githubusercontent.com"
DEFAULT_BRANCH = "main"
USER_AGENT = "iptv-m3u-scraper/2.0"
RATE_LIMIT_PAUSE = 30


def _headers(token: str | None = None) -> dict[str, str]:
    h: dict[str, str] = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github.v3+json"}
    if token:
        h["Authorization"] = f"token {token}"
    return h


def _get_default_branch(repo: str, token: str | None = None) -> str:
    url = f"{GITHUB_API}/repos/{repo}"
    resp = requests.get(url, headers=_headers(token), timeout=15)
    if resp.status_code == 200:
        return resp.json().get("default_branch", DEFAULT_BRANCH)
    return DEFAULT_BRANCH


def _list_repo_tree(repo: str, branch: str, token: str | None = None) -> list[str]:
    url = f"{GITHUB_API}/repos/{repo}/git/trees/{branch}?recursive=1"
    resp = requests.get(url, headers=_headers(token), timeout=30)
    if resp.status_code == 403:
        logger.warning("Rate limited on tree for %s — pausing %ds", repo, RATE_LIMIT_PAUSE)
        time.sleep(RATE_LIMIT_PAUSE)
        resp = requests.get(url, headers=_headers(token), timeout=30)
    resp.raise_for_status()
    tree: list[dict[str, Any]] = resp.json().get("tree", [])
    return [item["path"] for item in tree if item.get("type") == "blob"]


def _match_paths(all_paths: list[str], patterns: list[str]) -> list[str]:
    matched: list[str] = []
    for path in all_paths:
        for pattern in patterns:
            if fnmatch.fnmatch(path, pattern):
                matched.append(path)
                break
    return matched


def _fetch_raw(repo: str, branch: str, path: str, token: str | None = None) -> str | None:
    url = f"{RAW_BASE}/{repo}/{branch}/{path}"
    headers = {"User-Agent": USER_AGENT}
    if token:
        headers["Authorization"] = f"token {token}"
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code == 403:
        logger.warning("Rate limited fetching %s — pausing %ds", url, RATE_LIMIT_PAUSE)
        time.sleep(RATE_LIMIT_PAUSE)
        resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code == 200:
        return resp.text
    logger.warning("Failed to fetch %s (HTTP %d)", url, resp.status_code)
    return None


def _fetch_github_source(src: dict, token: str | None = None) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    name = src["name"]
    repo = src["repo"]
    patterns = src.get("paths", ["**/*.m3u"])
    logger.info("Fetching repo tree for %s (%s)…", name, repo)
    branch = _get_default_branch(repo, token)
    try:
        all_files = _list_repo_tree(repo, branch, token)
    except requests.RequestException as exc:
        logger.error("Could not list tree for %s: %s", repo, exc)
        return results
    m3u_files = _match_paths(all_files, patterns)
    logger.info("Found %d M3U files in %s matching %s", len(m3u_files), repo, patterns)
    for filepath in m3u_files:
        text = _fetch_raw(repo, branch, filepath, token)
        if text:
            results.append((f"{name}:{filepath}", text))
    return results


def _fetch_direct_url(src: dict) -> list[tuple[str, str]]:
    name = src["name"]
    url = src["url"]
    logger.info("Fetching direct URL: %s (%s)", name, url)
    text = http_fetch(url, timeout=15)
    if text:
        return [(f"{name}:{url}", text)]
    return []


def _fetch_web_source(src: dict) -> list[tuple[str, str]]:
    from web_scraper import scrape_urls
    name = src["name"]
    urls = src.get("urls", [])
    logger.info("Scraping web source: %s (%d URLs)", name, len(urls))
    raw = scrape_urls(urls)
    return [(f"{name}:{label}", text) for label, text in raw]


def fetch_sources(sources: list[dict], token: str | None = None) -> list[tuple[str, str]]:
    """Return (source_label, raw_m3u_text) from all configured sources."""
    results: list[tuple[str, str]] = []
    for src in sources:
        src_type = src.get("type", "github")
        try:
            if src_type == "github":
                results.extend(_fetch_github_source(src, token))
            elif src_type == "url":
                results.extend(_fetch_direct_url(src))
            elif src_type == "web":
                results.extend(_fetch_web_source(src))
            else:
                logger.warning("Unknown source type %r — skipping %s", src_type, src.get("name"))
        except Exception as exc:
            logger.error("Error fetching source %s: %s", src.get("name"), exc)
    return results
