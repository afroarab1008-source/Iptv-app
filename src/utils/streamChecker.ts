import type { Channel } from './m3uParser';

export type StreamStatus = 'online' | 'offline' | 'checking' | 'unknown';

const BATCH_SIZE = 10;
const CHECK_TIMEOUT = 8000;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface CachedResult {
  status: 'online' | 'offline';
  checkedAt: number;
}

const cache = new Map<string, CachedResult>();

function loadCache() {
  try {
    const raw = localStorage.getItem('iptv-stream-cache');
    if (!raw) return;
    const entries: [string, CachedResult][] = JSON.parse(raw);
    const now = Date.now();
    for (const [url, result] of entries) {
      if (now - result.checkedAt < CACHE_TTL) {
        cache.set(url, result);
      }
    }
  } catch { /* ignore */ }
}

function saveCache() {
  try {
    const entries = Array.from(cache.entries()).filter(
      ([, r]) => Date.now() - r.checkedAt < CACHE_TTL
    );
    localStorage.setItem('iptv-stream-cache', JSON.stringify(entries));
  } catch { /* ignore */ }
}

loadCache();

export function getCachedStatus(url: string): StreamStatus {
  const c = cache.get(url);
  if (!c || Date.now() - c.checkedAt >= CACHE_TTL) return 'unknown';
  return c.status;
}

async function checkOne(url: string): Promise<'online' | 'offline'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
    const res = await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    });
    clearTimeout(timer);
    // no-cors returns opaque response (status 0) which still means server responded
    if (res.status === 0 || (res.status >= 200 && res.status < 400)) return 'online';
    return 'offline';
  } catch {
    return 'offline';
  }
}

export async function checkStreams(
  channels: Channel[],
  onProgress: (id: string, status: StreamStatus) => void,
  signal?: AbortSignal
): Promise<Map<string, StreamStatus>> {
  const results = new Map<string, StreamStatus>();

  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;

    const batch = channels.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (ch) => {
      const cached = getCachedStatus(ch.url);
      if (cached !== 'unknown') {
        results.set(ch.id, cached);
        onProgress(ch.id, cached);
        return;
      }

      onProgress(ch.id, 'checking');
      const status = await checkOne(ch.url);
      cache.set(ch.url, { status, checkedAt: Date.now() });
      results.set(ch.id, status);
      onProgress(ch.id, status);
    });

    await Promise.all(promises);
  }

  saveCache();
  return results;
}

export function clearStreamCache() {
  cache.clear();
  localStorage.removeItem('iptv-stream-cache');
}
