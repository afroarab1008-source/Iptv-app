import { useIPTVStore, SavedPlaylist, BUILTIN_EPG_SOURCES } from '../store/iptvStore';
import { Home, Heart, Settings, X, ListMusic, Trash2, Edit3, Check, Upload, Link as LinkIcon, Loader2, Radio, RefreshCw, Zap, Globe, Plus, ChevronDown, ChevronUp, BarChart3, Download, Lock, Unlock, Shield, Tv, Monitor, Languages, Music, Film, Sparkles, QrCode } from 'lucide-react';
import RecordingsPanel from './RecordingsPanel';
import { useState, useEffect, useRef, useCallback } from 'react';
import { loadM3UFromFile, loadM3UFromURL } from '../utils/m3uParser';
import { Channel } from '../utils/m3uParser';
import { t } from '../utils/i18n';
import { LANGUAGES } from '../utils/i18n';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const {
    channels,
    setCurrentChannel,
    addToRecent,
    favorites: favoriteIds,
    language,
    recordings,
    deleteRecording,
    watchHistory,
    getRecommendedChannels,
  } = useIPTVStore();
  // Force re-render when language changes so t() calls update
  void language;

  const [activeTab, setActiveTab] = useState<'home' | 'playlists' | 'epg' | 'favorites' | 'recordings' | 'settings'>('home');

  const favoriteChannels = channels.filter((ch) => favoriteIds.includes(ch.id));

  const handleChannelClick = (channel: Channel) => {
    setCurrentChannel(channel);
    addToRecent(channel);
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-slate-800 z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:static lg:z-auto flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent">IPTV App</h2>
          <button
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-slate-700 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 overflow-x-auto flex-shrink-0 scrollbar-hide">
          {[
            { id: 'home' as const, icon: Home, label: t('nav.home') },
            { id: 'playlists' as const, icon: ListMusic, label: t('nav.playlists') },
            { id: 'epg' as const, icon: Radio, label: 'EPG' },
            { id: 'favorites' as const, icon: Heart, label: t('nav.favorites'), count: favoriteChannels.length },
            { id: 'recordings' as const, icon: Film, label: 'Rec', count: recordings.length || undefined },
            { id: 'settings' as const, icon: Settings, label: t('nav.settings') },
          ].map(({ id, icon: Icon, label, count }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative min-w-0 flex-shrink-0 px-2 py-2.5 flex flex-col items-center justify-center gap-0.5 transition-colors text-[10px] leading-tight ${
                activeTab === id
                  ? 'bg-slate-700 text-primary-400'
                  : 'text-gray-400 hover:bg-slate-700/50'
              }`}
              style={{ width: `${100 / 6}%` }}
              title={label}
            >
              <div className="relative">
                <Icon size={16} />
                {count !== undefined && count > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-primary-600 text-white text-[8px] min-w-[14px] h-[14px] flex items-center justify-center px-0.5 rounded-full leading-none">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </div>
              <span className="truncate w-full text-center">{label}</span>
              {activeTab === id && (
                <div className="absolute bottom-0 left-1 right-1 h-0.5 bg-primary-400 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'home' && (
            <div>
              {/* Recommendations */}
              {watchHistory.length > 0 && channels.length > 0 && (
                <RecommendedSection
                  getRecommendedChannels={getRecommendedChannels}
                  onChannelClick={handleChannelClick}
                />
              )}
              <div className="text-center text-gray-400 py-8">
                <Home size={48} className="mx-auto mb-4 opacity-50" />
                <p>Select a channel to start watching</p>
                <p className="text-sm mt-2 text-gray-500">
                  {channels.length > 0
                    ? `${channels.length} channels loaded`
                    : 'Load a playlist to get started'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'playlists' && <PlaylistManager />}

          {activeTab === 'epg' && <EPGGrabber />}

          {activeTab === 'favorites' && (
            <div className="space-y-2">
              {favoriteChannels.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  <Heart size={48} className="mx-auto mb-4 opacity-50" />
                  <p>No favorite channels yet</p>
                  <p className="text-sm mt-2">Add channels to favorites to access them quickly</p>
                </div>
              ) : (
                favoriteChannels.map((channel) => (
                  <SidebarChannelItem key={channel.id} channel={channel} onClick={() => handleChannelClick(channel)} />
                ))
              )}
            </div>
          )}

          {activeTab === 'recordings' && (
            <RecordingsPanel recordings={recordings} onDelete={deleteRecording} />
          )}

          {activeTab === 'settings' && <SettingsPanel />}
        </div>
      </div>
    </>
  );
}

function SidebarChannelItem({ channel, onClick }: { channel: Channel; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-slate-700 rounded-lg p-3 cursor-pointer hover:bg-slate-600 transition-colors"
    >
      <div className="flex items-center gap-3">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            className="w-12 h-8 object-contain rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-12 h-8 bg-slate-600 rounded flex items-center justify-center text-sm">📺</div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate text-sm">{channel.name}</h3>
          {channel.group && (
            <p className="text-xs text-gray-400 truncate">{channel.group}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PlaylistManager() {
  const {
    savedPlaylists,
    activePlaylistId,
    savePlaylist,
    loadSavedPlaylist,
    deleteSavedPlaylist,
    renameSavedPlaylist,
    setPlaylist,
  } = useIPTVStore();

  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<'file' | 'url' | null>(null);
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);
    try {
      const result = await loadM3UFromFile(file);
      if (result.channels.length === 0) throw new Error('No channels found');
      const name = playlistName.trim() || file.name.replace(/\.(m3u8?|txt)$/i, '');
      setPlaylist(result);
      savePlaylist(name, result);
      setShowAdd(false);
      setPlaylistName('');
      setAddMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playlist');
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
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('URL must start with http:// or https://');
      }
      const result = await loadM3UFromURL(url);
      if (result.channels.length === 0) throw new Error('No channels found');
      const name = playlistName.trim() || new URL(url).hostname;
      setPlaylist(result);
      savePlaylist(name, result, url);
      setShowAdd(false);
      setPlaylistUrl('');
      setPlaylistName('');
      setAddMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadPlaylist = (pl: SavedPlaylist) => {
    loadSavedPlaylist(pl.id);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this playlist?')) {
      deleteSavedPlaylist(id);
    }
  };

  const handleStartRename = (pl: SavedPlaylist, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(pl.id);
    setEditName(pl.name);
  };

  const handleFinishRename = (id: string) => {
    if (editName.trim()) {
      renameSavedPlaylist(id, editName.trim());
    }
    setEditingId(null);
  };

  const sortedPlaylists = [...savedPlaylists].sort((a, b) => b.lastUsedAt - a.lastUsedAt);

  return (
    <div className="space-y-4">
      {/* Add New Playlist Button */}
      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full bg-primary-600 hover:bg-primary-500 text-white py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <ListMusic size={18} />
          Add Playlist
        </button>
      ) : (
        <div className="bg-slate-700 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Add Playlist</h4>
            <button onClick={() => { setShowAdd(false); setAddMode(null); setError(null); }} className="p-1 hover:bg-slate-600 rounded">
              <X size={16} />
            </button>
          </div>

          {/* Playlist name */}
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Playlist name (optional)"
            className="w-full bg-slate-600 text-white px-3 py-2 rounded border border-slate-500 focus:outline-none focus:border-primary-500 text-sm"
          />

          {/* Mode buttons */}
          {!addMode && (
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer">
                <input
                  type="file"
                  accept=".m3u,.m3u8"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isLoading}
                />
                <div className="bg-slate-600 hover:bg-slate-500 text-white py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors text-sm">
                  <Upload size={16} />
                  File
                </div>
              </label>
              <button
                onClick={() => setAddMode('url')}
                className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors text-sm"
              >
                <LinkIcon size={16} />
                URL
              </button>
            </div>
          )}

          {/* URL input */}
          {addMode === 'url' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                placeholder="https://example.com/playlist.m3u"
                className="flex-1 bg-slate-600 text-white px-3 py-2 rounded border border-slate-500 focus:outline-none focus:border-primary-500 text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleUrlLoad()}
                disabled={isLoading}
              />
              <button
                onClick={handleUrlLoad}
                disabled={isLoading || !playlistUrl.trim()}
                className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 px-3 py-2 rounded transition-colors text-sm"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Load'}
              </button>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              Loading playlist...
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
        </div>
      )}

      {/* Saved Playlists */}
      {sortedPlaylists.length === 0 ? (
        <div className="text-center text-gray-400 py-6">
          <ListMusic size={48} className="mx-auto mb-4 opacity-50" />
          <p>No saved playlists</p>
          <p className="text-sm mt-2">Add a playlist to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h4 className="text-xs uppercase text-gray-500 font-semibold tracking-wider">Saved Playlists</h4>
          {sortedPlaylists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => handleLoadPlaylist(pl)}
              className={`bg-slate-700 rounded-lg p-3 cursor-pointer hover:bg-slate-600 transition-all ${
                activePlaylistId === pl.id ? 'ring-1 ring-primary-500 bg-slate-600' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <ListMusic size={20} className={activePlaylistId === pl.id ? 'text-primary-400' : 'text-gray-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  {editingId === pl.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleFinishRename(pl.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-slate-500 text-white px-2 py-1 rounded text-sm border border-slate-400 focus:outline-none focus:border-primary-500"
                        autoFocus
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleFinishRename(pl.id); }}
                        className="p-1 hover:bg-slate-500 rounded"
                      >
                        <Check size={14} className="text-green-400" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-semibold truncate text-sm">{pl.name}</h3>
                      <p className="text-xs text-gray-400">
                        {pl.channelCount} channels · {pl.groups.length} groups
                      </p>
                    </>
                  )}
                </div>
                {editingId !== pl.id && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {activePlaylistId === pl.id && (
                      <span className="text-[10px] bg-primary-600/30 text-primary-400 px-1.5 py-0.5 rounded">Active</span>
                    )}
                    <button
                      onClick={(e) => handleStartRename(pl, e)}
                      className="p-1.5 hover:bg-slate-500 rounded transition-colors"
                      title="Rename"
                    >
                      <Edit3 size={14} className="text-gray-400" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(pl.id, e)}
                      className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} className="text-gray-400 hover:text-red-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EPGGrabber() {
  const {
    epgData, epgUrl, epgLoading, epgError, epgAutoRefresh, epgRefreshInterval,
    epgLastRefresh, epgSources, epgDetectedUrl,
    loadEPG, clearEPG, setEpgAutoRefresh, setEpgRefreshInterval,
    addCustomEpgSource, removeCustomEpgSource, getEpgMatchStats,
  } = useIPTVStore();

  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('');
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const matchStats = epgData ? getEpgMatchStats() : null;

  // Auto-refresh logic
  const doRefresh = useCallback(() => {
    if (epgUrl && !epgLoading) {
      loadEPG(epgUrl);
    }
  }, [epgUrl, epgLoading, loadEPG]);

  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (epgAutoRefresh && epgUrl && epgRefreshInterval > 0) {
      refreshTimerRef.current = setInterval(doRefresh, epgRefreshInterval * 60 * 1000);
    }
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [epgAutoRefresh, epgUrl, epgRefreshInterval, doRefresh]);

  // Auto-load detected EPG on playlist load
  useEffect(() => {
    if (epgDetectedUrl && !epgData && !epgLoading && !epgUrl) {
      loadEPG(epgDetectedUrl);
    }
  }, [epgDetectedUrl, epgData, epgLoading, epgUrl, loadEPG]);

  const handleSelectSource = (url: string) => {
    loadEPG(url);
    setShowSources(false);
  };

  const handleAddCustom = () => {
    const url = customUrl.trim();
    const name = customName.trim();
    if (!url || !name) return;
    addCustomEpgSource(name, url);
    setCustomName('');
    setCustomUrl('');
    setShowAddCustom(false);
  };

  const allSources = [...BUILTIN_EPG_SOURCES, ...epgSources];
  const filteredSources = sourceFilter
    ? allSources.filter((s) =>
        s.name.toLowerCase().includes(sourceFilter.toLowerCase()) ||
        s.region.toLowerCase().includes(sourceFilter.toLowerCase())
      )
    : allSources;

  const regions = [...new Set(allSources.map((s) => s.region))].sort();

  const formatLastRefresh = () => {
    if (!epgLastRefresh) return 'Never';
    const diff = Date.now() - epgLastRefresh;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <div className={`rounded-lg p-3 ${epgData ? 'bg-green-900/20 border border-green-800/30' : 'bg-slate-700'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${epgData ? 'bg-green-600/20' : 'bg-slate-600'}`}>
            <Radio size={20} className={epgData ? 'text-green-400' : 'text-gray-400'} />
          </div>
          <div className="flex-1 min-w-0">
            {epgLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-primary-400" />
                <span className="text-sm text-gray-300">Grabbing EPG data...</span>
              </div>
            ) : epgData ? (
              <>
                <p className="text-sm font-medium text-green-400">EPG Active</p>
                <p className="text-xs text-gray-400">
                  {epgData.channels.size} EPG channels &middot; Last: {formatLastRefresh()}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-300">No EPG Loaded</p>
                <p className="text-xs text-gray-500">Select a source to grab EPG data</p>
              </>
            )}
          </div>
          {epgData && (
            <button
              onClick={doRefresh}
              disabled={epgLoading}
              className="p-1.5 hover:bg-white/10 rounded transition-colors"
              title="Refresh now"
            >
              <RefreshCw size={16} className={`text-gray-400 ${epgLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Match Stats */}
      {matchStats && epgData && (
        <div className="bg-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={14} className="text-primary-400" />
            <span className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Channel Matching</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Matched</span>
                <span className={matchStats.matched > 0 ? 'text-green-400' : 'text-yellow-400'}>
                  {matchStats.matched} / {matchStats.total}
                </span>
              </div>
              <div className="w-full bg-slate-600 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${matchStats.matched > 0 ? 'bg-green-500' : 'bg-yellow-500'}`}
                  style={{ width: `${matchStats.total > 0 ? (matchStats.matched / matchStats.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
          {matchStats.matched === 0 && matchStats.total > 0 && (
            <p className="text-[10px] text-yellow-400/70 mt-2">
              No matches. Channels need tvg-id attributes matching the EPG source.
            </p>
          )}
        </div>
      )}

      {/* Detected EPG URL */}
      {epgDetectedUrl && !epgData && (
        <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} className="text-blue-400" />
            <span className="text-xs font-medium text-blue-400">EPG URL Detected in Playlist</span>
          </div>
          <p className="text-xs text-gray-400 truncate mb-2" title={epgDetectedUrl}>{epgDetectedUrl}</p>
          <button
            onClick={() => loadEPG(epgDetectedUrl)}
            disabled={epgLoading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-1.5 rounded text-xs transition-colors"
          >
            {epgLoading ? 'Loading...' : 'Grab EPG from Playlist'}
          </button>
        </div>
      )}

      {/* Active source info & clear */}
      {epgData && epgUrl && (
        <div className="bg-slate-700 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Active source</p>
          <p className="text-xs text-gray-300 truncate" title={epgUrl}>{epgUrl}</p>
          <button
            onClick={clearEPG}
            className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Remove EPG data
          </button>
        </div>
      )}

      {/* EPG Sources Browser */}
      <div>
        <button
          onClick={() => setShowSources(!showSources)}
          className="w-full bg-primary-600 hover:bg-primary-500 text-white py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
        >
          <Globe size={16} />
          {epgData ? 'Change EPG Source' : 'Browse EPG Sources'}
          {showSources ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {showSources && (
        <div className="space-y-3">
          {/* Search */}
          <input
            type="text"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            placeholder="Search sources by name or region..."
            className="w-full bg-slate-600 text-white px-3 py-2 rounded border border-slate-500 focus:outline-none focus:border-primary-500 text-sm"
          />

          {/* Grouped by region */}
          {regions.map((region) => {
            const regionSources = filteredSources.filter((s) => s.region === region);
            if (regionSources.length === 0) return null;
            return (
              <div key={region}>
                <h5 className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider mb-1.5">{region}</h5>
                <div className="space-y-1">
                  {regionSources.map((source) => (
                    <div
                      key={source.id}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all text-sm ${
                        epgUrl === source.url
                          ? 'bg-primary-600/20 border border-primary-500/30'
                          : 'bg-slate-700 hover:bg-slate-600'
                      }`}
                      onClick={() => handleSelectSource(source.url)}
                    >
                      <Globe size={14} className={epgUrl === source.url ? 'text-primary-400' : 'text-gray-500'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{source.name}</p>
                        {source.description && (
                          <p className="text-[10px] text-gray-500 truncate">{source.description}</p>
                        )}
                      </div>
                      {epgUrl === source.url && (
                        <span className="text-[10px] bg-primary-600/30 text-primary-400 px-1.5 py-0.5 rounded flex-shrink-0">Active</span>
                      )}
                      {source.isCustom && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeCustomEpgSource(source.id); }}
                          className="p-1 hover:bg-red-500/20 rounded"
                          title="Remove custom source"
                        >
                          <Trash2 size={12} className="text-gray-500 hover:text-red-400" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredSources.length === 0 && (
            <p className="text-center text-gray-500 text-xs py-4">No sources match your search</p>
          )}

          {/* Add custom source */}
          {!showAddCustom ? (
            <button
              onClick={() => setShowAddCustom(true)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-gray-400 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs"
            >
              <Plus size={14} />
              Add Custom Source
            </button>
          ) : (
            <div className="bg-slate-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Custom EPG Source</span>
                <button onClick={() => setShowAddCustom(false)} className="p-0.5 hover:bg-slate-600 rounded">
                  <X size={14} />
                </button>
              </div>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Source name"
                className="w-full bg-slate-600 text-white px-2.5 py-1.5 rounded border border-slate-500 focus:outline-none focus:border-primary-500 text-xs"
              />
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://example.com/epg.xml"
                className="w-full bg-slate-600 text-white px-2.5 py-1.5 rounded border border-slate-500 focus:outline-none focus:border-primary-500 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddCustom}
                  disabled={!customName.trim() || !customUrl.trim()}
                  className="flex-1 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white py-1.5 rounded text-xs transition-colors"
                >
                  Add Source
                </button>
                <button
                  onClick={() => { loadEPG(customUrl.trim()); setShowAddCustom(false); }}
                  disabled={!customUrl.trim() || epgLoading}
                  className="flex-1 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white py-1.5 rounded text-xs transition-colors"
                >
                  Load Direct
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Auto-Refresh Settings */}
      {epgUrl && (
        <div className="bg-slate-700 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <RefreshCw size={14} className="text-gray-400" />
            <span className="text-xs font-semibold uppercase text-gray-400 tracking-wider">Auto-Refresh</span>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setEpgAutoRefresh(!epgAutoRefresh)}
              className={`w-9 h-5 rounded-full transition-colors relative ${epgAutoRefresh ? 'bg-primary-600' : 'bg-slate-500'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${epgAutoRefresh ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm">{epgAutoRefresh ? 'Enabled' : 'Disabled'}</span>
          </label>
          {epgAutoRefresh && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Refresh every</label>
              <select
                value={epgRefreshInterval}
                onChange={(e) => setEpgRefreshInterval(Number(e.target.value))}
                className="w-full bg-slate-600 text-white px-2.5 py-1.5 rounded border border-slate-500 focus:outline-none focus:border-primary-500 text-sm"
              >
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
                <option value={360}>6 hours</option>
                <option value={720}>12 hours</option>
                <option value={1440}>24 hours</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {epgError && (
        <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3">
          <p className="text-xs text-red-400">{epgError}</p>
          {epgUrl && (
            <button
              onClick={doRefresh}
              className="mt-2 text-xs text-primary-400 hover:text-primary-300"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RecommendedSection({ getRecommendedChannels, onChannelClick }: {
  getRecommendedChannels: () => import('../utils/m3uParser').Channel[];
  onChannelClick: (ch: import('../utils/m3uParser').Channel) => void;
}) {
  const recommended = getRecommendedChannels();
  if (recommended.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-primary-400" />
        <h3 className="text-sm font-semibold text-gray-300">Recommended For You</h3>
      </div>
      <div className="space-y-1.5">
        {recommended.slice(0, 8).map((ch) => (
          <div
            key={ch.id}
            onClick={() => onChannelClick(ch)}
            className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors"
          >
            {ch.logo ? (
              <img src={ch.logo} alt="" className="w-8 h-6 object-contain rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w-8 h-6 bg-slate-700 rounded flex items-center justify-center text-[10px] text-gray-500">{ch.name.charAt(0)}</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">{ch.name}</p>
              {ch.group && <p className="text-[10px] text-gray-500 truncate">{ch.group}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ACCENT_COLORS = [
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
];

function SettingsPanel() {
  const {
    videoQuality, viewMode, theme, accentColor, channelSort, tvMode,
    setVideoQuality, setViewMode, setTheme, setAccentColor, setChannelSort, setTvMode,
    language, setLanguage, audioOnly, setAudioOnly,
    playlistAutoUpdate, playlistAutoUpdateInterval,
    setPlaylistAutoUpdate, setPlaylistAutoUpdateInterval,
    parentalPin, lockedGroups, parentalUnlocked, groups,
    setParentalPin, toggleLockedGroup, unlockParental, lockParental,
    exportSettings, importSettings,
  } = useIPTVStore();

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Theme</h3>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'dark' as const, label: 'Dark', preview: 'bg-slate-900' },
            { id: 'light' as const, label: 'Light', preview: 'bg-gray-100' },
            { id: 'oled' as const, label: 'OLED', preview: 'bg-black' },
          ]).map(({ id, label, preview }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className={`p-3 rounded-lg border-2 transition-all text-center ${
                theme === id
                  ? 'border-[var(--accent)] bg-slate-700'
                  : 'border-transparent bg-slate-700/50 hover:bg-slate-700'
              }`}
            >
              <div className={`w-full h-6 rounded ${preview} mb-2 ${id === 'light' ? 'border border-gray-300' : ''}`} />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Accent Color */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Accent Color</h3>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setAccentColor(c.value)}
              className={`w-8 h-8 rounded-full transition-all ${
                accentColor === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-800 scale-110' : 'hover:scale-110'
              }`}
              style={{ backgroundColor: c.value }}
              title={c.name}
            />
          ))}
        </div>
      </div>

      {/* Channel Sort */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Channel Sorting</h3>
        <select
          value={channelSort}
          onChange={(e) => setChannelSort(e.target.value as typeof channelSort)}
          className="w-full bg-slate-700 text-white px-3 py-2.5 rounded-lg border border-slate-600 focus:outline-none focus:border-[var(--accent)] text-sm"
        >
          <option value="default">Default (playlist order)</option>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
          <option value="group">Group</option>
        </select>
      </div>

      {/* Video Quality */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Video Quality</h3>
        <select
          value={videoQuality}
          onChange={(e) => setVideoQuality(e.target.value as typeof videoQuality)}
          className="w-full bg-slate-700 text-white px-3 py-2.5 rounded-lg border border-slate-600 focus:outline-none focus:border-[var(--accent)] text-sm"
        >
          <option value="auto">Auto</option>
          <option value="sd">SD</option>
          <option value="hd">HD</option>
          <option value="fhd">FHD</option>
          <option value="4k">4K</option>
        </select>
      </div>

      {/* View Mode */}
      <div>
        <h3 className="text-lg font-semibold mb-3">View Mode</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-3 rounded-lg border-2 transition-all text-sm ${
              viewMode === 'grid'
                ? 'border-[var(--accent)] bg-slate-700'
                : 'border-transparent bg-slate-700/50 hover:bg-slate-700'
            }`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-3 rounded-lg border-2 transition-all text-sm ${
              viewMode === 'list'
                ? 'border-[var(--accent)] bg-slate-700'
                : 'border-transparent bg-slate-700/50 hover:bg-slate-700'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {/* TV Mode */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Tv size={18} />
          TV Mode
        </h3>
        <button
          onClick={() => setTvMode(!tvMode)}
          className={`w-full py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm border-2 ${
            tvMode
              ? 'border-[var(--accent)] bg-slate-700 text-[var(--accent)]'
              : 'border-transparent bg-slate-700/50 hover:bg-slate-700 text-white'
          }`}
        >
          <Monitor size={16} />
          {tvMode ? 'TV Mode Active (click to disable)' : 'Enable TV Mode'}
        </button>
        <p className="text-xs text-gray-400 mt-1.5">Larger text and controls for TVs / 10-foot viewing</p>
      </div>

      {/* Language */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Languages size={18} />
          {t('settings.language')}
        </h3>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full bg-slate-700 text-white px-3 py-2.5 rounded-lg border border-slate-600 focus:outline-none focus:border-[var(--accent)] text-sm"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </select>
      </div>

      {/* Audio-Only */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Music size={18} />
          {t('player.audioOnly')}
        </h3>
        <button
          onClick={() => setAudioOnly(!audioOnly)}
          className={`w-full py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm border-2 ${
            audioOnly
              ? 'border-[var(--accent)] bg-slate-700 text-[var(--accent)]'
              : 'border-transparent bg-slate-700/50 hover:bg-slate-700 text-white'
          }`}
        >
          <Music size={16} />
          {audioOnly ? 'Audio-Only Active (click to disable)' : 'Enable Audio-Only'}
        </button>
        <p className="text-xs text-gray-400 mt-1.5">Hide video, lower bandwidth for radio streams</p>
      </div>

      {/* Playlist Auto-Update */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <RefreshCw size={18} />
          {t('settings.playlistAutoUpdate')}
        </h3>
        <label className="flex items-center gap-3 cursor-pointer mb-3">
          <div
            onClick={() => setPlaylistAutoUpdate(!playlistAutoUpdate)}
            className={`w-9 h-5 rounded-full transition-colors relative ${playlistAutoUpdate ? 'bg-primary-600' : 'bg-slate-500'}`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${playlistAutoUpdate ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-sm">{playlistAutoUpdate ? 'Enabled' : 'Disabled'}</span>
        </label>
        <p className="text-xs text-gray-400 mb-2">{t('settings.autoUpdateHint')}</p>
        {playlistAutoUpdate && (
          <div>
            <label className="text-xs text-gray-400 mb-1 block">{t('settings.updateEvery')}</label>
            <select
              value={playlistAutoUpdateInterval}
              onChange={(e) => setPlaylistAutoUpdateInterval(Number(e.target.value))}
              className="w-full bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-[var(--accent)] text-sm"
            >
              <option value={60}>1 hour</option>
              <option value={180}>3 hours</option>
              <option value={360}>6 hours</option>
              <option value={720}>12 hours</option>
              <option value={1440}>24 hours</option>
            </select>
          </div>
        )}
      </div>

      {/* Parental Controls */}
      <ParentalControlsSection
        parentalPin={parentalPin}
        lockedGroups={lockedGroups}
        parentalUnlocked={parentalUnlocked}
        groups={groups}
        setParentalPin={setParentalPin}
        toggleLockedGroup={toggleLockedGroup}
        unlockParental={unlockParental}
        lockParental={lockParental}
      />

      {/* Remote Control */}
      <RemoteControlSection />

      {/* Import / Export */}
      <ImportExportSection exportSettings={exportSettings} importSettings={importSettings} />
    </div>
  );
}

function RemoteControlSection() {
  const remoteUrl = `${window.location.origin}${window.location.pathname}?mode=remote`;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <QrCode size={18} />
        Mobile Remote
      </h3>
      <p className="text-xs text-gray-400 mb-3">
        Open this URL on your phone to use it as a remote control:
      </p>
      <div className="bg-slate-700 rounded-lg p-3">
        <p className="text-xs text-primary-400 break-all select-all font-mono">{remoteUrl}</p>
        <button
          onClick={() => navigator.clipboard.writeText(remoteUrl)}
          className="mt-2 text-xs bg-primary-600 hover:bg-primary-500 text-white px-3 py-1.5 rounded transition-colors"
        >
          Copy URL
        </button>
      </div>
      <p className="text-[10px] text-gray-500 mt-2">
        Both devices must be on the same network and browser for BroadcastChannel to work.
        Alternatively, open the same app in two tabs.
      </p>
    </div>
  );
}

function ParentalControlsSection({
  parentalPin, lockedGroups, parentalUnlocked, groups,
  setParentalPin, toggleLockedGroup, unlockParental, lockParental,
}: {
  parentalPin: string | null;
  lockedGroups: string[];
  parentalUnlocked: boolean;
  groups: string[];
  setParentalPin: (pin: string | null) => void;
  toggleLockedGroup: (group: string) => void;
  unlockParental: (pin: string) => boolean;
  lockParental: () => void;
}) {
  const [showSetup, setShowSetup] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const handleSetPin = () => {
    if (newPin.length >= 4) {
      setParentalPin(newPin);
      setNewPin('');
      setShowSetup(false);
    }
  };

  const handleUnlock = () => {
    if (unlockParental(pinInput)) {
      setPinInput('');
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Shield size={18} />
        Parental Controls
      </h3>

      {!parentalPin ? (
        !showSetup ? (
          <button
            onClick={() => setShowSetup(true)}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
          >
            <Lock size={16} />
            Set Up PIN
          </button>
        ) : (
          <div className="bg-slate-700 rounded-lg p-3 space-y-2">
            <p className="text-xs text-gray-400">Create a 4+ digit PIN to lock channel groups</p>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter PIN (4+ digits)"
              maxLength={8}
              className="w-full bg-slate-600 text-white px-3 py-2 rounded border border-slate-500 focus:outline-none focus:border-[var(--accent)] text-sm text-center tracking-widest"
              onKeyDown={(e) => e.key === 'Enter' && handleSetPin()}
            />
            <div className="flex gap-2">
              <button onClick={handleSetPin} disabled={newPin.length < 4} className="flex-1 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white py-1.5 rounded text-xs">
                Set PIN
              </button>
              <button onClick={() => { setShowSetup(false); setNewPin(''); }} className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-1.5 rounded text-xs">
                Cancel
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {/* Lock/Unlock toggle */}
          <div className="flex items-center justify-between bg-slate-700 rounded-lg p-3">
            <span className="text-sm flex items-center gap-2">
              {parentalUnlocked ? <Unlock size={16} className="text-green-400" /> : <Lock size={16} className="text-red-400" />}
              {parentalUnlocked ? 'Unlocked' : 'Locked'}
            </span>
            {parentalUnlocked ? (
              <button onClick={lockParental} className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded hover:bg-red-500/30">
                Lock Now
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, '')); setPinError(false); }}
                  placeholder="PIN"
                  maxLength={8}
                  className={`w-20 bg-slate-600 text-white px-2 py-1 rounded text-xs text-center tracking-widest ${pinError ? 'border border-red-500' : 'border border-slate-500'}`}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                />
                <button onClick={handleUnlock} className="text-xs bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-500">
                  Unlock
                </button>
              </div>
            )}
          </div>

          {/* Locked groups */}
          {parentalUnlocked && groups.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Select groups to hide when locked:</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {groups.map((group) => (
                  <label key={group} className="flex items-center gap-2 p-2 bg-slate-700/50 rounded cursor-pointer hover:bg-slate-700 text-xs">
                    <input
                      type="checkbox"
                      checked={lockedGroups.includes(group)}
                      onChange={() => toggleLockedGroup(group)}
                      className="w-3.5 h-3.5 rounded"
                    />
                    <span className="truncate">{group}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Remove PIN */}
          {parentalUnlocked && (
            <button
              onClick={() => setParentalPin(null)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Remove PIN & disable parental controls
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ImportExportSection({ exportSettings, importSettings }: { exportSettings: () => string; importSettings: (json: string) => boolean }) {
  const [importResult, setImportResult] = useState<'success' | 'error' | null>(null);

  const handleExport = () => {
    const json = exportSettings();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iptv-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const ok = importSettings(text);
      setImportResult(ok ? 'success' : 'error');
      setTimeout(() => setImportResult(null), 3000);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Download size={18} />
        Backup & Restore
      </h3>
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
        >
          <Download size={16} />
          Export
        </button>
        <label className="flex-1 cursor-pointer">
          <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          <div className="bg-slate-700 hover:bg-slate-600 text-white py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors text-sm h-full">
            <Upload size={16} />
            Import
          </div>
        </label>
      </div>
      {importResult === 'success' && <p className="text-xs text-green-400 mt-2">Settings restored successfully!</p>}
      {importResult === 'error' && <p className="text-xs text-red-400 mt-2">Invalid backup file</p>}
    </div>
  );
}
