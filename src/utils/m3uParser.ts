export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  tvgName?: string;
  tvgLogo?: string;
  groupTitle?: string;
  quality?: string;
  language?: string;
}

export interface Playlist {
  channels: Channel[];
  groups: string[];
  epgUrl?: string;
}

/**
 * Parse M3U playlist content
 */
export function parseM3U(content: string): Playlist {
  const lines = content.split('\n');
  const channels: Channel[] = [];
  const groupsSet = new Set<string>();
  let epgUrl: string | undefined;

  let currentChannel: Partial<Channel> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTM3U')) {
      const urlTvgMatch = line.match(/url-tvg="([^"]+)"/i) || line.match(/x-tvg-url="([^"]+)"/i);
      if (urlTvgMatch) {
        epgUrl = urlTvgMatch[1];
      }
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      // Extract everything after #EXTINF:
      const afterExtinf = line.substring(8); // skip "#EXTINF:"
      
      // Split into "before last comma" and "after last comma"
      // The channel name is always after the last comma
      const lastCommaIdx = afterExtinf.lastIndexOf(',');
      
      let name = 'Unknown';
      let attributesPart = '';
      
      if (lastCommaIdx !== -1) {
        name = afterExtinf.substring(lastCommaIdx + 1).trim() || 'Unknown';
        attributesPart = afterExtinf.substring(0, lastCommaIdx);
      } else {
        attributesPart = afterExtinf;
      }
      
      // Use tvg-name as fallback if display name is empty
      const tvgIdMatch = attributesPart.match(/tvg-id="([^"]*?)"/);
      const tvgNameMatch = attributesPart.match(/tvg-name="([^"]*?)"/);
      const tvgLogoMatch = attributesPart.match(/tvg-logo="([^"]*?)"/);
      const groupTitleMatch = attributesPart.match(/group-title="([^"]*?)"/);
      const languageMatch = attributesPart.match(/language="([^"]*?)"/);
      
      if (name === 'Unknown' && tvgNameMatch && tvgNameMatch[1]) {
        name = tvgNameMatch[1];
      }

      currentChannel = {
        id: `channel-${channels.length + 1}`,
        name: name,
        tvgId: tvgIdMatch ? tvgIdMatch[1] : undefined,
        tvgName: tvgNameMatch ? tvgNameMatch[1] : undefined,
        tvgLogo: tvgLogoMatch ? tvgLogoMatch[1] : undefined,
        logo: tvgLogoMatch ? tvgLogoMatch[1] : undefined,
        groupTitle: groupTitleMatch ? groupTitleMatch[1] : undefined,
        group: groupTitleMatch ? groupTitleMatch[1] : undefined,
        language: languageMatch ? languageMatch[1] : undefined,
      };

      if (currentChannel.group) {
        groupsSet.add(currentChannel.group);
      }
    } else if (line && !line.startsWith('#') && currentChannel) {
      // URL line
      currentChannel.url = line;
      channels.push(currentChannel as Channel);
      currentChannel = null;
    }
  }

  return {
    channels,
    groups: Array.from(groupsSet).sort(),
    epgUrl,
  };
}

const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

async function fetchWithCorsRetry(url: string): Promise<string> {
  // Try direct fetch first
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/vnd.apple.mpegurl, application/x-mpegurl, text/plain, */*' },
    });
    if (res.ok) {
      const text = await res.text();
      if (text && text.trim().length > 0) return text;
    }
  } catch {
    // Direct fetch failed (likely CORS), try proxies
  }

  // Try CORS proxies
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy(url));
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 0) return text;
      }
    } catch {
      continue;
    }
  }

  throw new TypeError('Failed to fetch');
}

/**
 * Load M3U from URL
 */
export async function loadM3UFromURL(url: string): Promise<Playlist> {
  try {
    const content = await fetchWithCorsRetry(url);

    if (!content.includes('#EXTM3U') && !content.includes('#EXTINF')) {
      throw new Error('Invalid M3U format: File does not appear to be a valid M3U playlist');
    }

    return parseM3U(content);
  } catch (error) {
    console.error('Error loading M3U:', error);
    if (error instanceof TypeError) {
      if (error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
        throw new Error('Network error: Unable to fetch playlist. Check your internet connection and the URL.');
      }
    }
    if (error instanceof Error) {
      if (error.message.includes('ERR_NAME_NOT_RESOLVED') || error.message.includes('getaddrinfo')) {
        throw new Error('DNS error: Cannot resolve hostname. Check if the URL is correct and your internet connection is working.');
      }
      if (error.message.includes('ERR_CONNECTION_REFUSED')) {
        throw new Error('Connection refused: The server is not responding. The URL may be incorrect or the server is down.');
      }
    }
    throw error;
  }
}

/**
 * Load M3U from file
 */
export async function loadM3UFromFile(file: File): Promise<Playlist> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        resolve(parseM3U(content));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
