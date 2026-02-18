import { useState, useEffect, useRef, useCallback } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { useIPTVStore } from '../store/iptvStore';
import { Channel } from '../utils/m3uParser';
import { X, Volume2, VolumeX, Maximize2, Grid2x2, Plus } from 'lucide-react';

interface MultiViewProps {
  channels: Channel[];
  onExit: () => void;
}

type Layout = '2x1' | '2x2';

export default function MultiView({ channels: initialChannels, onExit }: MultiViewProps) {
  const { channels: allChannels, setCurrentChannel, addToRecent } = useIPTVStore();
  const [viewChannels, setViewChannels] = useState<(Channel | null)[]>(() => {
    const slots: (Channel | null)[] = [...initialChannels];
    while (slots.length < 4) slots.push(null);
    return slots.slice(0, 4);
  });
  const [activeAudio, setActiveAudio] = useState(0);
  const [layout, setLayout] = useState<Layout>(initialChannels.length <= 2 ? '2x1' : '2x2');
  const [showPicker, setShowPicker] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const tileCount = layout === '2x1' ? 2 : 4;
  const activeTiles = viewChannels.slice(0, tileCount);

  const handleGoFullscreen = (ch: Channel) => {
    setCurrentChannel(ch);
    addToRecent(ch);
    onExit();
  };

  const handleSetChannel = (slotIndex: number, ch: Channel) => {
    const next = [...viewChannels];
    next[slotIndex] = ch;
    setViewChannels(next);
    setShowPicker(null);
    setPickerSearch('');
  };

  const filteredPicker = pickerSearch
    ? allChannels.filter((c) => c.name.toLowerCase().includes(pickerSearch.toLowerCase()))
    : allChannels;

  return (
    <div className="w-full h-full bg-black flex flex-col">
      {/* Controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Grid2x2 size={18} className="text-primary-400" />
          <span className="text-sm font-medium">Multi-View</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLayout('2x1')}
            className={`px-2 py-1 text-xs rounded ${layout === '2x1' ? 'bg-primary-600' : 'bg-slate-700 hover:bg-slate-600'}`}
          >
            1x2
          </button>
          <button
            onClick={() => setLayout('2x2')}
            className={`px-2 py-1 text-xs rounded ${layout === '2x2' ? 'bg-primary-600' : 'bg-slate-700 hover:bg-slate-600'}`}
          >
            2x2
          </button>
          <button onClick={onExit} className="p-1 hover:bg-slate-700 rounded">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className={`flex-1 grid gap-1 ${layout === '2x1' ? 'grid-cols-2 grid-rows-1' : 'grid-cols-2 grid-rows-2'}`}>
        {activeTiles.map((ch, i) => (
          <div key={i} className="relative bg-slate-900 overflow-hidden">
            {ch ? (
              <MultiViewTile
                channel={ch}
                isMuted={activeAudio !== i}
                onClickAudio={() => setActiveAudio(i)}
                onDoubleClick={() => handleGoFullscreen(ch)}
                onRemove={() => {
                  const next = [...viewChannels];
                  next[i] = null;
                  setViewChannels(next);
                }}
              />
            ) : (
              <button
                onClick={() => setShowPicker(i)}
                className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-gray-300 hover:bg-slate-800 transition-colors"
              >
                <Plus size={32} />
                <span className="text-sm">Add Channel</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Channel Picker */}
      {showPicker !== null && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
          <div className="bg-slate-800 rounded-lg w-96 max-h-[70vh] flex flex-col shadow-2xl">
            <div className="p-3 border-b border-slate-700 flex items-center justify-between">
              <span className="text-sm font-medium">Select Channel</span>
              <button onClick={() => { setShowPicker(null); setPickerSearch(''); }} className="p-1 hover:bg-slate-700 rounded">
                <X size={16} />
              </button>
            </div>
            <div className="p-3">
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search channels..."
                className="w-full bg-slate-700 text-white px-3 py-2 rounded border border-slate-600 focus:outline-none focus:border-primary-500 text-sm"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredPicker.slice(0, 100).map((ch) => (
                <div
                  key={ch.id}
                  onClick={() => handleSetChannel(showPicker, ch)}
                  className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-700 transition-colors"
                >
                  {ch.logo ? (
                    <img src={ch.logo} alt="" className="w-8 h-6 object-contain rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-8 h-6 bg-slate-600 rounded flex items-center justify-center text-[10px]">{ch.name.charAt(0)}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{ch.name}</p>
                    {ch.group && <p className="text-xs text-gray-500 truncate">{ch.group}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MultiViewTile({
  channel, isMuted, onClickAudio, onDoubleClick, onRemove,
}: {
  channel: Channel;
  isMuted: boolean;
  onClickAudio: () => void;
  onDoubleClick: () => void;
  onRemove: () => void;
}) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<videojs.Player | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);

  const loadSource = useCallback((player: videojs.Player, ch: Channel) => {
    const url = ch.url.toLowerCase();
    const isHLS = url.includes('.m3u8') || url.includes('/hls') || url.includes('playlist');
    const type = isHLS ? 'application/x-mpegURL' : 'video/mp4';
    player.src({ src: ch.url, type });
    player.play().catch(() => {
      player.one('canplay', () => player.play().catch(() => {}));
    });
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;

    const el = document.createElement('video');
    el.classList.add('video-js');
    el.setAttribute('playsinline', '');
    videoRef.current.appendChild(el);

    const player = videojs(el, {
      controls: false,
      autoplay: false,
      preload: 'auto',
      fill: true,
      html5: {
        vhs: { enableLowInitialPlaylist: true, overrideNative: true },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
    });

    playerRef.current = player;
    player.ready(() => loadSource(player, channel));

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [channel, loadSource]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted(isMuted);
    }
  }, [isMuted]);

  return (
    <div
      className="relative w-full h-full"
      onMouseEnter={() => setShowOverlay(true)}
      onMouseLeave={() => setShowOverlay(false)}
      onDoubleClick={onDoubleClick}
    >
      <div ref={videoRef} className="w-full h-full [&_.vjs-tech]:object-cover" />

      {/* Channel label */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
        <p className="text-sm font-medium truncate">{channel.name}</p>
      </div>

      {/* Audio indicator */}
      {!isMuted && (
        <div className="absolute top-2 left-2 bg-primary-600 rounded-full p-1">
          <Volume2 size={12} />
        </div>
      )}

      {/* Hover overlay */}
      {showOverlay && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onClickAudio(); }}
            className="p-1.5 bg-black/70 rounded hover:bg-black/90"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
            className="p-1.5 bg-black/70 rounded hover:bg-black/90"
            title="Fullscreen"
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1.5 bg-black/70 rounded hover:bg-red-600/80"
            title="Remove"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
