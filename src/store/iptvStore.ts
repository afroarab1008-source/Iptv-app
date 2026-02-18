import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Channel, Playlist } from '../utils/m3uParser';
import { EPGData, EPGProgram, getCurrentProgram, getNextProgram, loadEPGFromURL } from '../utils/epgParser';
import { setLanguage as setI18nLanguage } from '../utils/i18n';

export interface WatchHistoryEntry {
  channelId: string;
  channelName: string;
  channelLogo?: string;
  group?: string;
  startedAt: number;
  duration: number; // seconds
}

export interface EPGSource {
  id: string;
  name: string;
  url: string;
  region: string;
  description?: string;
  isCustom?: boolean;
}

export const BUILTIN_EPG_SOURCES: EPGSource[] = [
  {
    id: 'iptv-org-us-pluto',
    name: 'Pluto TV (US)',
    url: 'https://iptv-org.github.io/epg/guides/us/pluto.tv.xml',
    region: 'United States',
    description: 'Pluto TV US channel guide',
  },
  {
    id: 'iptv-org-us-plex',
    name: 'Plex TV (US)',
    url: 'https://iptv-org.github.io/epg/guides/us/plex.tv.xml',
    region: 'United States',
    description: 'Plex TV US channel guide',
  },
  {
    id: 'iptv-org-us-directv',
    name: 'DirecTV (US)',
    url: 'https://iptv-org.github.io/epg/guides/us/directv.com.xml',
    region: 'United States',
    description: 'DirecTV US channel guide',
  },
  {
    id: 'iptv-org-uk-sky',
    name: 'Sky (UK)',
    url: 'https://iptv-org.github.io/epg/guides/uk/sky.com.xml',
    region: 'United Kingdom',
    description: 'Sky UK channel guide',
  },
  {
    id: 'iptv-org-uk-bt',
    name: 'BT TV (UK)',
    url: 'https://iptv-org.github.io/epg/guides/uk/bt.com.xml',
    region: 'United Kingdom',
    description: 'BT TV UK channel guide',
  },
  {
    id: 'iptv-org-de-hd-plus',
    name: 'HD+ (Germany)',
    url: 'https://iptv-org.github.io/epg/guides/de/hd-plus.de.xml',
    region: 'Germany',
    description: 'HD+ German channel guide',
  },
  {
    id: 'iptv-org-fr-programme-tv',
    name: 'Programme TV (France)',
    url: 'https://iptv-org.github.io/epg/guides/fr/programme-tv.net.xml',
    region: 'France',
    description: 'French TV program guide',
  },
  {
    id: 'iptv-org-it-sky',
    name: 'Sky (Italy)',
    url: 'https://iptv-org.github.io/epg/guides/it/sky.it.xml',
    region: 'Italy',
    description: 'Sky Italia channel guide',
  },
  {
    id: 'iptv-org-es-movistar',
    name: 'Movistar+ (Spain)',
    url: 'https://iptv-org.github.io/epg/guides/es/movistarplus.es.xml',
    region: 'Spain',
    description: 'Movistar+ Spanish guide',
  },
  {
    id: 'iptv-org-nl-delta',
    name: 'Delta (Netherlands)',
    url: 'https://iptv-org.github.io/epg/guides/nl/delta.nl.xml',
    region: 'Netherlands',
    description: 'Delta Dutch channel guide',
  },
  {
    id: 'iptv-org-tr-digiturk',
    name: 'Digiturk (Turkey)',
    url: 'https://iptv-org.github.io/epg/guides/tr/digiturk.com.tr.xml',
    region: 'Turkey',
    description: 'Digiturk Turkish channel guide',
  },
  {
    id: 'iptv-org-in-tataplay',
    name: 'Tata Play (India)',
    url: 'https://iptv-org.github.io/epg/guides/in/tataplay.com.xml',
    region: 'India',
    description: 'Tata Play Indian channel guide',
  },
  {
    id: 'iptv-org-pt-meo',
    name: 'MEO (Portugal)',
    url: 'https://iptv-org.github.io/epg/guides/pt/meo.pt.xml',
    region: 'Portugal',
    description: 'MEO Portuguese channel guide',
  },
  {
    id: 'iptv-org-ar-osn',
    name: 'OSN (Arabic)',
    url: 'https://iptv-org.github.io/epg/guides/ae/osn.com.xml',
    region: 'Arabic',
    description: 'OSN Arabic channel guide',
  },
  {
    id: 'epg-best-us',
    name: 'EPGBest US (gzip)',
    url: 'https://epgshare01.online/epgshare01/epg_ripper_US1.xml.gz',
    region: 'United States',
    description: 'Compressed US EPG — needs gzip support',
  },
  {
    id: 'epg-best-uk',
    name: 'EPGBest UK (gzip)',
    url: 'https://epgshare01.online/epgshare01/epg_ripper_UK1.xml.gz',
    region: 'United Kingdom',
    description: 'Compressed UK EPG — needs gzip support',
  },
  {
    id: 'epg-best-de',
    name: 'EPGBest DE (gzip)',
    url: 'https://epgshare01.online/epgshare01/epg_ripper_DE1.xml.gz',
    region: 'Germany',
    description: 'Compressed German EPG — needs gzip support',
  },
];

