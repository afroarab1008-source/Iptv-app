import { useIPTVStore } from '../store/iptvStore';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Channel } from '../utils/m3uParser';
import { EPGProgram, formatTime } from '../utils/epgParser';
import { Tv, ChevronLeft, ChevronRight } from 'lucide-react';

const SLOT_WIDTH = 180;
const ROW_HEIGHT = 64;
const TIME_HEADER = 40;
const CHANNEL_COL = 160;
const HOURS_VISIBLE = 4;
const VISIBLE_ROWS = 25;

function getTimeSlots(startHour: number): Date[] {
  const slots: Date[] = [];
  const base = new Date();
  base.setMinutes(0, 0, 0);
  base.setHours(startHour);
  for (let i = 0; i < HOURS_VISIBLE * 2; i++) {
    const s = new Date(base);
    s.setMinutes(s.getMinutes() + i * 30);
    slots.push(s);
  }
  return slots;
}

function formatSlotTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function EPGGrid() {
  const { channels, epgData, setCurrentChannel, addToRecent } = useIPTVStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [startHour, setStartHour] = useState(() => {
    const now = new Date();
    return now.getHours() - 1;
  });
  const [rowOffset, setRowOffset] = useState(0);
  const [, setTick] = useState(0);

  // Update current time indicator every minute
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const timeSlots = useMemo(() => getTimeSlots(startHour), [startHour]);
  const gridStart = timeSlots[0].getTime();
  const gridEnd = timeSlots[timeSlots.length - 1].getTime() + 30 * 60000;
  const totalWidth = HOURS_VISIBLE * 2 * SLOT_WIDTH;

  const visibleChannels = channels.slice(rowOffset, rowOffset + VISIBLE_ROWS);
  const hasMoreUp = rowOffset > 0;
  const hasMoreDown = rowOffset + VISIBLE_ROWS < channels.length;

  const findPrograms = useCallback((channel: Channel): EPGProgram[] => {
    if (!epgData) return [];
    const tryKeys = [channel.tvgId];
    if (channel.tvgId) {
      for (const [key] of epgData.programs) {
        if (key.toLowerCase() === channel.tvgId!.toLowerCase() && key !== channel.tvgId) {
          tryKeys.push(key);
        }
      }
    }
    // Fuzzy name match
    const norm = channel.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [epgId, epgCh] of epgData.channels) {
      const epgNorm = epgCh.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (epgNorm === norm || (norm.length > 3 && (epgNorm.includes(norm) || norm.includes(epgNorm)))) {
        tryKeys.push(epgId);
      }
    }

    for (const key of tryKeys) {
      if (!key) continue;
      const progs = epgData.programs.get(key);
      if (progs && progs.length > 0) {
        return progs.filter((p) => {
          const ps = p.start.getTime();
          const pe = p.stop.getTime();
          return pe > gridStart && ps < gridEnd;
        });
      }
    }
    return [];
  }, [epgData, gridStart, gridEnd]);

  const handleChannelClick = (channel: Channel) => {
    setCurrentChannel(channel);
    addToRecent(channel);
  };

  // Current time position
  const now = Date.now();
  const nowOffset = now >= gridStart && now <= gridEnd
    ? ((now - gridStart) / (gridEnd - gridStart)) * totalWidth
    : -1;

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current && nowOffset > 0) {
      scrollRef.current.scrollLeft = Math.max(0, nowOffset - 300);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!epgData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <Tv size={48} className="mx-auto mb-4 opacity-50" />
          <p>Load EPG data to view the program guide</p>
          <p className="text-sm mt-2 text-gray-500">Go to Sidebar &gt; EPG to add a source</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 overflow-hidden">
      {/* Navigation */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <button
          onClick={() => setStartHour((h) => h - 2)}
          className="p-2 hover:bg-slate-700 rounded"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-sm font-medium text-gray-300">
          {formatSlotTime(timeSlots[0])} — {formatSlotTime(new Date(gridEnd))}
          <span className="text-gray-500 ml-2">({channels.length} channels)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const now = new Date();
              setStartHour(now.getHours() - 1);
            }}
            className="px-3 py-1 text-xs bg-primary-600 hover:bg-primary-500 rounded"
          >
            Now
          </button>
          <button
            onClick={() => setStartHour((h) => h + 2)}
            className="p-2 hover:bg-slate-700 rounded"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 flex overflow-hidden">
        {/* Channel column */}
        <div className="flex-shrink-0 border-r border-slate-700" style={{ width: CHANNEL_COL }}>
          <div className="bg-slate-800 border-b border-slate-700" style={{ height: TIME_HEADER }}>
            {hasMoreUp && (
              <button
                onClick={() => setRowOffset(Math.max(0, rowOffset - VISIBLE_ROWS))}
                className="w-full h-full text-xs text-gray-400 hover:text-white hover:bg-slate-700"
              >
                ▲ More
              </button>
            )}
          </div>
          {visibleChannels.map((ch) => (
            <div
              key={ch.id}
              onClick={() => handleChannelClick(ch)}
              className="flex items-center gap-2 px-2 border-b border-slate-800 cursor-pointer hover:bg-slate-700 transition-colors"
              style={{ height: ROW_HEIGHT }}
              title={ch.name}
            >
              {ch.logo ? (
                <img
                  src={ch.logo}
                  alt=""
                  className="w-8 h-6 object-contain rounded flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-8 h-6 bg-slate-700 rounded flex items-center justify-center text-[10px] text-gray-500 flex-shrink-0">
                  {ch.name.charAt(0)}
                </div>
              )}
              <span className="text-xs truncate">{ch.name}</span>
            </div>
          ))}
          {hasMoreDown && (
            <button
              onClick={() => setRowOffset(Math.min(channels.length - VISIBLE_ROWS, rowOffset + VISIBLE_ROWS))}
              className="w-full py-2 text-xs text-gray-400 hover:text-white hover:bg-slate-700"
            >
              ▼ More ({channels.length - rowOffset - VISIBLE_ROWS} remaining)
            </button>
          )}
        </div>

        {/* Timeline + programs */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: totalWidth, position: 'relative' }}>
            {/* Time header */}
            <div className="flex bg-slate-800 border-b border-slate-700 sticky top-0 z-10" style={{ height: TIME_HEADER }}>
              {timeSlots.map((slot, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 text-xs text-gray-400 flex items-center pl-2 border-l border-slate-700"
                  style={{ width: SLOT_WIDTH }}
                >
                  {formatSlotTime(slot)}
                </div>
              ))}
            </div>

            {/* Program rows */}
            {visibleChannels.map((ch) => {
              const progs = findPrograms(ch);
              return (
                <div key={ch.id} className="relative border-b border-slate-800/50" style={{ height: ROW_HEIGHT }}>
                  {progs.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-600">
                      No EPG data
                    </div>
                  ) : (
                    progs.map((prog, i) => {
                      const pStart = Math.max(prog.start.getTime(), gridStart);
                      const pEnd = Math.min(prog.stop.getTime(), gridEnd);
                      const left = ((pStart - gridStart) / (gridEnd - gridStart)) * totalWidth;
                      const width = ((pEnd - pStart) / (gridEnd - gridStart)) * totalWidth;
                      const isCurrent = now >= prog.start.getTime() && now < prog.stop.getTime();

                      return (
                        <div
                          key={`${prog.title}-${i}`}
                          onClick={() => handleChannelClick(ch)}
                          className={`absolute top-1 bottom-1 rounded px-2 flex items-center cursor-pointer overflow-hidden transition-colors ${
                            isCurrent
                              ? 'bg-primary-600/30 border border-primary-500/50 hover:bg-primary-600/40'
                              : 'bg-slate-800 border border-slate-700 hover:bg-slate-700'
                          }`}
                          style={{ left, width: Math.max(width, 30) }}
                          title={`${prog.title}\n${formatTime(prog.start)} - ${formatTime(prog.stop)}`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{prog.title}</p>
                            <p className="text-[10px] text-gray-500 truncate">
                              {formatTime(prog.start)} - {formatTime(prog.stop)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}

            {/* Current time indicator */}
            {nowOffset > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                style={{ left: nowOffset }}
              >
                <div className="absolute -top-0 -left-1.5 w-3 h-3 bg-red-500 rounded-full" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
