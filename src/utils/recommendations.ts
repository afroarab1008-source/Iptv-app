import type { Channel } from './m3uParser';
import type { WatchHistoryEntry } from '../store/iptvStore';

interface ChannelScore {
  channelId: string;
  score: number;
}

export function getRecommendations(
  channels: Channel[],
  watchHistory: WatchHistoryEntry[],
  limit = 15
): Channel[] {
  if (watchHistory.length === 0 || channels.length === 0) return [];

  const now = Date.now();
  const currentHour = new Date().getHours();
  const scores = new Map<string, number>();

  // Frequency: how many times each channel was watched
  const freqMap = new Map<string, number>();
  const groupFreq = new Map<string, number>();
  const hourMap = new Map<string, number[]>();
  const recencyMap = new Map<string, number>();

  for (const entry of watchHistory) {
    freqMap.set(entry.channelId, (freqMap.get(entry.channelId) || 0) + 1);

    if (entry.group) {
      groupFreq.set(entry.group, (groupFreq.get(entry.group) || 0) + 1);
    }

    const entryHour = new Date(entry.startedAt).getHours();
    const hours = hourMap.get(entry.channelId) || [];
    hours.push(entryHour);
    hourMap.set(entry.channelId, hours);

    const existing = recencyMap.get(entry.channelId) || 0;
    if (entry.startedAt > existing) {
      recencyMap.set(entry.channelId, entry.startedAt);
    }
  }

  const maxFreq = Math.max(...freqMap.values(), 1);
  const maxGroupFreq = Math.max(...groupFreq.values(), 1);

  for (const ch of channels) {
    let score = 0;

    // Frequency score (0-40)
    const freq = freqMap.get(ch.id) || 0;
    score += (freq / maxFreq) * 40;

    // Recency score (0-25) — exponential decay over 7 days
    const lastWatched = recencyMap.get(ch.id);
    if (lastWatched) {
      const daysSince = (now - lastWatched) / (1000 * 60 * 60 * 24);
      score += Math.exp(-daysSince / 3) * 25;
    }

    // Time-of-day score (0-20) — boost if user typically watches this channel at current hour
    const hours = hourMap.get(ch.id);
    if (hours && hours.length > 0) {
      const hourMatches = hours.filter((h) => Math.abs(h - currentHour) <= 2).length;
      score += (hourMatches / hours.length) * 20;
    }

    // Group affinity (0-15) — boost channels in frequently-watched groups
    if (ch.group) {
      const gf = groupFreq.get(ch.group) || 0;
      score += (gf / maxGroupFreq) * 15;
    }

    if (score > 0) {
      scores.set(ch.id, score);
    }
  }

  const sorted: ChannelScore[] = Array.from(scores.entries())
    .map(([channelId, score]) => ({ channelId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const channelMap = new Map(channels.map((c) => [c.id, c]));
  return sorted.map((s) => channelMap.get(s.channelId)!).filter(Boolean);
}