export interface SavedPlaylist {
  id: string;
  name: string;
  url?: string;
  channelCount: number;
  groups: string[];
  addedAt: number;
  lastUsedAt: number;
}

interface IPTVState {
  // Playlist data
  playlist: Playlist | null;
  channels: Channel[];
  groups: string[];
  
  // Current state
  currentChannel: Channel | null;
  isPlaying: boolean;
  selectedGroup: string | null;
  searchQuery: string;
  
  // User preferences
  favorites: string[]; // Channel IDs
  recentChannels: Channel[];
  videoQuality: 'auto' | 'sd' | 'hd' | 'fhd' | '4k';
  viewMode: 'grid' | 'list';
  theme: 'dark' | 'light' | 'oled';
  accentColor: string;
  channelSort: 'default' | 'name-asc' | 'name-desc' | 'group';
  tvMode: boolean;
  language: string;
  audioOnly: boolean;
  
  // Sleep timer
  sleepTimerEnd: number | null;
  
  // Playlist auto-update
  playlistAutoUpdate: boolean;
  playlistAutoUpdateInterval: number; // minutes
  
  // Watch history
  watchHistory: WatchHistoryEntry[];
  
  // Parental controls
  parentalPin: string | null;
  lockedGroups: string[];
  parentalUnlocked: boolean;
  
  // Saved playlists
  savedPlaylists: SavedPlaylist[];
  activePlaylistId: string | null;
  
  // EPG
  epgData: EPGData | null;
  epgUrl: string | null;
  epgLoading: boolean;
  epgError: string | null;
  epgAutoRefresh: boolean;
  epgRefreshInterval: number; // minutes
  epgLastRefresh: number | null;
  epgSources: EPGSource[];
  epgDetectedUrl: string | null;
  
