import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import '@videojs/http-streaming';
import { useIPTVStore } from '../store/iptvStore';
import type { Channel } from '../utils/m3uParser';
import { X, Maximize2, Minimize2, PictureInPicture2, SkipForward, SkipBack, Volume2, VolumeX, Cast, Moon, Music, Subtitles, ListVideo } from 'lucide-react';
import { getProgramProgress, formatTime, getCurrentProgram, getNextProgram } from '../utils/epgParser';
import { initCast, requestCastSession, stopCasting, castMedia, getCastDeviceName, CastState } from '../utils/castManager';
import { t } from '../utils/i18n';

export default function VideoPlayer() {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<videojs.Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { currentChannel, setIsPlaying, setCurrentChannel, playNextChannel, playPrevChannel, addWatchHistory, audioOnly, sleepTimerEnd, setSleepTimer, channels } = useIPTVStore();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPiP, setIsPiP] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [castState, setCastState] = useState<CastState>('unavailable');
  const [castMessage, setCastMessage] = useState<string | null>(null);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [sleepRemaining, setSleepRemaining] = useState<string | null>(null);
  
  const [showSubsMenu, setShowSubsMenu] = useState(false);
  const [channelNumBuffer, setChannelNumBuffer] = useState('');
  const [showChannelList, setShowChannelList] = useState(false);
  const [channelBanner, setChannelBanner] = useState(true);
  const channelBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelNumTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchStartRef = useRef<number>(Date.now());
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    initCast({
      onStateChange: setCastState,
      onError: (msg) => {
        console.warn('[Cast]', msg);
        setCastMessage(msg);
        setTimeout(() => setCastMessage(null), 5000);
      },
    });
  }, []);

  // Channel info banner — show for 5s on channel switch, then fade out
  useEffect(() => {
    setChannelBanner(true);
    if (channelBannerTimerRef.current) clearTimeout(channelBannerTimerRef.current);
    channelBannerTimerRef.current = setTimeout(() => setChannelBanner(false), 5000);
    return () => { if (channelBannerTimerRef.current) clearTimeout(channelBannerTimerRef.current); };
  }, [currentChannel]);

  // Sleep timer countdown
  useEffect(() => {
    if (!sleepTimerEnd) { setSleepRemaining(null); return; }
    const tick = () => {
      const left = sleepTimerEnd - Date.now();
      if (left <= 0) {
        setSleepTimer(null);
        playerRef.current?.pause();
        setSleepRemaining(null);
        return;
      }
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      setSleepRemaining(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sleepTimerEnd, setSleepTimer]);

  // Watch history: track viewing duration
  useEffect(() => {
    watchStartRef.current = Date.now();
    return () => {
      if (currentChannel) {
        const duration = Math.floor((Date.now() - watchStartRef.current) / 1000);
        if (duration >= 10) {
          addWatchHistory({
            channelId: currentChannel.id,
            channelName: currentChannel.name,
            channelLogo: currentChannel.logo,
            group: currentChannel.group,
            startedAt: watchStartRef.current,
            duration,
          });
        }
      }
    };
  }, [currentChannel, addWatchHistory]);

  // Auto-cast when session connects and channel is playing
  useEffect(() => {
    if (castState === 'connected' && currentChannel) {
      const isHLS = currentChannel.url.toLowerCase().includes('.m3u8');
      castMedia(
        currentChannel.url,
        currentChannel.name,
        isHLS ? 'application/x-mpegURL' : 'video/mp4'
      );
    }
  }, [castState, currentChannel]);

  const handleCast = () => {
    if (castState === 'connected') {
      stopCasting();
    } else if (castState === 'available') {
      requestCastSession();
    }
  };

  const loadSource = useCallback((player: videojs.Player, channel: typeof currentChannel, autoplay = true) => {
    if (!channel) return;

    const url = channel.url.toLowerCase();
    const isHLS = url.includes('.m3u8') || url.includes('hls');
    const streamType = isHLS ? 'application/x-mpegURL' : 'video/mp4';

    console.log('Setting source:', channel.url, 'type:', streamType, 'autoplay:', autoplay);
    setIsLoading(true);
    setError(null);

    player.src({ src: channel.url, type: streamType });

    if (autoplay) {
      // Try playing immediately — works if user already interacted with the page
      player.play().catch(() => {
        // If immediate play fails, wait for the stream to be ready
        const tryPlay = () => {
          player.play().catch((playErr: unknown) => {
            console.error('Auto-play failed:', playErr);
          });
          player.off('canplay', tryPlay);
          player.off('loadeddata', tryPlay);
        };
        player.one('canplay', tryPlay);
        player.one('loadeddata', tryPlay);
      });
    }
  }, []);

  // Initialize player and load source
  useEffect(() => {
    if (!videoRef.current || !currentChannel) return;

    // If player already exists, just update the source
    if (playerRef.current) {
      loadSource(playerRef.current, currentChannel);
      return;
    }

    // Create a fresh video element inside the wrapper div
    const videoElement = document.createElement('video');
    videoElement.classList.add('video-js', 'vjs-big-play-centered');
    videoElement.setAttribute('playsinline', '');
    videoRef.current.appendChild(videoElement);

    const player = videojs(videoElement, {
      controls: true,
      autoplay: false,
      preload: 'auto',
      fluid: false,
      responsive: false,
      fill: true,
      playbackRates: [0.5, 1, 1.25, 1.5, 2],
      html5: {
        hls: {
          enableLowInitialPlaylist: true,
          smoothQualityChange: true,
          overrideNative: true,
        },
      },
    });

    playerRef.current = player;

    player.on('play', () => {
      console.log('Event: play');
      setIsPlaying(true);
      setError(null);
    });
    player.on('pause', () => setIsPlaying(false));
    player.on('ended', () => setIsPlaying(false));
    player.on('loadstart', () => {
      console.log('Event: loadstart');
      setIsLoading(true);
      setError(null);
    });
    player.on('loadedmetadata', () => console.log('Event: loadedmetadata'));
    player.on('canplay', () => {
      console.log('Event: canplay');
      setIsLoading(false);
    });
    player.on('waiting', () => setIsLoading(true));
    player.on('playing', () => {
      console.log('Event: playing');
      setIsLoading(false);
    });
    player.on('error', () => {
      const playerError = player.error();
      console.error('Player error:', playerError);
      setIsPlaying(false);
      setIsLoading(false);
      if (playerError) {
        let msg = `Playback error (code ${playerError.code})`;
        if (playerError.code === 2) msg = 'Network error: Unable to load the stream.';
        if (playerError.code === 3) msg = 'Decoding error: The stream may be corrupted.';
        if (playerError.code === 4) msg = 'Media not supported. Try a different stream.';
        setError(msg);
      }
    });

    player.ready(() => {
      console.log('Player ready, loading source...');
      loadSource(player, currentChannel);
    });

    return () => {
      if (playerRef.current) {
        console.log('Disposing player');
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [currentChannel, loadSource, setIsPlaying]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, [isFullscreen]);

  const handlePiP = async () => {
    const videoEl = playerRef.current?.el().querySelector('video');
    if (!videoEl) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await videoEl.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch (err) {
      console.error('PiP error:', err);
    }
  };

  useEffect(() => {
    const videoEl = playerRef.current?.el()?.querySelector('video');
    if (!videoEl) return;
    const onEnter = () => setIsPiP(true);
    const onLeave = () => setIsPiP(false);
    videoEl.addEventListener('enterpictureinpicture', onEnter);
    videoEl.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      videoEl.removeEventListener('enterpictureinpicture', onEnter);
      videoEl.removeEventListener('leavepictureinpicture', onLeave);
    };
  });

  const handleToggleMute = () => {
    if (!playerRef.current) return;
    const muted = !playerRef.current.muted();
    playerRef.current.muted(muted);
    setIsMuted(muted);
  };

  // Auto-hide controls after 3s of no mouse movement
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentChannel) return;
      // Don't capture keys if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          if (playerRef.current) {
            if (playerRef.current.paused()) {
              playerRef.current.play().catch(console.error);
            } else {
              playerRef.current.pause();
            }
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          handleFullscreen();
          break;
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen();
          } else if (showShortcuts) {
            setShowShortcuts(false);
          } else {
            setCurrentChannel(null);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (playerRef.current) {
            const vol = Math.min(1, playerRef.current.volume() + 0.1);
            playerRef.current.volume(vol);
            playerRef.current.muted(false);
            setIsMuted(false);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (playerRef.current) {
            const vol = Math.max(0, playerRef.current.volume() - 0.1);
            playerRef.current.volume(vol);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (playerRef.current) {
            playerRef.current.currentTime(playerRef.current.currentTime() + 10);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (playerRef.current) {
            playerRef.current.currentTime(Math.max(0, playerRef.current.currentTime() - 10));
          }
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          playNextChannel();
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          playPrevChannel();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          handleToggleMute();
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          handlePiP();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          setShowChannelList((v) => !v);
          break;
        case '?':
          e.preventDefault();
          setShowShortcuts((v) => !v);
          break;
        default:
          // Channel number zapping: digits 0-9
          if (/^[0-9]$/.test(e.key)) {
            e.preventDefault();
            const newBuf = channelNumBuffer + e.key;
            setChannelNumBuffer(newBuf);
            if (channelNumTimerRef.current) clearTimeout(channelNumTimerRef.current);
            channelNumTimerRef.current = setTimeout(() => {
              const num = parseInt(newBuf, 10) - 1;
              if (num >= 0 && num < channels.length) {
                const ch = channels[num];
                setCurrentChannel(ch);
              }
              setChannelNumBuffer('');
            }, 1000);
          }
          break;
      }
      resetControlsTimer();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentChannel, isFullscreen, showShortcuts, playNextChannel, playPrevChannel, setCurrentChannel, resetControlsTimer, channelNumBuffer, channels, handleFullscreen]);

  if (!currentChannel) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📺</div>
          <h2 className="text-2xl font-bold mb-2">No Channel Selected</h2>
          <p className="text-gray-400">Select a channel from the list to start watching</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden"
      onMouseMove={resetControlsTimer}
      onMouseEnter={() => setShowControls(true)}
    >
      {/* Video Player — fills entire container, sits behind all overlays */}
      <div ref={videoRef} className={`absolute inset-0 ${audioOnly ? 'opacity-0' : ''}`} />

      {/* Audio-only overlay */}
      {audioOnly && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <div className="text-center">
            <Music size={64} className="mx-auto mb-4 text-primary-400 animate-pulse" />
            <h2 className="text-xl font-bold mb-1">{currentChannel.name}</h2>
            {currentChannel.group && <p className="text-sm text-gray-400">{currentChannel.group}</p>}
            <p className="text-xs text-gray-500 mt-3">{t('player.audioOnly')}</p>
          </div>
        </div>
      )}

      {/* Channel number zap indicator */}
      {channelNumBuffer && (
        <div className="absolute top-20 right-6 z-30 bg-black/90 text-white text-4xl font-bold px-6 py-3 rounded-xl shadow-lg font-mono tracking-widest">
          {channelNumBuffer}
        </div>
      )}

      {/* Channel info banner — shows on channel switch */}
      <ChannelBanner channel={currentChannel} channelNumber={channels.indexOf(currentChannel) + 1} visible={channelBanner} />

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-center max-w-md p-6">
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-red-400 mb-2">{error}</p>
            <p className="text-gray-400 text-sm mb-4">
              Check the browser console (F12) for more details.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => {
                  setError(null);
                  if (playerRef.current) {
                    playerRef.current.load();
                  }
                }}
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => {
                  setError(null);
                  if (playerRef.current) {
                    playerRef.current.play().catch(console.error);
                  }
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors"
              >
                Try Play
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Controls Header — overlaid on top of video */}
      <div className={`absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3 min-w-0">
          {currentChannel.logo && (
            <img
              src={currentChannel.logo}
              alt={currentChannel.name}
              className="w-10 h-10 rounded flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">{currentChannel.name}</h2>
            {currentChannel.group && <p className="text-sm text-gray-400 truncate">{currentChannel.group}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={playPrevChannel}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Previous Channel (P)"
          >
            <SkipBack size={20} />
          </button>
          <button
            onClick={playNextChannel}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Next Channel (N)"
          >
            <SkipForward size={20} />
          </button>
          <button
            onClick={handleToggleMute}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <button
            onClick={handlePiP}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Picture-in-Picture (I)"
          >
            <PictureInPicture2 size={20} className={isPiP ? 'text-primary-400' : ''} />
          </button>
          {/* Sleep Timer */}
          <div className="relative">
            <button
              onClick={() => setShowSleepMenu((v) => !v)}
              className={`p-2 hover:bg-white/10 rounded transition-colors ${sleepTimerEnd ? 'text-yellow-400' : ''}`}
              title={sleepRemaining ? t('player.sleepIn', { time: sleepRemaining }) : t('player.sleepTimer')}
            >
              <Moon size={20} />
            </button>
            {showSleepMenu && (
              <div className="absolute right-0 top-full mt-1 bg-slate-800/95 backdrop-blur-sm rounded-lg shadow-xl border border-slate-600 py-1 min-w-[140px] z-40">
                {[
                  { label: t('player.sleepOff'), val: null },
                  { label: '15 min', val: 15 },
                  { label: '30 min', val: 30 },
                  { label: '45 min', val: 45 },
                  { label: '60 min', val: 60 },
                  { label: '90 min', val: 90 },
                  { label: '120 min', val: 120 },
                ].map(({ label, val }) => (
                  <button
                    key={label}
                    onClick={() => { setSleepTimer(val); setShowSleepMenu(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 ${
                      (val === null && !sleepTimerEnd) || (val && sleepTimerEnd) ? '' : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {sleepRemaining && (
                  <div className="px-3 py-1.5 text-xs text-yellow-400 border-t border-slate-600 mt-1">
                    {t('player.sleepIn', { time: sleepRemaining })}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Subtitles */}
          <div className="relative">
            <button
              onClick={() => setShowSubsMenu((v) => !v)}
              className="p-2 hover:bg-white/10 rounded transition-colors"
              title={t('player.subtitles')}
            >
              <Subtitles size={20} />
            </button>
            {showSubsMenu && (
              <SubtitleMenu player={playerRef.current} onClose={() => setShowSubsMenu(false)} />
            )}
          </div>
          <button
            onClick={handleCast}
            className={`p-2 rounded transition-colors hover:bg-white/10 ${
              castState === 'connected'
                ? 'text-primary-400'
                : castState === 'connecting'
                ? 'animate-pulse text-yellow-400'
                : castState === 'unavailable'
                ? 'opacity-50'
                : ''
            }`}
            title={
              castState === 'connected'
                ? `Casting to ${getCastDeviceName() || 'device'}`
                : castState === 'unavailable'
                ? 'Cast — click for details'
                : 'Cast to TV'
            }
          >
            <Cast size={20} />
          </button>
          {/* Channel List toggle */}
          <button
            onClick={() => setShowChannelList((v) => !v)}
            className={`p-2 hover:bg-white/10 rounded transition-colors ${showChannelList ? 'text-primary-400' : ''}`}
            title="Channel List (L)"
          >
            <ListVideo size={20} />
          </button>
          <button
            onClick={handleFullscreen}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <button
            onClick={() => setCurrentChannel(null)}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Close Player (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Cast status message */}
      {castMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-slate-800/95 backdrop-blur-sm border border-slate-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg max-w-md text-center animate-[fadeIn_0.2s_ease-out]">
          {castMessage}
        </div>
      )}

      {/* EPG Info Bar — overlaid at bottom of video */}
      <EPGOverlay channelName={currentChannel.name} group={currentChannel.group} tvgId={currentChannel.tvgId} tvgName={currentChannel.tvgName} />

      {/* Keyboard Shortcuts Overlay */}
      {showShortcuts && (
        <div className="absolute inset-0 z-30 bg-black/80 flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="p-1 hover:bg-slate-700 rounded">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ['Space / K', t('shortcuts.playPause')],
                ['F', t('shortcuts.fullscreen')],
                ['Esc', t('shortcuts.escape')],
                ['M', t('shortcuts.mute')],
                ['Arrow Up', t('shortcuts.volUp')],
                ['Arrow Down', t('shortcuts.volDown')],
                ['Arrow Right', t('shortcuts.seekFwd')],
                ['Arrow Left', t('shortcuts.seekBack')],
                ['N', t('shortcuts.nextCh')],
                ['P', t('shortcuts.prevCh')],
                ['I', t('shortcuts.pip')],
                ['L', 'Channel List'],
                ['0-9', t('shortcuts.channelNum')],
                ['?', t('shortcuts.showHelp')],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between py-1">
                  <kbd className="bg-slate-700 px-2 py-1 rounded text-xs font-mono min-w-[80px] text-center">{key}</kbd>
                  <span className="text-gray-300">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Channel List Panel — slides in from right */}
      <ChannelListPanel
        show={showChannelList}
        onClose={() => setShowChannelList(false)}
        currentChannelId={currentChannel.id}
      />
    </div>
  );
}

function ChannelBanner({ channel, channelNumber, visible }: { channel: Channel; channelNumber: number; visible: boolean }) {
  const epgData = useIPTVStore((s) => s.epgData);

  const currentProg = useMemo(() => {
    if (!epgData || !channel.tvgId) return null;
    const progs = epgData.programs.get(channel.tvgId);
    if (progs?.length) return getCurrentProgram(progs);
    const lower = channel.tvgId.toLowerCase();
    for (const [key, p] of epgData.programs) {
      if (key.toLowerCase() === lower && p.length) return getCurrentProgram(p);
    }
    return null;
  }, [epgData, channel.tvgId]);

  return (
    <div className={`absolute bottom-28 left-0 right-0 z-20 transition-all duration-700 ease-in-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
      <div className="px-6 py-4 flex items-center gap-4">
        <div className="text-3xl font-bold text-primary-400 font-mono min-w-[3ch] text-center">
          {channelNumber}
        </div>
        <div className="w-px h-10 bg-white/10" />
        {channel.logo && (
          <img
            src={channel.logo}
            alt=""
            className="w-12 h-12 object-contain rounded-lg flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="min-w-0">
          <h3 className="text-lg font-bold truncate">{channel.name}</h3>
          {currentProg ? (
            <p className="text-sm text-gray-400 truncate">{currentProg.title}</p>
          ) : channel.group ? (
            <p className="text-sm text-gray-500 truncate">{channel.group}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChannelListPanel({ show, onClose, currentChannelId }: { show: boolean; onClose: () => void; currentChannelId: string }) {
  const { getFilteredChannels, setCurrentChannel, addToRecent, searchQuery, setSearchQuery, groups, selectedGroup, setSelectedGroup, epgData } = useIPTVStore();
  const channels = getFilteredChannels();
  const listRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  // Reset scroll when opening or changing filter
  useEffect(() => {
    if (show) {
      setVisibleCount(50);
      listRef.current?.scrollTo(0, 0);
    }
  }, [show, selectedGroup, searchQuery]);

  const handleSelect = (ch: Channel) => {
    setCurrentChannel(ch);
    addToRecent(ch);
  };

  // Find current EPG program for a channel
  const findProgram = useCallback((ch: Channel) => {
    if (!epgData) return null;
    const ids = [ch.tvgId, ch.tvgId?.toLowerCase()].filter(Boolean) as string[];
    for (const id of ids) {
      const progs = epgData.programs.get(id);
      if (progs?.length) return getCurrentProgram(progs);
      for (const [key, p] of epgData.programs) {
        if (key.toLowerCase() === id && p.length) return getCurrentProgram(p);
      }
    }
    return null;
  }, [epgData]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      setVisibleCount((v) => Math.min(v + 50, channels.length));
    }
  }, [channels.length]);

  return (
    <>
      {/* Backdrop */}
      {show && (
        <div className="absolute inset-0 bg-black/40" style={{ zIndex: 25 }} onClick={onClose} />
      )}
      {/* Panel */}
      <div className={`absolute top-0 right-0 bottom-0 z-30 w-80 max-w-[85%] bg-slate-900/95 backdrop-blur-md border-l border-slate-700 flex flex-col transition-transform duration-300 ${show ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="p-3 border-b border-slate-700 flex items-center gap-2">
          <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded transition-colors">
            <X size={18} />
          </button>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search channels..."
            className="flex-1 bg-slate-800 text-white px-3 py-1.5 rounded-lg border border-slate-600 focus:outline-none focus:border-primary-500 text-sm"
          />
        </div>
        {/* Group filter */}
        {groups.length > 1 && (
          <div className="px-3 py-2 border-b border-slate-700">
            <select
              value={selectedGroup || ''}
              onChange={(e) => setSelectedGroup(e.target.value || null)}
              className="w-full bg-slate-800 text-white text-xs px-2 py-1.5 rounded border border-slate-600 focus:outline-none focus:border-primary-500"
            >
              <option value="">All Groups ({channels.length})</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        )}
        {/* Channel list */}
        <div ref={listRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
          {channels.slice(0, visibleCount).map((ch, idx) => {
            const prog = findProgram(ch);
            const isCurrent = ch.id === currentChannelId;
            return (
              <div
                key={ch.id}
                onClick={() => handleSelect(ch)}
                className={`px-3 py-2.5 cursor-pointer border-b border-slate-800 transition-colors ${
                  isCurrent ? 'bg-primary-600/20 border-l-2 border-l-primary-500' : 'hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xs text-gray-500 w-6 text-right flex-shrink-0">{idx + 1}</span>
                  {ch.logo ? (
                    <img src={ch.logo} alt="" className="w-8 h-6 object-contain rounded flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-8 h-6 bg-slate-700 rounded flex items-center justify-center text-[10px] flex-shrink-0">📺</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${isCurrent ? 'text-primary-400 font-semibold' : 'font-medium'}`}>{ch.name}</p>
                    {prog ? (
                      <p className="text-[11px] text-gray-500 truncate">{prog.title}</p>
                    ) : ch.group ? (
                      <p className="text-[11px] text-gray-600 truncate">{ch.group}</p>
                    ) : null}
                  </div>
                  {isCurrent && (
                    <div className="w-2 h-2 bg-primary-400 rounded-full animate-pulse flex-shrink-0" />
                  )}
                </div>
              </div>
            );
          })}
          {visibleCount < channels.length && (
            <div className="p-3 text-center text-xs text-gray-500">
              Showing {visibleCount} of {channels.length}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SubtitleMenu({ player, onClose }: { player: videojs.Player | null; onClose: () => void }) {
  if (!player) return null;

  const tracks: { label: string; language: string; mode: string; index: number }[] = [];
  const textTracks = player.textTracks();
  for (let i = 0; i < textTracks.length; i++) {
    const tr = textTracks[i];
    if (tr.kind === 'subtitles' || tr.kind === 'captions') {
      tracks.push({ label: tr.label || `${t('player.subsTrack', { n: String(i + 1) })}`, language: tr.language || '', mode: tr.mode || 'disabled', index: i });
    }
  }

  const setTrack = (idx: number | null) => {
    for (let i = 0; i < textTracks.length; i++) {
      const tr = textTracks[i];
      if (tr.kind === 'subtitles' || tr.kind === 'captions') {
        tr.mode = (idx === i) ? 'showing' : 'disabled';
      }
    }
    onClose();
  };

  return (
    <div className="absolute right-0 top-full mt-1 bg-slate-800/95 backdrop-blur-sm rounded-lg shadow-xl border border-slate-600 py-1 min-w-[160px] z-40">
      <button onClick={() => setTrack(null)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-white/10">
        {t('player.subsOff')}
      </button>
      {tracks.length === 0 ? (
        <div className="px-3 py-1.5 text-xs text-gray-500">No subtitle tracks</div>
      ) : (
        tracks.map((tr) => (
          <button
            key={tr.index}
            onClick={() => setTrack(tr.index)}
            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 ${tr.mode === 'showing' ? 'text-primary-400' : ''}`}
          >
            {tr.label}{tr.language ? ` (${tr.language})` : ''}
          </button>
        ))
      )}
    </div>
  );
}

function EPGOverlay({ channelName, tvgId, tvgName }: { channelName: string; group?: string; tvgId?: string; tvgName?: string }) {
  const epgData = useIPTVStore((s) => s.epgData);
  const epgLoading = useIPTVStore((s) => s.epgLoading);
  const [, setTick] = useState(0);
  const [showBar, setShowBar] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Show bar for 8 seconds on channel change, then hide
  useEffect(() => {
    setShowBar(true);
    const timer = setTimeout(() => setShowBar(false), 8000);
    return () => clearTimeout(timer);
  }, [channelName, tvgId]);

  const { currentProg, nextProg, matchMethod } = useMemo(() => {
    if (!epgData) return { currentProg: undefined, nextProg: undefined, matchMethod: 'no-epg' as const };

    type MatchMethod = 'exact-id' | 'case-id' | 'name' | 'none';

    // 1. Exact tvgId
    if (tvgId) {
      const exact = epgData.programs.get(tvgId);
      if (exact && exact.length > 0) {
        return { currentProg: getCurrentProgram(exact), nextProg: getNextProgram(exact), matchMethod: 'exact-id' as MatchMethod };
      }
    }

    // 2. Case-insensitive tvgId
    if (tvgId) {
      const lower = tvgId.toLowerCase();
      for (const [key, progs] of epgData.programs) {
        if (key.toLowerCase() === lower && progs.length > 0) {
          return { currentProg: getCurrentProgram(progs), nextProg: getNextProgram(progs), matchMethod: 'case-id' as MatchMethod };
        }
      }
    }

    // 3. Fuzzy name match
    const namesToTry = [channelName, tvgName].filter(Boolean) as string[];
    for (const name of namesToTry) {
      const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!normalized) continue;
      for (const [epgId, epgCh] of epgData.channels) {
        const epgNorm = epgCh.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (epgNorm === normalized || epgNorm.includes(normalized) || normalized.includes(epgNorm)) {
          const progs = epgData.programs.get(epgId);
          if (progs && progs.length > 0) {
            return { currentProg: getCurrentProgram(progs), nextProg: getNextProgram(progs), matchMethod: 'name' as MatchMethod };
          }
        }
      }
    }

    return { currentProg: undefined, nextProg: undefined, matchMethod: 'none' as MatchMethod };
  }, [epgData, tvgId, tvgName, channelName]);

  // Log for debugging
  useEffect(() => {
    console.log('[EPG Debug]', {
      channelName,
      tvgId: tvgId || '(none)',
      tvgName: tvgName || '(none)',
      epgLoaded: !!epgData,
      epgChannels: epgData?.channels.size ?? 0,
      matchMethod,
      currentProgram: currentProg?.title || '(none)',
    });
  }, [channelName, tvgId, tvgName, epgData, matchMethod, currentProg]);

  // Nothing to show if no EPG data at all
  if (!epgData && !epgLoading) return null;

  return (
    <div
      className={`absolute bottom-16 left-0 right-0 z-30 px-4 transition-all duration-500 ${showBar ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
      onMouseEnter={() => setShowBar(true)}
    >
      <div className="bg-black/85 backdrop-blur-sm rounded-lg px-4 py-3 max-w-2xl">
        {epgLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            <span className="text-xs text-yellow-400">Loading EPG data...</span>
          </div>
        ) : currentProg ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] bg-green-600/40 text-green-300 px-1.5 py-0.5 rounded font-semibold">NOW</span>
              <p className="text-sm text-white font-medium truncate">{currentProg.title}</p>
              <span className="text-xs text-gray-400 flex-shrink-0 ml-auto">
                {formatTime(currentProg.start)} - {formatTime(currentProg.stop)}
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1 mb-1">
              <div
                className="bg-primary-500 h-1 rounded-full transition-all"
                style={{ width: `${getProgramProgress(currentProg)}%` }}
              />
            </div>
            {currentProg.description && (
              <p className="text-[11px] text-gray-400 truncate">{currentProg.description}</p>
            )}
            {nextProg && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] bg-slate-600/60 text-gray-400 px-1.5 py-0.5 rounded">NEXT</span>
                <p className="text-xs text-gray-400 truncate">{nextProg.title}</p>
                <span className="text-[10px] text-gray-500 flex-shrink-0 ml-auto">{formatTime(nextProg.start)}</span>
              </div>
            )}
          </div>
        ) : matchMethod === 'none' ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-yellow-500 rounded-full" />
            <span className="text-xs text-gray-400">
              No EPG match for "{channelName}"{tvgId ? ` (tvg-id: ${tvgId})` : ' — channel has no tvg-id'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-gray-500 rounded-full" />
            <span className="text-xs text-gray-500">No current program scheduled</span>
          </div>
        )}
      </div>
    </div>
  );
}
