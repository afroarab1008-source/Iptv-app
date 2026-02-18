"""Discover GitHub repos hosting IPTV playlists via the Search API."""
from __future__ import annotations

import logging
import time
from typing import Any

import requests

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
RAW_BASE = "https://raw.githubusercontent.com"
USER_AGENT = "iptv-m3u-scraper/1.0"
RATE_LIMIT_PAUSE = 30

DEFAULT_QUERIES = [
    "iptv m3u premium playlist",
    "iptv m3u daily updated",
    "free iptv m3u playlist",
    "iptv m3u8 premium",
    "iptv playlist m3u updated today",
]


def _headers(token: str | None = None) -> dict[str, str]:
    h: dict[str, str] = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github.v3+json"}
    if token:
        h["Authorization"] = f"token {token}"
    return h


def _search_repos(
    query: str,
    token: str | None = None,
    max_results: int = 10,
    sort: str = "updated",
) -> list[dict[str, Any]]:
    """Search GitHub for repos matching *query*. Return up to *max_results* repo dicts."""
    url = f"{GITHUB_API}/search/repositories"
    params = {"q": query, "sort": sort, "order": "desc", "per_page": min(max_results, 30)}
    resp = requests.get(url, headers=_headers(token), params=params, timeout=20)
    if resp.status_code == 403:
        logger.warning("Rate limited on search — pausing %ds", RATE_LIMIT_PAUSE)
        time.sleep(RATE_LIMIT_PAUSE)
        resp = requests.get(url, headers=_headers(token), params=params, timeout=20)
    if resp.status_code != 200:
        logger.warning("Search failed (HTTP %d) for query: %s", resp.status_code, query)
        return []
    return resp.json().get("items", [])[:max_results]


def _get_default_branch(repo_full_name: str, token: str | None = None) -> str:
    url = f"{GITHUB_API}/repos/{repo_full_name}"
    resp = requests.get(url, headers=_headers(token), timeout=15)
    if resp.status_code == 200:
        return resp.json().get("default_branch", "main")
    return "main"


def _list_m3u_files(repo_full_name: str, branch: str, token: str | None = None) -> list[str]:
    """List all .m3u / .m3u8 files in a repo."""
    url = f"{GITHUB_API}/repos/{repo_full_name}/git/trees/{branch}?recursive=1"
    resp = requests.get(url, headers=_headers(token), timeout=30)
    if resp.status_code == 403:
        logger.warning("Rate limited listing tree — pausing %ds", RATE_LIMIT_PAUSE)
        time.sleep(RATE_LIMIT_PAUSE)
        resp = requests.get(url, headers=_headers(token), timeout=30)
    if resp.status_code != 200:
        return []
    tree = resp.json().get("tree", [])
    return [
        item["path"]
        for item in tree
        if item.get("type") == "blob"
        and (item["path"].endswith(".m3u") or item["path"].endswith(".m3u8"))
    ]


def _fetch_raw(repo: str, branch: str, path: str, token: str | None = None) -> str | None:
    url = f"{RAW_BASE}/{repo}/{branch}/{path}"
    headers = {"User-Agent": USER_AGENT}
    if token:
        headers["Authorization"] = f"token {token}"
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code == 200:
        return resp.text
    return None


def discover_and_fetch(
    queries: list[str] | None = None,
    token: str | None = None,
    max_repos_per_query: int = 5,
    max_files_per_repo: int = 20,
) -> list[tuple[str, str]]:
    """Search GitHub for IPTV repos, discover M3U files, and fetch them.

    Returns list of (source_label, raw_m3u_text).
    """
    queries = queries or DEFAULT_QUERIES
    seen_repos: set[str] = set()
    results: list[tuple[str, str]] = []

    for query in queries:
        logger.info("GitHub search: %r", query)
        repos = _search_repos(query, token=token, max_results=max_repos_per_query)

        for repo_info in repos:
            full_name = repo_info["full_name"]
            if full_name in seen_repos:
                continue
            seen_repos.add(full_name)

            branch = repo_info.get("default_branch") or _get_default_branch(full_name, token)
            m3u_files = _list_m3u_files(full_name, branch, token)
            if not m3u_files:
                continue

            logger.info("  %s — %d M3U files found", full_name, len(m3u_files))
            for filepath in m3u_files[:max_files_per_repo]:
                text = _fetch_raw(full_name, branch, filepath, token)
                if text:
                    label = f"search:{full_name}:{filepath}"
                    results.append((label, text))

    logger.info("GitHub search yielded %d M3U files from %d repos", len(results), len(seen_repos))
    return results
