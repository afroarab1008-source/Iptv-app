import { useIPTVStore } from '../store/iptvStore';
import { Channel } from '../utils/m3uParser';
import { Heart, Grid3x3, List, Search, X, Upload, Link as LinkIcon, Loader2, Tv } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { loadM3UFromFile, loadM3UFromURL } from '../utils/m3uParser';
import { EPGProgram, getProgramProgress, formatTime, getCurrentProgram } from '../utils/epgParser';

export default function ChannelList() {
  const {
    channels,
    groups,
    currentChannel,
    selectedGroup,
    searchQuery,
    viewMode,
    setCurrentChannel,
    setSelectedGroup,
    setSearchQuery,
    setViewMode,
    toggleFavorite,
    addToRecent,
    setPlaylist,
    savePlaylist,
    isFavorite,
    getFilteredChannels,
    epgData,
  } = useIPTVStore();

  const [showPlaylistInput, setShowPlaylistInput] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const filteredChannels = getFilteredChannels();
  const visibleChannels = filteredChannels.slice(0, visibleCount);
  const hasMore = visibleCount < filteredChannels.length;

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(60);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [searchQuery, selectedGroup]);

  // Infinite scroll - load more when sentinel is visible
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setVisibleCount((prev) => prev + 60);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  const handleChannelClick = (channel: Channel) => {
    setCurrentChannel(channel);
    addToRecent(channel);
  };

  const findEpgProgram = useCallback((channel: Channel): EPGProgram | undefined => {
    if (!epgData) return undefined;
    // Exact tvgId
    if (channel.tvgId) {
      const progs = epgData.programs.get(channel.tvgId);
      if (progs && progs.length > 0) return getCurrentProgram(progs);
      // Case-insensitive
      const lower = channel.tvgId.toLowerCase();
      for (const [key, p] of epgData.programs) {
        if (key.toLowerCase() === lower && p.length > 0) return getCurrentProgram(p);
      }
    }
    // Fuzzy name match
    const names = [channel.name, channel.tvgName].filter(Boolean) as string[];
    for (const name of names) {
      const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!norm) continue;
      for (const [epgId, epgCh] of epgData.channels) {
        const epgNorm = epgCh.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (epgNorm === norm || epgNorm.includes(norm) || norm.includes(epgNorm)) {
          const progs = epgData.programs.get(epgId);
          if (progs && progs.length > 0) return getCurrentProgram(progs);
        }
      }
    }
    return undefined;
  }, [epgData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setVisibleCount(60);
    try {
      const playlist = await loadM3UFromFile(file);
      if (playlist.channels.length === 0) {
        throw new Error('No channels found in playlist file');
      }
      // Defer state update to let the UI breathe
      await new Promise((r) => setTimeout(r, 0));
      setPlaylist(playlist);
      savePlaylist(file.name.replace(/\.(m3u8?|txt)$/i, ''), playlist);
      setShowPlaylistInput(false);
    } catch (error) {
      console.error('Error loading playlist:', error);
      setError(error instanceof Error ? error.message : 'Failed to load playlist file. Please check the file format.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUrlLoad = async () => {
    if (!playlistUrl.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      const url = playlistUrl.trim();
      // Basic URL validation
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('URL must start with http:// or https://');
      }
      
      const playlist = await loadM3UFromURL(url);
      if (playlist.channels.length === 0) {
        throw new Error('No channels found in playlist. The URL may be invalid or the playlist is empty.');
      }
      setPlaylist(playlist);
      try {
        const hostname = new URL(url).hostname;
        savePlaylist(hostname, playlist, url);
      } catch { /* ignore naming failure */ }
      setPlaylistUrl('');
      setShowPlaylistInput(false);
      setError(null);
    } catch (error) {
      console.error('Error loading playlist:', error);
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
          setError('Failed to load playlist. CORS error - the server may not allow cross-origin requests.');
        } else if (error.message.includes('404')) {
          setError('Playlist not found (404). Please check the URL.');
        } else {
          setError(error.message);
        }
      } else {
        setError('Failed to load playlist from URL. Please check the URL and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!channels.length) {
    return (
      <div className="w-full h-screen bg-slate-900 flex items-center justify-center p-8">
        {isLoading ? (
          <div className="text-center fade-in">
            <Loader2 size={48} className="animate-spin text-primary-400 mx-auto mb-4" />
            <p className="text-gray-300 text-lg">Loading playlist...</p>
            <p className="text-gray-500 text-sm mt-2">Parsing channels, please wait</p>
          </div>
        ) : (
        <div className="text-center max-w-md fade-in-up">
          <div className="text-7xl mb-6 drop-shadow-lg">📡</div>
          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">IPTV App</h2>
          <p className="text-gray-400 mb-8">
            Load an M3U playlist to get started. Upload a file or enter a URL.
          </p>
          <div className="flex flex-col gap-3">
            <label className="cursor-pointer group">
              <input
                type="file"
                accept=".m3u,.m3u8"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isLoading}
              />
              <div className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-primary-600/20 group-hover:shadow-primary-500/30 group-hover:-translate-y-0.5">
                <Upload size={20} />
                {isLoading ? 'Loading...' : 'Upload M3U File'}
              </div>
            </label>
            <button
              onClick={() => setShowPlaylistInput(true)}
              className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 hover:-translate-y-0.5"
            >
              <LinkIcon size={20} />
              Load from URL
            </button>
          </div>
          {showPlaylistInput && (
            <div className="mt-6 p-4 bg-slate-800 rounded-lg">
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={playlistUrl}
                  onChange={(e) => {
                    setPlaylistUrl(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter M3U playlist URL (e.g., https://example.com/playlist.m3u)"
                  className="flex-1 bg-slate-700 text-white px-4 py-2 rounded border border-slate-600 focus:outline-none focus:border-primary-500"
                  onKeyPress={(e) => e.key === 'Enter' && !isLoading && playlistUrl.trim() && handleUrlLoad()}
                  disabled={isLoading}
                />
                <button
                  onClick={handleUrlLoad}
                  disabled={isLoading || !playlistUrl.trim()}
                  className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 px-4 py-2 rounded transition-colors flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Loading...
                    </>
                  ) : (
                    'Load'
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowPlaylistInput(false);
                    setPlaylistUrl('');
                    setError(null);
                  }}
                  className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded transition-colors"
                  disabled={isLoading}
                >
                  <X size={20} />
                </button>
              </div>
              {error && (
                <div className="mt-3 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-red-500">⚠️</span>
                    <div className="flex-1">
                      <p className="font-semibold mb-1">Error loading playlist</p>
                      <p>{error}</p>
                    </div>
                    <button
                      onClick={() => setError(null)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Channels</h1>
            <span className="bg-primary-600/20 text-primary-400 text-sm font-medium px-2.5 py-0.5 rounded-full">
              {filteredChannels.length} / {channels.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
              }`}
              title="Grid View"
            >
              <Grid3x3 size={20} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
              }`}
              title="List View"
            >
              <List size={20} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search channels..."
            className="w-full bg-slate-700 text-white pl-10 pr-4 py-2 rounded border border-slate-600 focus:outline-none focus:border-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Group Filter */}
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedGroup(null)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                !selectedGroup
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
              }`}
            >
              All
            </button>
            {groups.map((group) => (
              <button
                key={group}
                onClick={() => setSelectedGroup(group)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  selectedGroup === group
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
                }`}
              >
                {group}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Channel Grid/List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {filteredChannels.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">No channels found</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {visibleChannels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                isActive={currentChannel?.id === channel.id}
                isFavorite={isFavorite(channel.id)}
                currentProgram={findEpgProgram(channel)}
                onClick={() => handleChannelClick(channel)}
                onToggleFavorite={() => toggleFavorite(channel.id)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleChannels.map((channel) => (
              <ChannelListItem
                key={channel.id}
                channel={channel}
                isActive={currentChannel?.id === channel.id}
                isFavorite={isFavorite(channel.id)}
                currentProgram={findEpgProgram(channel)}
                onClick={() => handleChannelClick(channel)}
                onToggleFavorite={() => toggleFavorite(channel.id)}
              />
            ))}
          </div>
        )}
        {/* Infinite scroll sentinel */}
        {hasMore && (
          <div ref={loadMoreRef} className="flex items-center justify-center py-6">
            <Loader2 size={24} className="animate-spin text-primary-400 mr-2" />
            <span className="text-gray-400 text-sm">
              Loading more... ({visibleCount} / {filteredChannels.length})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface ChannelCardProps {
  channel: Channel;
  isActive: boolean;
  isFavorite: boolean;
  currentProgram?: import('../utils/epgParser').EPGProgram;
  onClick: () => void;
  onToggleFavorite: () => void;
}

function ChannelCard({ channel, isActive, isFavorite, currentProgram, onClick, onToggleFavorite }: ChannelCardProps) {
  return (
    <div
      className={`channel-card bg-slate-800 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:shadow-primary-500/10 ${
        isActive ? 'ring-2 ring-primary-500 pulse-glow' : ''
      }`}
      onClick={onClick}
    >
      <div className="aspect-video bg-slate-700 relative flex items-center justify-center overflow-hidden">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            className="w-full h-full object-contain transition-transform duration-300 hover:scale-110"
            onError={(e) => {
              const el = e.target as HTMLImageElement;
              el.style.display = 'none';
              el.parentElement?.querySelector('.channel-placeholder')?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`channel-placeholder flex flex-col items-center justify-center gap-1 ${channel.logo ? 'hidden' : ''}`}>
          <Tv size={28} className="text-gray-500" />
          <span className="text-lg font-bold text-gray-400">{channel.name.charAt(0).toUpperCase()}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={`absolute top-2 right-2 p-1.5 rounded-full transition-all duration-200 ${
            isFavorite
              ? 'bg-red-500 text-white scale-110'
              : 'bg-black/50 text-gray-300 hover:bg-black/70 opacity-0 group-hover:opacity-100'
          }`}
        >
          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
        {isActive && (
          <div className="absolute bottom-2 left-2 bg-primary-600 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            LIVE
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-sm truncate" title={channel.name}>
          {channel.name}
        </h3>
        {currentProgram ? (
          <div className="mt-1">
            <p className="text-xs text-primary-400 truncate" title={currentProgram.title}>
              {currentProgram.title}
            </p>
            <div className="mt-1 w-full bg-slate-700 rounded-full h-1">
              <div
                className="bg-primary-500 h-1 rounded-full transition-all"
                style={{ width: `${getProgramProgress(currentProgram)}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {formatTime(currentProgram.start)} - {formatTime(currentProgram.stop)}
            </p>
          </div>
        ) : channel.group ? (
          <p className="text-xs text-gray-400 truncate">{channel.group}</p>
        ) : null}
      </div>
    </div>
  );
}

interface ChannelListItemProps {
  channel: Channel;
  isActive: boolean;
  isFavorite: boolean;
  currentProgram?: import('../utils/epgParser').EPGProgram;
  onClick: () => void;
  onToggleFavorite: () => void;
}

function ChannelListItem({ channel, isActive, isFavorite, currentProgram, onClick, onToggleFavorite }: ChannelListItemProps) {
  return (
    <div
      className={`channel-card bg-slate-800 rounded-lg p-4 flex items-center gap-4 cursor-pointer transition-all duration-200 hover:bg-slate-700 hover:translate-x-1 ${
        isActive ? 'ring-2 ring-primary-500 bg-slate-700' : ''
      }`}
      onClick={onClick}
    >
      <div className="w-20 h-12 bg-slate-700 rounded flex-shrink-0 flex items-center justify-center overflow-hidden relative">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            className="w-full h-full object-contain"
            onError={(e) => {
              const el = e.target as HTMLImageElement;
              el.style.display = 'none';
              el.parentElement?.querySelector('.channel-placeholder')?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`channel-placeholder flex items-center justify-center gap-1.5 ${channel.logo ? 'hidden' : ''}`}>
          <Tv size={16} className="text-gray-500" />
          <span className="text-sm font-bold text-gray-400">{channel.name.charAt(0).toUpperCase()}</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold truncate">{channel.name}</h3>
          {isActive && (
            <span className="bg-primary-600 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        {currentProgram ? (
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-sm text-primary-400 truncate" title={currentProgram.title}>
              {currentProgram.title}
            </p>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {formatTime(currentProgram.start)} - {formatTime(currentProgram.stop)}
            </span>
          </div>
        ) : channel.group ? (
          <p className="text-sm text-gray-400 truncate">{channel.group}</p>
        ) : null}
        {currentProgram && (
          <div className="mt-1 w-full bg-slate-700 rounded-full h-1">
            <div
              className="bg-primary-500 h-1 rounded-full transition-all"
              style={{ width: `${getProgramProgress(currentProgram)}%` }}
            />
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={`p-2 rounded transition-all duration-200 ${
          isFavorite
            ? 'text-red-500 scale-110'
            : 'text-gray-400 hover:text-red-500'
        }`}
      >
        <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}
