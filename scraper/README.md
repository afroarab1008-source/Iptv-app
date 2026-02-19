# Premium IPTV M3U Scraper

Searches the internet for premium IPTV M3U playlists. The scraper automatically:

1. **Searches DuckDuckGo** for premium IPTV M3U links across paste sites, blogs, and forums
2. **Searches GitHub** for repos hosting premium IPTV playlists (repo search + code search)
3. **Scrapes discovered pages** — follows links, resolves paste sites to raw content, extracts embedded M3U URLs
4. **Validates streams** — async checks which channels are actually alive
5. **Deduplicates** — removes exact URL dupes and fuzzy name matches
6. **Categorizes** — groups by country, language, and genre
7. **Exports** — writes `playlist.m3u`, split files, and a JSON report

## Setup

```bash
cd scraper
pip install -r requirements.txt
```

Optional but recommended — set a GitHub token in `config.json` to avoid rate limits and enable code search:

```json
{
  "github_token": "ghp_your_token_here"
}
```

## Usage

### Scrape premium IPTV links

```bash
python main.py scrape
```

This searches DuckDuckGo + GitHub, fetches all discovered M3U playlists, validates streams, and outputs the results.

### Skip validation (faster)

```bash
python main.py scrape --skip-validate
```

### Scheduled scraping (repeats every 12h)

```bash
python main.py schedule
```

### Re-validate an existing playlist

```bash
python main.py validate output/playlist.m3u
```

### Verbose logging

```bash
python main.py -v scrape
```

## Output

After a scrape, check `output/`:

| Path | Description |
|---|---|
| `playlist.m3u` | Combined playlist of all alive premium channels |
| `report.json` | Summary: total found, alive, dead, per-category counts |
| `by_country/` | One `.m3u` per country |
| `by_language/` | One `.m3u` per language |
| `by_genre/` | One `.m3u` per genre |

## Configuration

Edit `config.json` to customize search queries, validation settings, or pin specific sources.

### Web search queries

```json
{
  "web_search": {
    "queries": ["premium iptv m3u playlist 2026", "..."],
    "max_results_per_query": 12,
    "pause_between_queries": 2.0
  }
}
```

### GitHub search queries

```json
{
  "github_search": {
    "queries": ["premium iptv m3u playlist", "..."],
    "max_repos_per_query": 10,
    "max_files_per_repo": 30
  }
}
```

### Pin specific sources

You can pin known URLs directly:

```json
{
  "sources": [
    {
      "name": "my-paste",
      "type": "url",
      "url": "https://pastebin.com/raw/abc123"
    },
    {
      "name": "my-repo",
      "type": "github",
      "repo": "owner/repo",
      "paths": ["*.m3u"]
    },
    {
      "name": "my-pages",
      "type": "web",
      "urls": ["https://example.com/iptv-links"]
    }
  ]
}
```

## Project Structure

```
scraper/
  main.py            CLI entry point
  config.json        Search queries and settings
  web_search.py      DuckDuckGo internet search
  github_search.py   GitHub repo + code search
  web_scraper.py     Page scraper and paste site resolver
  fetcher.py         Multi-type source fetcher
  parser.py          M3U parser
  dedup.py           Deduplication
  validator.py       Async stream validation
  categorizer.py     Channel categorization
  exporter.py        M3U and JSON export
  scheduler.py       Periodic scheduling
  models.py          Channel dataclass
  output/            Generated playlists (gitignored)
  logs/              Log files (gitignored)
```