  // Actions
  setPlaylist: (playlist: Playlist) => void;
  setCurrentChannel: (channel: Channel | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setSelectedGroup: (group: string | null) => void;
  setSearchQuery: (query: string) => void;
  toggleFavorite: (channelId: string) => void;
  addToRecent: (channel: Channel) => void;
  setVideoQuality: (quality: 'auto' | 'sd' | 'hd' | 'fhd' | '4k') => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  setTheme: (theme: 'dark' | 'light' | 'oled') => void;
  setAccentColor: (color: string) => void;
  setChannelSort: (sort: 'default' | 'name-asc' | 'name-desc' | 'group') => void;
  setTvMode: (enabled: boolean) => void;
  setLanguage: (lang: string) => void;
  setAudioOnly: (enabled: boolean) => void;
  
  // Sleep timer
  setSleepTimer: (minutes: number | null) => void;
  
  // Playlist auto-update
  setPlaylistAutoUpdate: (enabled: boolean) => void;
  setPlaylistAutoUpdateInterval: (minutes: number) => void;
  
  // Watch history
  addWatchHistory: (entry: WatchHistoryEntry) => void;
  clearWatchHistory: () => void;
  
  // Playlist management
  savePlaylist: (name: string, playlist: Playlist, url?: string) => string;
  loadSavedPlaylist: (id: string) => void;
  deleteSavedPlaylist: (id: string) => void;
  renameSavedPlaylist: (id: string, name: string) => void;
  
  // EPG actions
  loadEPG: (url: string) => Promise<void>;
  clearEPG: () => void;
  setEpgAutoRefresh: (enabled: boolean) => void;
  setEpgRefreshInterval: (minutes: number) => void;
  addCustomEpgSource: (name: string, url: string) => void;
  removeCustomEpgSource: (id: string) => void;
  setEpgDetectedUrl: (url: string | null) => void;
  getEpgMatchStats: () => { matched: number; total: number; epgChannels: number };
  getCurrentProgramForChannel: (tvgId: string) => EPGProgram | undefined;
  getNextProgramForChannel: (tvgId: string) => EPGProgram | undefined;
  
  // Parental controls
  setParentalPin: (pin: string | null) => void;
  toggleLockedGroup: (group: string) => void;
  unlockParental: (pin: string) => boolean;
  lockParental: () => void;
  
  // Import/Export
  exportSettings: () => string;
  importSettings: (json: string) => boolean;
  
  // Logo enrichment
  enrichChannelLogos: () => void;
  fetchChannelLogos: () => Promise<void>;
  
  // Navigation
  playNextChannel: () => void;
  playPrevChannel: () => void;
  
  // Computed
  getFilteredChannels: () => Channel[];
  isFavorite: (channelId: string) => boolean;
}

export const useIPTVStore = create<IPTVState>()(
  persist(
    (set, get) => ({
      // Initial state
      playlist: null,
      channels: [],
      groups: [],
      currentChannel: null,
      isPlaying: false,
      selectedGroup: null,
      searchQuery: '',
      favorites: [],
      recentChannels: [],
      videoQuality: 'auto',
      viewMode: 'grid',
      theme: 'dark',
      accentColor: '#0ea5e9',
      channelSort: 'default',
      tvMode: false,
      language: 'en',
      audioOnly: false,
      sleepTimerEnd: null,
      playlistAutoUpdate: false,
      playlistAutoUpdateInterval: 360,
      watchHistory: [],
      parentalPin: null,
      lockedGroups: [],
      parentalUnlocked: false,
      savedPlaylists: [],
      activePlaylistId: null,
      epgData: null,
      epgUrl: null,
      epgLoading: false,
      epgError: null,
      epgAutoRefresh: false,
      epgRefreshInterval: 120,
      epgLastRefresh: null,
      epgSources: [],
      epgDetectedUrl: null,

      // Actions
      setPlaylist: (playlist) => {
        set({
          playlist,
          channels: playlist.channels,
          groups: playlist.groups,
          currentChannel: null,
          selectedGroup: null,
          searchQuery: '',
          epgDetectedUrl: playlist.epgUrl || null,
        });
        // Auto-fetch missing logos in the background
        get().fetchChannelLogos();
      },

      setCurrentChannel: (channel) =>
        set({ currentChannel: channel }),
      
      setIsPlaying: (playing) =>
        set({ isPlaying: playing }),
      
      setSelectedGroup: (group) =>
        set({ selectedGroup: group }),
      
      setSearchQuery: (query) =>
        set({ searchQuery: query }),
      
      toggleFavorite: (channelId) =>
        set((state) => {
          const favorites = state.favorites.includes(channelId)
            ? state.favorites.filter((id) => id !== channelId)
            : [...state.favorites, channelId];
          return { favorites };
        }),
      
      addToRecent: (channel) =>
        set((state) => {
          const recent = [channel, ...state.recentChannels.filter((c) => c.id !== channel.id)].slice(0, 20);
          return { recentChannels: recent };
        }),
      
      setVideoQuality: (quality) =>
        set({ videoQuality: quality }),
      
      setViewMode: (mode) =>
        set({ viewMode: mode }),
      
      setTheme: (theme) =>
        set({ theme }),
      
      setAccentColor: (color) =>
        set({ accentColor: color }),
      
      setChannelSort: (sort) =>
        set({ channelSort: sort }),
      setTvMode: (enabled) => set({ tvMode: enabled }),
      setLanguage: (lang) => {
        setI18nLanguage(lang);
        set({ language: lang });
      },
      setAudioOnly: (enabled) => set({ audioOnly: enabled }),

      // Sleep timer
      setSleepTimer: (minutes) =>
        set({ sleepTimerEnd: minutes ? Date.now() + minutes * 60 * 1000 : null }),

      // Playlist auto-update
      setPlaylistAutoUpdate: (enabled) => set({ playlistAutoUpdate: enabled }),
      setPlaylistAutoUpdateInterval: (minutes) => set({ playlistAutoUpdateInterval: minutes }),

      // Watch history
      addWatchHistory: (entry) =>
        set((state) => ({
          watchHistory: [entry, ...state.watchHistory].slice(0, 100),
        })),
      clearWatchHistory: () => set({ watchHistory: [] }),
      
      // Playlist management
      savePlaylist: (name, playlist, url) => {
        const id = `pl-${Date.now()}`;
        const saved: SavedPlaylist = {
          id,
          name,
          url,
          channelCount: playlist.channels.length,
          groups: playlist.groups,
          addedAt: Date.now(),
          lastUsedAt: Date.now(),
        };
        // Store channels separately keyed by playlist id
        try {
          localStorage.setItem(`iptv-playlist-${id}`, JSON.stringify(playlist));
        } catch (e) {
          console.error('Failed to save playlist data:', e);
        }
        set((state) => ({
          savedPlaylists: [...state.savedPlaylists, saved],
          activePlaylistId: id,
        }));
        return id;
      },

      loadSavedPlaylist: (id) => {
        try {
          const raw = localStorage.getItem(`iptv-playlist-${id}`);
          if (!raw) return;
          const playlist: Playlist = JSON.parse(raw);
          set((state) => ({
            playlist,
            channels: playlist.channels,
            groups: playlist.groups,
            currentChannel: null,
            selectedGroup: null,
            searchQuery: '',
            activePlaylistId: id,
            savedPlaylists: state.savedPlaylists.map((p) =>
              p.id === id ? { ...p, lastUsedAt: Date.now() } : p
            ),
          }));
        } catch (e) {
          console.error('Failed to load saved playlist:', e);
        }
      },

      deleteSavedPlaylist: (id) => {
        try {
          localStorage.removeItem(`iptv-playlist-${id}`);
        } catch (e) {
          console.error('Failed to remove playlist data:', e);
        }
        set((state) => ({
          savedPlaylists: state.savedPlaylists.filter((p) => p.id !== id),
          activePlaylistId: state.activePlaylistId === id ? null : state.activePlaylistId,
        }));
      },

      renameSavedPlaylist: (id, name) => {
        set((state) => ({
          savedPlaylists: state.savedPlaylists.map((p) =>
            p.id === id ? { ...p, name } : p
          ),
        }));
      },

      // EPG actions
      loadEPG: async (url) => {
        set({ epgLoading: true, epgError: null, epgUrl: url });
        try {
          const data = await loadEPGFromURL(url);
          set({ epgData: data, epgLoading: false, epgLastRefresh: Date.now() });
          // Auto-fill missing channel logos from EPG
          get().enrichChannelLogos();
        } catch (err) {
          set({
            epgError: err instanceof Error ? err.message : 'Failed to load EPG',
            epgLoading: false,
          });
        }
      },

      clearEPG: () => {
        set({ epgData: null, epgUrl: null, epgError: null, epgLastRefresh: null, epgDetectedUrl: null });
      },

      setEpgAutoRefresh: (enabled) => {
        set({ epgAutoRefresh: enabled });
      },

      setEpgRefreshInterval: (minutes) => {
        set({ epgRefreshInterval: minutes });
      },

      addCustomEpgSource: (name, url) => {
        const source: EPGSource = {
          id: `custom-${Date.now()}`,
          name,
          url,
          region: 'Custom',
          isCustom: true,
        };
        set((state) => ({ epgSources: [...state.epgSources, source] }));
      },

      removeCustomEpgSource: (id) => {
        set((state) => ({ epgSources: state.epgSources.filter((s) => s.id !== id) }));
      },

      setEpgDetectedUrl: (url) => {
        set({ epgDetectedUrl: url });
      },

      getEpgMatchStats: () => {
        const { epgData, channels } = get();
        if (!epgData) return { matched: 0, total: channels.length, epgChannels: 0 };

        const epgChannelIds = new Set(epgData.channels.keys());
        const epgNamesMap = new Map<string, string>();
        for (const [id, ch] of epgData.channels) {
          epgNamesMap.set(ch.name.toLowerCase().replace(/[^a-z0-9]/g, ''), id);
        }

        let matched = 0;
        for (const ch of channels) {
          if (ch.tvgId && epgChannelIds.has(ch.tvgId)) { matched++; continue; }
          if (ch.tvgId) {
            const lower = ch.tvgId.toLowerCase();
            let found = false;
            for (const key of epgChannelIds) {
              if (key.toLowerCase() === lower) { found = true; break; }
            }
            if (found) { matched++; continue; }
          }
          const names = [ch.name, ch.tvgName].filter(Boolean) as string[];
          let nameMatched = false;
          for (const name of names) {
            const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (norm && epgNamesMap.has(norm)) { nameMatched = true; break; }
          }
          if (nameMatched) matched++;
        }

        return { matched, total: channels.length, epgChannels: epgData.channels.size };
      },

      getCurrentProgramForChannel: (tvgId) => {
        const { epgData } = get();
        if (!epgData || !tvgId) return undefined;
        const programs = epgData.programs.get(tvgId);
        if (!programs) return undefined;
        return getCurrentProgram(programs);
      },

      getNextProgramForChannel: (tvgId) => {
        const { epgData } = get();
        if (!epgData || !tvgId) return undefined;
        const programs = epgData.programs.get(tvgId);
        if (!programs) return undefined;
        return getNextProgram(programs);
      },

      // Parental controls
      setParentalPin: (pin) => set({ parentalPin: pin, parentalUnlocked: false }),
      
      toggleLockedGroup: (group) =>
        set((state) => ({
          lockedGroups: state.lockedGroups.includes(group)
            ? state.lockedGroups.filter((g) => g !== group)
            : [...state.lockedGroups, group],
        })),
      
      unlockParental: (pin) => {
        if (get().parentalPin === pin) {
          set({ parentalUnlocked: true });
          return true;
        }
        return false;
      },
      
      lockParental: () => set({ parentalUnlocked: false }),

      // Import/Export
      exportSettings: () => {
        const state = get();
        const exportData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          favorites: state.favorites,
          recentChannels: state.recentChannels,
          videoQuality: state.videoQuality,
          viewMode: state.viewMode,
          theme: state.theme,
          accentColor: state.accentColor,
          channelSort: state.channelSort,
          savedPlaylists: state.savedPlaylists,
          epgUrl: state.epgUrl,
          epgAutoRefresh: state.epgAutoRefresh,
          epgRefreshInterval: state.epgRefreshInterval,
          epgSources: state.epgSources,
          parentalPin: state.parentalPin,
          lockedGroups: state.lockedGroups,
        };
        // Also include saved playlist data from localStorage
        const playlistData: Record<string, string> = {};
        for (const pl of state.savedPlaylists) {
          const raw = localStorage.getItem(`iptv-playlist-${pl.id}`);
          if (raw) playlistData[pl.id] = raw;
        }
        return JSON.stringify({ ...exportData, playlistData }, null, 2);
      },

      importSettings: (json) => {
        try {
          const data = JSON.parse(json);
          if (!data.version) return false;

          // Restore playlist data to localStorage
          if (data.playlistData) {
            for (const [id, raw] of Object.entries(data.playlistData)) {
              localStorage.setItem(`iptv-playlist-${id}`, raw as string);
            }
          }

          set({
            favorites: data.favorites || [],
            recentChannels: data.recentChannels || [],
            videoQuality: data.videoQuality || 'auto',
            viewMode: data.viewMode || 'grid',
            theme: data.theme || 'dark',
            accentColor: data.accentColor || '#0ea5e9',
            channelSort: data.channelSort || 'default',
            savedPlaylists: data.savedPlaylists || [],
            epgUrl: data.epgUrl || null,
            epgAutoRefresh: data.epgAutoRefresh || false,
            epgRefreshInterval: data.epgRefreshInterval || 120,
            epgSources: data.epgSources || [],
            parentalPin: data.parentalPin || null,
            lockedGroups: data.lockedGroups || [],
          });
          return true;
        } catch (e) {
          console.error('Import failed:', e);
          return false;
        }
      },

      // Logo enrichment from EPG data
      enrichChannelLogos: () => {
        const { epgData, channels } = get();
        if (!epgData) return;

        let updated = false;
        const enriched = channels.map((ch) => {
          if (ch.logo) return ch;

          let epgCh = ch.tvgId ? epgData.channels.get(ch.tvgId) : undefined;
          if (!epgCh && ch.tvgId) {
            const lower = ch.tvgId.toLowerCase();
            for (const [key, val] of epgData.channels) {
              if (key.toLowerCase() === lower) { epgCh = val; break; }
            }
          }
          if (!epgCh) {
            const norm = ch.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const [, val] of epgData.channels) {
              const epgNorm = val.name.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (epgNorm === norm) { epgCh = val; break; }
            }
          }

          if (epgCh?.icon) {
            updated = true;
            return { ...ch, logo: epgCh.icon };
          }
          return ch;
        });

        if (updated) {
          set({ channels: enriched });
        }
      },

      // Fetch logos from iptv-org public channel database
      fetchChannelLogos: async () => {
        const { channels } = get();
        const missing = channels.filter((ch) => !ch.logo);
        if (missing.length === 0) return;

        try {
          const res = await fetch('https://iptv-org.github.io/database/channels.json');
          if (!res.ok) return;
          const db: { id: string; name: string; alt_names?: string[]; logo: string }[] = await res.json();

          // Build lookup maps for fast matching
          const byId = new Map<string, string>();
          const byName = new Map<string, string>();
          for (const entry of db) {
            if (!entry.logo) continue;
            byId.set(entry.id.toLowerCase(), entry.logo);
            byName.set(entry.name.toLowerCase().replace(/[^a-z0-9]/g, ''), entry.logo);
            if (entry.alt_names) {
              for (const alt of entry.alt_names) {
                byName.set(alt.toLowerCase().replace(/[^a-z0-9]/g, ''), entry.logo);
              }
            }
          }

          let updated = false;
          const enriched = get().channels.map((ch) => {
            if (ch.logo) return ch;

            // Match by tvg-id
            if (ch.tvgId) {
              const logo = byId.get(ch.tvgId.toLowerCase());
              if (logo) { updated = true; return { ...ch, logo }; }
            }

            // Match by name
            const names = [ch.name, ch.tvgName].filter(Boolean) as string[];
            for (const name of names) {
              const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (!norm) continue;
              const logo = byName.get(norm);
              if (logo) { updated = true; return { ...ch, logo }; }
              // Partial match: check if any db entry name contains this name or vice versa
              for (const [dbNorm, dbLogo] of byName) {
                if (dbNorm.length > 3 && norm.length > 3 && (dbNorm.includes(norm) || norm.includes(dbNorm))) {
                  updated = true;
                  return { ...ch, logo: dbLogo };
                }
              }
            }

            return ch;
          });

          if (updated) {
            const count = enriched.filter((ch, i) => ch.logo && !get().channels[i].logo).length;
            console.log(`[Logos] Matched ${count} channel logos from iptv-org database`);
            set({ channels: enriched });
          }
        } catch (err) {
          console.warn('[Logos] Failed to fetch channel database:', err);
        }
      },

      // Navigation
      playNextChannel: () => {
        const { channels, currentChannel } = get();
        if (!currentChannel || channels.length === 0) return;
        const idx = channels.findIndex((c) => c.id === currentChannel.id);
        const next = channels[(idx + 1) % channels.length];
        set({ currentChannel: next });
        get().addToRecent(next);
      },

      playPrevChannel: () => {
        const { channels, currentChannel } = get();
        if (!currentChannel || channels.length === 0) return;
        const idx = channels.findIndex((c) => c.id === currentChannel.id);
        const prev = channels[(idx - 1 + channels.length) % channels.length];
        set({ currentChannel: prev });
        get().addToRecent(prev);
      },

      // Computed
      getFilteredChannels: () => {
        const state = get();
        let filtered = state.channels;
        
        // Filter by group
        if (state.selectedGroup) {
          filtered = filtered.filter(
            (ch) => ch.group === state.selectedGroup || ch.groupTitle === state.selectedGroup
          );
        }
        
        // Filter by search query
        if (state.searchQuery) {
          const query = state.searchQuery.toLowerCase();
          filtered = filtered.filter(
            (ch) =>
              ch.name.toLowerCase().includes(query) ||
              ch.tvgName?.toLowerCase().includes(query) ||
              ch.group?.toLowerCase().includes(query)
          );
        }
        
        // Parental filter
        if (state.parentalPin && !state.parentalUnlocked && state.lockedGroups.length > 0) {
          filtered = filtered.filter(
            (ch) => !ch.group || !state.lockedGroups.includes(ch.group)
          );
        }

        // Sort
        switch (state.channelSort) {
          case 'name-asc':
            filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
            break;
          case 'name-desc':
            filtered = [...filtered].sort((a, b) => b.name.localeCompare(a.name));
            break;
          case 'group':
            filtered = [...filtered].sort((a, b) => (a.group || '').localeCompare(b.group || ''));
            break;
        }

        return filtered;
      },
      
      isFavorite: (channelId) => {
        return get().favorites.includes(channelId);
      },
    }),
    {
      name: 'iptv-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        favorites: state.favorites,
        recentChannels: state.recentChannels,
        videoQuality: state.videoQuality,
        viewMode: state.viewMode,
        theme: state.theme,
        accentColor: state.accentColor,
        channelSort: state.channelSort,
        tvMode: state.tvMode,
        language: state.language,
        audioOnly: state.audioOnly,
        playlistAutoUpdate: state.playlistAutoUpdate,
        playlistAutoUpdateInterval: state.playlistAutoUpdateInterval,
        watchHistory: state.watchHistory,
        savedPlaylists: state.savedPlaylists,
        activePlaylistId: state.activePlaylistId,
        epgUrl: state.epgUrl,
        epgAutoRefresh: state.epgAutoRefresh,
        epgRefreshInterval: state.epgRefreshInterval,
        epgSources: state.epgSources,
        parentalPin: state.parentalPin,
        lockedGroups: state.lockedGroups,
      }),
    }
  )
);
