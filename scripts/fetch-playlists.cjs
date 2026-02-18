const fs = require('fs');
const https = require('https');
const http = require('http');

// ── Public IPTV playlist sources ──────────────────────────────────────────
// Add or remove URLs as needed. Country / category lists from iptv-org:
//   https://github.com/iptv-org/iptv#grouped-by-country
const SOURCES = [
  // All channels (large)
  'https://iptv-org.github.io/iptv/index.m3u',

  // By country (uncomment the ones you want)
  // 'https://iptv-org.github.io/iptv/countries/de.m3u',
  // 'https://iptv-org.github.io/iptv/countries/us.m3u',
  // 'https://iptv-org.github.io/iptv/countries/gb.m3u',
  // 'https://iptv-org.github.io/iptv/countries/fr.m3u',
  // 'https://iptv-org.github.io/iptv/countries/es.m3u',
  // 'https://iptv-org.github.io/iptv/countries/tr.m3u',
  // 'https://iptv-org.github.io/iptv/countries/ar.m3u',
  // 'https://iptv-org.github.io/iptv/countries/pt.m3u',
  // 'https://iptv-org.github.io/iptv/countries/it.m3u',
  // 'https://iptv-org.github.io/iptv/countries/nl.m3u',
  // 'https://iptv-org.github.io/iptv/countries/in.m3u',

  // By category (uncomment the ones you want)
  // 'https://iptv-org.github.io/iptv/categories/news.m3u',
  // 'https://iptv-org.github.io/iptv/categories/sports.m3u',
  // 'https://iptv-org.github.io/iptv/categories/entertainment.m3u',
  // 'https://iptv-org.github.io/iptv/categories/movies.m3u',
  // 'https://iptv-org.github.io/iptv/categories/music.m3u',
  // 'https://iptv-org.github.io/iptv/categories/kids.m3u',
];

const OUTPUT_PATH = 'public/auto-playlist.m3u';
const FETCH_TIMEOUT = 30000;
const MAX_REDIRECTS = 5;

// ── HTTP Fetch with redirect support ──────────────────────────────────────
function fetchURL(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) {
      return reject(new Error(`Too many redirects for ${url}`));
    }

    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      { headers: { 'User-Agent': 'IPTV-Playlist-Updater/1.0' }, timeout: FETCH_TIMEOUT },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).href;
          return fetchURL(next, redirects + 1).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
    req.on('error', reject);
  });
}

// ── M3U Parser ────────────────────────────────────────────────────────────
function parseM3U(content) {
  const channels = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF:')) continue;

    const url = (lines[i + 1] || '').trim();
    if (!url || url.startsWith('#')) continue;

    const nameMatch = line.match(/,(.+)$/);
    const logoMatch = line.match(/tvg-logo="([^"]*)"/);
    const groupMatch = line.match(/group-title="([^"]*)"/);
    const idMatch = line.match(/tvg-id="([^"]*)"/);

    channels.push({
      name: nameMatch ? nameMatch[1].trim() : 'Unknown',
      url,
      logo: logoMatch ? logoMatch[1] : '',
      group: groupMatch ? groupMatch[1] : '',
      tvgId: idMatch ? idMatch[1] : '',
    });
  }

  return channels;
}

// ── M3U Builder ───────────────────────────────────────────────────────────
function buildM3U(channels) {
  let m3u = '#EXTM3U\n';
  for (const ch of channels) {
    let extinf = '#EXTINF:-1';
    if (ch.tvgId) extinf += ` tvg-id="${ch.tvgId}"`;
    if (ch.logo) extinf += ` tvg-logo="${ch.logo}"`;
    if (ch.group) extinf += ` group-title="${ch.group}"`;
    extinf += `,${ch.name}`;
    m3u += extinf + '\n' + ch.url + '\n';
  }
  return m3u;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  console.log(`\n🔄 IPTV Playlist Updater`);
  console.log(`   Sources: ${SOURCES.length}`);
  console.log(`   Output:  ${OUTPUT_PATH}\n`);

  const allChannels = [];
  const seenUrls = new Set();
  let totalFetched = 0;
  let failedSources = 0;

  for (const source of SOURCES) {
    try {
      process.stdout.write(`   Fetching: ${source.substring(0, 70)}... `);
      const content = await fetchURL(source);
      const channels = parseM3U(content);
      let added = 0;

      for (const ch of channels) {
        if (!seenUrls.has(ch.url)) {
          seenUrls.add(ch.url);
          allChannels.push(ch);
          added++;
        }
      }

      totalFetched += channels.length;
      console.log(`${channels.length} channels (${added} new)`);
    } catch (err) {
      failedSources++;
      console.log(`FAILED — ${err.message}`);
    }
  }

  // Sort by group then name for a clean playlist
  allChannels.sort((a, b) =>
    a.group.localeCompare(b.group) || a.name.localeCompare(b.name)
  );

  const m3u = buildM3U(allChannels);
  fs.writeFileSync(OUTPUT_PATH, m3u, 'utf-8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s`);
  console.log(`   Total fetched:  ${totalFetched}`);
  console.log(`   Unique channels: ${allChannels.length}`);
  console.log(`   Failed sources:  ${failedSources}`);
  console.log(`   Groups: ${[...new Set(allChannels.map((c) => c.group).filter(Boolean))].length}`);
  console.log(`   Written to: ${OUTPUT_PATH}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
