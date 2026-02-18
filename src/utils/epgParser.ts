export interface EPGProgram {
  channelId: string;
  title: string;
  description?: string;
  start: Date;
  stop: Date;
  category?: string;
  icon?: string;
}

export interface EPGChannel {
  id: string;
  name: string;
  icon?: string;
}

export interface EPGData {
  channels: Map<string, EPGChannel>;
  programs: Map<string, EPGProgram[]>;
}

function parseXMLTVDate(dateStr: string): Date {
  // XMLTV format: 20240101120000 +0000 or 20240101120000
  const clean = dateStr.trim();
  const year = parseInt(clean.substring(0, 4));
  const month = parseInt(clean.substring(4, 6)) - 1;
  const day = parseInt(clean.substring(6, 8));
  const hour = parseInt(clean.substring(8, 10));
  const minute = parseInt(clean.substring(10, 12));
  const second = parseInt(clean.substring(12, 14)) || 0;

  const tzMatch = clean.match(/([+-]\d{4})$/);
  if (tzMatch) {
    const tzStr = tzMatch[1];
    const tzHours = parseInt(tzStr.substring(0, 3));
    const tzMinutes = parseInt(tzStr[0] + tzStr.substring(3));
    const utcMs = Date.UTC(year, month, day, hour, minute, second) -
      (tzHours * 60 + tzMinutes) * 60000;
    return new Date(utcMs);
  }

  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

function getTextContent(element: Element, tagName: string): string | undefined {
  const el = element.getElementsByTagName(tagName)[0];
  return el?.textContent?.trim() || undefined;
}

function getAttribute(element: Element, attr: string): string | undefined {
  return element.getAttribute(attr) || undefined;
}

export function parseXMLTV(xmlText: string): EPGData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid XMLTV format');
  }

  const channels = new Map<string, EPGChannel>();
  const programs = new Map<string, EPGProgram[]>();

  const channelElements = doc.getElementsByTagName('channel');
  for (let i = 0; i < channelElements.length; i++) {
    const el = channelElements[i];
    const id = getAttribute(el, 'id');
    if (!id) continue;

    const name = getTextContent(el, 'display-name') || id;
    const iconEl = el.getElementsByTagName('icon')[0];
    const icon = iconEl ? getAttribute(iconEl, 'src') : undefined;

    channels.set(id, { id, name, icon });
    programs.set(id, []);
  }

  const programElements = doc.getElementsByTagName('programme');
  for (let i = 0; i < programElements.length; i++) {
    const el = programElements[i];
    const channelId = getAttribute(el, 'channel');
    const startStr = getAttribute(el, 'start');
    const stopStr = getAttribute(el, 'stop');

    if (!channelId || !startStr || !stopStr) continue;

    const title = getTextContent(el, 'title') || 'Untitled';
    const description = getTextContent(el, 'desc');
    const category = getTextContent(el, 'category');
    const iconEl = el.getElementsByTagName('icon')[0];
    const icon = iconEl ? getAttribute(iconEl, 'src') : undefined;

    const program: EPGProgram = {
      channelId,
      title,
      description,
      start: parseXMLTVDate(startStr),
      stop: parseXMLTVDate(stopStr),
      category,
      icon,
    };

    if (!programs.has(channelId)) {
      programs.set(channelId, []);
    }
    programs.get(channelId)!.push(program);
  }

  // Sort programs by start time per channel
  for (const [, progs] of programs) {
    progs.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  return { channels, programs };
}

const CORS_PROXIES = [
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

async function decompressGzip(response: Response): Promise<string> {
  // Use DecompressionStream if available (modern browsers)
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const decompressed = response.body!.pipeThrough(ds);
    const reader = decompressed.getReader();
    const chunks: Uint8Array[] = [];
    let reading = true;
    while (reading) {
      const { done, value } = await reader.read();
      if (done) { reading = false; } else { chunks.push(value); }
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(merged);
  }
  throw new Error('Browser does not support DecompressionStream for .gz files');
}

async function fetchWithCorsProxy(url: string): Promise<Response> {
  // Try direct fetch first
  try {
    const resp = await fetch(url);
    if (resp.ok) return resp;
  } catch (e) {
    console.warn('[EPG] Direct fetch failed, trying CORS proxies...', e);
  }

  // Try each CORS proxy
  for (const makeProxyUrl of CORS_PROXIES) {
    try {
      const proxyUrl = makeProxyUrl(url);
      console.log('[EPG] Trying proxy:', proxyUrl);
      const resp = await fetch(proxyUrl);
      if (resp.ok) return resp;
    } catch (e) {
      console.warn('[EPG] Proxy failed:', e);
    }
  }

  throw new Error(
    'Failed to fetch EPG data. Direct fetch and CORS proxies all failed. ' +
    'The EPG server may be down, or it blocks browser requests.'
  );
}

export async function loadEPGFromURL(url: string): Promise<EPGData> {
  console.log('[EPG] Loading EPG from:', url);

  const response = await fetchWithCorsProxy(url);
  const isGzipped = url.endsWith('.gz') || url.endsWith('.gzip');

  let text: string;
  if (isGzipped) {
    console.log('[EPG] Detected gzip, decompressing...');
    try {
      text = await decompressGzip(response);
    } catch (e) {
      console.error('[EPG] Gzip decompression failed:', e);
      throw new Error('Failed to decompress gzipped EPG file. Try a non-.gz URL.');
    }
  } else {
    text = await response.text();
  }

  if (!text.trim()) {
    throw new Error('EPG file is empty');
  }

  // Sanity check: does it look like XML?
  const trimmed = text.trim();
  if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<tv') && !trimmed.startsWith('<programme')) {
    // Might be gzipped even without .gz extension
    console.warn('[EPG] Response does not look like XML, might be compressed. First 100 chars:', trimmed.substring(0, 100));
    throw new Error(
      'EPG response is not valid XML. The file may be compressed (gzip) ' +
      'or the URL may not point to an XMLTV file.'
    );
  }

  console.log('[EPG] Parsing XMLTV, text length:', text.length);
  const data = parseXMLTV(text);
  console.log('[EPG] Parsed:', data.channels.size, 'channels,',
    Array.from(data.programs.values()).reduce((s, p) => s + p.length, 0), 'programs');
  return data;
}

export function getCurrentProgram(programs: EPGProgram[], now?: Date): EPGProgram | undefined {
  const time = now || new Date();
  return programs.find(
    (p) => p.start.getTime() <= time.getTime() && p.stop.getTime() > time.getTime()
  );
}

export function getNextProgram(programs: EPGProgram[], now?: Date): EPGProgram | undefined {
  const time = now || new Date();
  return programs.find((p) => p.start.getTime() > time.getTime());
}

export function getProgramProgress(program: EPGProgram, now?: Date): number {
  const time = now || new Date();
  const elapsed = time.getTime() - program.start.getTime();
  const duration = program.stop.getTime() - program.start.getTime();
  if (duration <= 0) return 0;
  return Math.min(100, Math.max(0, (elapsed / duration) * 100));
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
