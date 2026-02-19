"""Discover GitHub repos hosting IPTV playlists — armored against all errors.

Every API call is wrapped in try/except with automatic backoff.
Uses the bypass http_client for raw file fetching.
Never crashes — always returns whatever it found.
"""
from __future__ import annotations

import concurrent.futures
import logging
import random
import time
from typing import Any

import requests

from http_client import fetch as bypass_fetch

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
RAW_BASE = "https://raw.githubusercontent.com"
RATE_LIMIT_PAUSE = 15
MAX_CONSECUTIVE_FAILURES = 5

DEFAULT_QUERIES = [
    "bein sport m3u playlist",
    "dazn iptv m3u stream",
    "sky sports m3u iptv",
    "espn m3u iptv playlist",
    "sport iptv m3u premium",
    "bein dazn sky sport m3u",
    "iptv sport channels m3u updated",
    "bein m3u8 daily updated",
    "premium sports m3u8 playlist",
    "iptv m3u sport free",
    "iptv sports playlist m3u",
    "m3u8 sport live stream",
    "free iptv sport m3u list",
    "iptv m3u bein arabic",
    "iptv playlist sports hd",
    "canal sport m3u playlist",
    "iptv list m3u updated 2026",
    "iptv m3u playlist daily",
]

KNOWN_REPOS = [
    "iptv-org/iptv",
    "Free-TV/IPTV",
    "botallen/iptv-m3u",
    "byte-capsule/FreeTV-IPTV",
    "Starter2022/TV-Channel",
    "YanG-1989/m3u",
    "Ftindy/IPTV-URL",
    "joevess/IPTV",
    "Moha-o/IPTV",
    "drakonkat/FreeTvM3uList",
    "keyifleansen/iptv",
    "Tundrak/IPTV-Italia",
    "phisher98/IPTV-Player",
    "kl0wn/iptv",
    "romaxa55/world_ip_tv",
    "fanmingming/live",
    "suxuang/myIPTV",
    "BurningC4/Chinese-IPTV",
]

_UA_POOL = [
    "iptv-scraper/3.0",
    "Mozilla/5.0 (compatible; IPTVBot/3.0)",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0",
]


def _headers(token: str | None = None) -> dict[str, str]:
    h: dict[str, str] = {
        "User-Agent": random.choice(_UA_POOL),
        "Accept": "application/vnd.github.v3+json",
    }
    if token:
        h["Authorization"] = f"token {token}"
    return h


def _safe_get(url: str, token: str | None = None, timeout: int = 20, params: dict | None = None) -> requests.Response | None:
    """Make a GitHub API request with automatic rate-limit handling."""
    for attempt in range(1, 4):
        try:
            resp = requests.get(url, headers=_headers(token), params=params, timeout=timeout)

            if resp.status_code == 200:
                return resp

            if resp.status_code == 403:
                reset = resp.headers.get("X-RateLimit-Reset")
                if reset:
                    wait = max(0, int(reset) - int(time.time())) + 2
                    wait = min(wait, 60)
                else:
                    wait = RATE_LIMIT_PAUSE * attempt
                logger.warning("[GH %d] Rate limited — waiting %ds (attempt %d)", resp.status_code, wait, attempt)
                time.sleep(wait)
                continue

            if resp.status_code == 422:
                logger.debug("[GH 422] Validation failed for %s", url)
                return None

            if resp.status_code >= 500:
                logger.debug("[GH %d] Server error — retrying (attempt %d)", resp.status_code, attempt)
                time.sleep(3 * attempt)
                continue

            logger.debug("[GH %d] %s", resp.status_code, url)
            return None

        except requests.exceptions.Timeout:
            logger.debug("[GH TIMEOUT] %s (attempt %d)", url, attempt)
            time.sleep(2 * attempt)
            continue
        except requests.exceptions.ConnectionError:
            logger.debug("[GH CONN] %s (attempt %d)", url, attempt)
            time.sleep(3 * attempt)
            continue
        except Exception as exc:
            logger.debug("[GH ERR] %s: %s (attempt %d)", url, exc, attempt)
            time.sleep(2)
            continue

    return None


def _search_repos(
    query: str,
    token: str | None = None,
    max_results: int = 15,
    sort: str = "updated",
) -> list[dict[str, Any]]:
    params = {"q": query, "sort": sort, "order": "desc", "per_page": min(max_results, 30)}
    resp = _safe_get(f"{GITHUB_API}/search/repositories", token=token, params=params)
    if resp is None:
        return []
    try:
        return resp.json().get("items", [])[:max_results]
    except Exception:
        return []


def _search_code(
    query: str,
    token: str | None = None,
    max_results: int = 30,
) -> list[dict[str, Any]]:
    if not token:
        return []
    params = {"q": f"{query} extension:m3u", "per_page": min(max_results, 30)}
    resp = _safe_get(f"{GITHUB_API}/search/code", token=token, params=params)
    if resp is None:
        return []
    try:
        return resp.json().get("items", [])[:max_results]
    except Exception:
        return []


