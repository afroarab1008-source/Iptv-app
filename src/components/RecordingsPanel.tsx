import { useState } from 'react';
import { Recording, downloadRecording, formatFileSize } from '../utils/recorder';
import { Video, Download, Trash2, Film } from 'lucide-react';

interface RecordingsPanelProps {
  recordings: Recording[];
  onDelete: (id: string) => void;
}

export default function RecordingsPanel({ recordings, onDelete }: RecordingsPanelProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);

  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (recordings.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        <Film size={48} className="mx-auto mb-4 opacity-50" />
        <p>No recordings yet</p>
        <p className="text-sm mt-2 text-gray-500">Click the record button while watching to save streams</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs uppercase text-gray-500 font-semibold tracking-wider mb-2">
        Recordings ({recordings.length})
      </h4>
      {recordings.map((rec) => (
        <div key={rec.id} className="bg-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-3">
            {rec.channelLogo ? (
              <img src={rec.channelLogo} alt="" className="w-10 h-7 object-contain rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w-10 h-7 bg-slate-600 rounded flex items-center justify-center">
                <Video size={14} className="text-gray-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate text-sm">{rec.channelName}</h3>
              <p className="text-xs text-gray-400">
                {formatDate(rec.startedAt)} &middot; {formatDuration(rec.duration)} &middot; {formatFileSize(rec.size)}
              </p>
            </div>
          </div>

          {/* Playback */}
          {playingId === rec.id && (
            <div className="mt-2">
              <video src={rec.blobUrl} controls className="w-full rounded" autoPlay />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setPlayingId(playingId === rec.id ? null : rec.id)}
              className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-1.5 rounded text-xs flex items-center justify-center gap-1.5"
            >
              <Video size={12} />
              {playingId === rec.id ? 'Hide' : 'Play'}
            </button>
            <button
              onClick={() => downloadRecording(rec)}
              className="flex-1 bg-slate-600 hover:bg-slate-500 text-white py-1.5 rounded text-xs flex items-center justify-center gap-1.5"
            >
              <Download size={12} />
              Save
            </button>
            <button
              onClick={() => {
                URL.revokeObjectURL(rec.blobUrl);
                onDelete(rec.id);
              }}
              className="p-1.5 bg-slate-600 hover:bg-red-600/50 rounded"
              title="Delete"
            >
              <Trash2 size={12} className="text-gray-400 hover:text-red-400" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
