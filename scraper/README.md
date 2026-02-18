# IPTV M3U Link Scraper

A Python-based scraper that fetches IPTV M3U playlists from GitHub repositories, validates streams, deduplicates channels, and categorizes them by country, language, and genre.

Supports **premium mode** which uses GitHub Search API to automatically discover repos hosting IPTV playlists, and can scrape paste sites and direct URLs for M3U content.

## Setup

```bash
cd scraper
pip install -r requirements.txt
```

Optionally, set a GitHub personal access token in `config.json` to avoid API rate limits (highly recommended for premium mode):

```json
{
  "github_token": "ghp_your_token_here"
}
```

## Usage

### Single scrape (default sources)

```bash
python main.py scrape
```

### Premium scrape (discovers extra repos + paste sites)

```bash
python main.py scrape --premium
```

This does everything the basic scrape does, plus:
- Searches GitHub for repos matching premium IPTV queries
- Fetches from any direct URLs or paste site URLs in `premium_sources`
- Merges, deduplicates, and validates all channels

### Skip validation for speed

```bash
python main.py scrape --skip-validate
python main.py scrape --premium --skip-validate
```

### Scheduled scraping

Runs immediately, then repeats at the interval configured in `config.json` (default 12 hours):

```bash
python main.py schedule
python main.py schedule --premium
```

### Re-validate an existing playlist

```bash
python main.py validate output/playlist.m3u
```

### Verbose logging

Add `-v` before the subcommand:

```bash
python main.py -v scrape --premium
```

## Output

After a scrape, the `output/` directory contains:

| File / Directory | Description |
|---|---|
| `playlist.m3u` | Combined playlist of all alive channels |
| `report.json` | Summary with totals, alive/dead counts, and per-category breakdowns |
| `by_country/` | One `.m3u` file per country |
| `by_language/` | One `.m3u` file per language |
| `by_genre/` | One `.m3u` file per genre/category |

## Configuration

Edit `config.json` to add sources, tune validation, or change the schedule interval.

### Source types

Three source types are supported:

**GitHub repo** — fetch M3U files from a repo by glob pattern:

```json
{
  "name": "iptv-org",
  "type": "github",
  "repo": "iptv-org/iptv",
  "paths": ["streams/**/*.m3u"]
}
```

**Direct URL** — fetch a single raw M3U URL:

```json
{
  "name": "my-playlist",
  "type": "url",
  "url": "https://example.com/playlist.m3u"
}
```

**Web page / paste site** — scrape pages for embedded M3U links:

```json
{
  "name": "paste-links",
  "type": "web",
  "urls": [
    "https://pastebin.com/abc123",
    "https://rentry.co/xyz789",
    "https://example.com/iptv-links-page"
  ]
}
```

Supported paste sites with auto raw-URL resolution: Pastebin, Rentry, dpaste, paste.ee, Hastebin, Ghostbin, ControlC, NoPaste.

### GitHub search (premium mode)

When `--premium` is used, the scraper also runs GitHub search queries to discover new repos automatically:

```json
{
  "github_search": {
    "enabled": true,
    "queries": [
      "iptv m3u premium playlist",
      "iptv m3u daily updated"
    ],
    "max_repos_per_query": 5,
    "max_files_per_repo": 20
  }
}
```

## Project Structure

```
scraper/
  main.py            CLI entry point
  config.json        Source URLs and settings
  models.py          Channel dataclass
  fetcher.py         Multi-type source fetcher (GitHub, URL, web)
  github_search.py   GitHub Search API discovery
  web_scraper.py     Web page and paste site scraper
  parser.py          M3U parser
  dedup.py           Deduplication logic
  validator.py       Async stream checker
  categorizer.py     Channel categorization
  exporter.py        M3U and JSON export
  scheduler.py       Periodic run scheduler
  output/            Generated playlists (gitignored)
  logs/              Log files (gitignored)
```
