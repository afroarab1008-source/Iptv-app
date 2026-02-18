import { useState, useEffect, useRef, useCallback } from 'react';
import VideoPlayer from './components/VideoPlayer';
import ChannelList from './components/ChannelList';
import Sidebar from './components/Sidebar';
import MultiView from './components/MultiView';
import RemoteControl from './components/RemoteControl';
import { useRemoteCommands, RemoteCommand } from './hooks/useRemoteCommands';
import { Menu } from 'lucide-react';
import { useIPTVStore } from './store/iptvStore';
import { useTheme } from './hooks/useTheme';
import { loadM3UFromURL } from './utils/m3uParser';

function EPGToast() {
  const epgError = useIPTVStore((s) => s.epgError);
  const epgLoading = useIPTVStore((s) => s.epgLoading);
  const epgData = useIPTVStore((s) => s.epgData);
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (epgError) {
      setMessage(`EPG Error: ${epgError}`);
      setShow(true);
    } else if (epgLoading) {
      setMessage('Loading EPG data...');
      setShow(true);
    } else if (epgData) {
      const progCount = Array.from(epgData.programs.values()).reduce((s, p) => s + p.length, 0);
      setMessage(`EPG loaded: ${epgData.channels.size} channels, ${progCount} programs`);
      setShow(true);
      const timer = setTimeout(() => setShow(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [epgError, epgLoading, epgData]);

  if (!show) return null;

  const isError = !!epgError;
  const isLoading = epgLoading;

  return (
    <div className={`fixed bottom-4 right-4 z-50 max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm transition-all ${
      isError ? 'bg-red-900/90 border border-red-700 text-red-200' :
      isLoading ? 'bg-yellow-900/90 border border-yellow-700 text-yellow-200' :
      'bg-green-900/90 border border-green-700 text-green-200'
    }`}>
      <div className="flex items-start gap-2">
        <span className="flex-1">{message}</span>
        <button onClick={() => setShow(false)} className="text-white/50 hover:text-white">&times;</button>
      </div>
    </div>
  );
}

function usePlaylistAutoUpdate() {
  const { playlistAutoUpdate, playlistAutoUpdateInterval, savedPlaylists, activePlaylistId, setPlaylist } = useIPTVStore();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doUpdate = useCallback(async () => {
    const active = savedPlaylists.find((p) => p.id === activePlaylistId);
    if (!active?.url) return;
    try {
      const result = await loadM3UFromURL(active.url);
      if (result.channels.length > 0) {
        setPlaylist(result);
        console.log('[Auto-Update] Playlist refreshed:', result.channels.length, 'channels');
      }
    } catch (err) {
      console.warn('[Auto-Update] Failed:', err);
    }
  }, [savedPlaylists, activePlaylistId, setPlaylist]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (playlistAutoUpdate && playlistAutoUpdateInterval > 0) {
      timerRef.current = setInterval(doUpdate, playlistAutoUpdateInterval * 60 * 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playlistAutoUpdate, playlistAutoUpdateInterval, doUpdate]);
}

function useAutoLoadPlaylist() {
  const { channels, setPlaylist, savePlaylist } = useIPTVStore();
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || channels.length > 0) return;
    loaded.current = true;

    (async () => {
      try {
        const res = await fetch('/auto-playlist.m3u');
        if (!res.ok) return;
        const text = await res.text();
        if (!text.includes('#EXTM3U')) return;
        const { parseM3U } = await import('./utils/m3uParser');
        const playlist = parseM3U(text);
        if (playlist.channels.length > 0) {
          setPlaylist(playlist);
          savePlaylist('Auto-Playlist', playlist);
          console.log('[Auto-Playlist] Loaded', playlist.channels.length, 'channels');
        }
      } catch {
        // No auto-playlist available
      }
    })();
  }, [channels.length, setPlaylist, savePlaylist]);
}

function useRemote() {
  const { channels, setCurrentChannel, addToRecent, playNextChannel, playPrevChannel } = useIPTVStore();

  const handleCommand = useCallback((cmd: RemoteCommand) => {
    switch (cmd.type) {
      case 'channelUp':
        playNextChannel();
        break;
      case 'channelDown':
        playPrevChannel();
        break;
      case 'channelNumber': {
        if (cmd.value !== undefined && cmd.value > 0 && cmd.value <= channels.length) {
          const ch = channels[cmd.value - 1];
          if (ch) { setCurrentChannel(ch); addToRecent(ch); }
        }
        break;
      }
      case 'mute': {
        const video = document.querySelector('video');
        if (video) video.muted = !video.muted;
        break;
      }
      case 'volumeUp': {
        const v = document.querySelector('video');
        if (v) v.volume = Math.min(1, v.volume + 0.1);
        break;
      }
      case 'volumeDown': {
        const v = document.querySelector('video');
        if (v) v.volume = Math.max(0, v.volume - 0.1);
        break;
      }
      case 'stop':
        setCurrentChannel(null);
        break;
    }
  }, [channels, playNextChannel, playPrevChannel, setCurrentChannel, addToRecent]);

  useRemoteCommands(handleCommand);
}

function App() {
  useTheme();
  usePlaylistAutoUpdate();
  useAutoLoadPlaylist();
  useRemote();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentChannel, multiViewActive, multiViewChannels, setMultiViewActive } = useIPTVStore();

  // Check for remote mode
  const isRemoteMode = new URLSearchParams(window.location.search).get('mode') === 'remote';
  if (isRemoteMode) {
    return <RemoteControl />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Mobile Menu Button */}
        {!currentChannel && !multiViewActive && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden fixed top-4 left-4 z-30 bg-slate-800 p-2 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Menu size={24} />
          </button>
        )}

        {/* Multi-View Mode */}
        {multiViewActive && (
          <div className="flex-1 overflow-hidden">
            <MultiView
              channels={multiViewChannels.filter(Boolean) as import('./utils/m3uParser').Channel[]}
              onExit={() => setMultiViewActive(false)}
            />
          </div>
        )}

        {/* Channel List */}
        {!currentChannel && !multiViewActive && (
          <div className="flex-1 overflow-hidden">
            <ChannelList />
          </div>
        )}

        {/* Video Player */}
        {currentChannel && !multiViewActive && (
          <div className="flex-1 overflow-hidden">
            <VideoPlayer />
          </div>
        )}
      </div>

      {/* EPG status toast */}
      <EPGToast />
    </div>
  );
}

export default App;