def _get_default_branch(repo_full_name: str, token: str | None = None) -> str:
    resp = _safe_get(f"{GITHUB_API}/repos/{repo_full_name}", token=token, timeout=15)
    if resp:
        try:
            return resp.json().get("default_branch", "main")
        except Exception:
            pass
    return "main"


def _list_m3u_files(repo_full_name: str, branch: str, token: str | None = None) -> list[str]:
    resp = _safe_get(
        f"{GITHUB_API}/repos/{repo_full_name}/git/trees/{branch}",
        token=token,
        params={"recursive": "1"},
        timeout=30,
    )
    if resp is None:
        return []
    try:
        tree = resp.json().get("tree", [])
        return [
            item["path"]
            for item in tree
            if item.get("type") == "blob"
            and (item["path"].lower().endswith(".m3u")
                 or item["path"].lower().endswith(".m3u8")
                 or item["path"].lower().endswith(".txt"))
        ]
    except Exception:
        return []


def _fetch_raw(repo: str, branch: str, path: str, token: str | None = None) -> str | None:
    """Fetch raw file from GitHub using the bypass client."""
    url = f"{RAW_BASE}/{repo}/{branch}/{path}"
    try:
        text = bypass_fetch(url, timeout=20, use_fallbacks=False)
        if text and ("#EXTINF" in text or "#EXTM3U" in text):
            return text
    except Exception:
        pass

    # Fallback: direct requests
    try:
        headers = {"User-Agent": random.choice(_UA_POOL)}
        if token:
            headers["Authorization"] = f"token {token}"
        resp = requests.get(url, headers=headers, timeout=20)
        if resp.status_code == 200:
            text = resp.text
            if "#EXTINF" in text or "#EXTM3U" in text:
                return text
    except Exception:
        pass
    return None


def _fetch_repo_m3u(repo_full_name: str, branch: str | None, token: str | None, max_files: int) -> list[tuple[str, str]]:
    results: list[tuple[str, str]] = []
    try:
        if not branch:
            branch = _get_default_branch(repo_full_name, token)
        files = _list_m3u_files(repo_full_name, branch, token)
        if not files:
            return results
        logger.info("  %s: %d M3U/txt files", repo_full_name, len(files))
        for filepath in files[:max_files]:
            text = _fetch_raw(repo_full_name, branch, filepath, token)
            if text:
                results.append((f"github:{repo_full_name}:{filepath}", text))
    except Exception as exc:
        logger.debug("Error fetching %s: %s", repo_full_name, exc)
    return results


def discover_and_fetch(
    queries: list[str] | None = None,
    token: str | None = None,
    max_repos_per_query: int = 15,
    max_files_per_repo: int = 30,
) -> list[tuple[str, str]]:
    """Search GitHub for IPTV repos — armored against all errors."""
    queries = queries or DEFAULT_QUERIES
    seen_repos: set[str] = set()
    repos_to_fetch: list[tuple[str, str | None]] = []

    for repo in KNOWN_REPOS:
        if repo not in seen_repos:
            seen_repos.add(repo)
            repos_to_fetch.append((repo, None))

    consecutive_failures = 0
    for query in queries:
        if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
            logger.warning("Too many consecutive failures — skipping remaining queries")
            break
        logger.info("GitHub repo search: %r", query)
        try:
            repos = _search_repos(query, token=token, max_results=max_repos_per_query)
            if not repos:
                consecutive_failures += 1
            else:
                consecutive_failures = 0
            for repo_info in repos:
                full_name = repo_info.get("full_name", "")
                if not full_name or full_name in seen_repos:
                    continue
                seen_repos.add(full_name)
                branch = repo_info.get("default_branch")
                repos_to_fetch.append((full_name, branch))
        except Exception:
            consecutive_failures += 1
        time.sleep(1.5)

    logger.info("Total repos to fetch: %d", len(repos_to_fetch))

    results: list[tuple[str, str]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(_fetch_repo_m3u, repo, branch, token, max_files_per_repo): repo
            for repo, branch in repos_to_fetch
        }
        for fut in concurrent.futures.as_completed(futures):
            try:
                items = fut.result()
                results.extend(items)
            except Exception:
                pass

    if token:
        code_queries = [
            "EXTINF sport m3u", "EXTM3U bein", "EXTINF dazn", "EXTINF espn",
            "EXTM3U sport", "EXTINF sky sport", "EXTINF premium iptv",
        ]
        for cq in code_queries:
            logger.info("GitHub code search: %r", cq)
            try:
                items = _search_code(cq, token=token)
                for item in items:
                    repo_name = item.get("repository", {}).get("full_name", "")
                    path = item.get("path", "")
                    if not repo_name or not path:
                        continue
                    branch = item.get("repository", {}).get("default_branch", "main")
                    text = _fetch_raw(repo_name, branch, path, token)
                    if text:
                        results.append((f"github-code:{repo_name}:{path}", text))
            except Exception:
                pass

    logger.info("GitHub search yielded %d M3U files from %d repos", len(results), len(seen_repos))
    return results
