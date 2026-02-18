import { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, Volume2, VolumeX, Tv, Power, Hash } from 'lucide-react';

const CHANNEL_NAME = 'iptv-remote';

function sendCommand(cmd: { type: string; value?: number }) {
  try {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.postMessage({ ...cmd, timestamp: Date.now() });
    bc.close();
  } catch {
    localStorage.setItem('iptv-remote-cmd', JSON.stringify({ ...cmd, timestamp: Date.now() }));
  }
}

export default function RemoteControl() {
  const [lastAction, setLastAction] = useState<string>('');
  const [numBuffer, setNumBuffer] = useState('');
  const numTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (msg: string) => {
    setLastAction(msg);
    setTimeout(() => setLastAction(''), 1000);
  };

  const handleNumber = (n: number) => {
    const next = numBuffer + n;
    setNumBuffer(next);
    if (numTimerRef.current) clearTimeout(numTimerRef.current);
    numTimerRef.current = setTimeout(() => {
      sendCommand({ type: 'channelNumber', value: parseInt(next, 10) });
      flash(`CH ${next}`);
      setNumBuffer('');
    }, 1200);
  };

  useEffect(() => {
    return () => {
      if (numTimerRef.current) clearTimeout(numTimerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 select-none">
      {/* Header */}
      <div className="text-center mb-8">
        <Tv size={40} className="mx-auto mb-2 text-primary-400" />
        <h1 className="text-xl font-bold">IPTV Remote</h1>
        <p className="text-xs text-gray-500 mt-1">Control your IPTV app from this device</p>
      </div>

      {/* Action feedback */}
      <div className="h-8 mb-4 flex items-center justify-center">
        {lastAction && (
          <div className="bg-primary-600/30 text-primary-300 px-4 py-1 rounded-full text-sm animate-pulse">
            {lastAction}
          </div>
        )}
        {numBuffer && !lastAction && (
          <div className="text-3xl font-mono text-primary-400">{numBuffer}</div>
        )}
      </div>

      {/* Channel controls */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <button
          onClick={() => { sendCommand({ type: 'channelUp' }); flash('CH ▲'); }}
          className="w-20 h-20 rounded-full bg-slate-800 hover:bg-slate-700 active:bg-primary-600 flex items-center justify-center shadow-lg transition-all active:scale-95"
        >
          <ChevronUp size={32} />
        </button>
        <div className="text-xs text-gray-500 uppercase tracking-wider">Channel</div>
        <button
          onClick={() => { sendCommand({ type: 'channelDown' }); flash('CH ▼'); }}
          className="w-20 h-20 rounded-full bg-slate-800 hover:bg-slate-700 active:bg-primary-600 flex items-center justify-center shadow-lg transition-all active:scale-95"
        >
          <ChevronDown size={32} />
        </button>
      </div>

      {/* Volume controls */}
      <div className="flex items-center gap-6 mb-8">
        <button
          onClick={() => { sendCommand({ type: 'volumeDown' }); flash('VOL −'); }}
          className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 active:bg-primary-600 flex items-center justify-center shadow-lg transition-all active:scale-95"
        >
          <VolumeX size={20} />
        </button>
        <button
          onClick={() => { sendCommand({ type: 'mute' }); flash('MUTE'); }}
          className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 active:bg-red-600 flex items-center justify-center shadow-lg transition-all active:scale-95"
        >
          <Volume2 size={20} />
        </button>
        <button
          onClick={() => { sendCommand({ type: 'volumeUp' }); flash('VOL +'); }}
          className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 active:bg-primary-600 flex items-center justify-center shadow-lg transition-all active:scale-95"
        >
          <span className="text-lg font-bold">+</span>
        </button>
      </div>

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            onClick={() => handleNumber(n)}
            className="w-16 h-16 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-primary-600 flex items-center justify-center text-xl font-medium shadow transition-all active:scale-95"
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => { sendCommand({ type: 'stop' }); flash('STOP'); }}
          className="w-16 h-16 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-red-600 flex items-center justify-center shadow transition-all active:scale-95"
        >
          <Power size={20} />
        </button>
        <button
          onClick={() => handleNumber(0)}
          className="w-16 h-16 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-primary-600 flex items-center justify-center text-xl font-medium shadow transition-all active:scale-95"
        >
          0
        </button>
        <button
          onClick={() => {
            if (numBuffer) {
              sendCommand({ type: 'channelNumber', value: parseInt(numBuffer, 10) });
              flash(`CH ${numBuffer}`);
              setNumBuffer('');
              if (numTimerRef.current) clearTimeout(numTimerRef.current);
            }
          }}
          className="w-16 h-16 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-primary-600 flex items-center justify-center shadow transition-all active:scale-95"
        >
          <Hash size={20} />
        </button>
      </div>

      <p className="text-[10px] text-gray-600 text-center">
        Open this page on your phone while the IPTV app runs on your TV/desktop
      </p>
    </div>
  );
}
