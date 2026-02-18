import { useEffect, useRef } from 'react';

const CHANNEL_NAME = 'iptv-remote';

export interface RemoteCommand {
  type: 'channelUp' | 'channelDown' | 'channelNumber' | 'volumeUp' | 'volumeDown' | 'mute' | 'stop';
  value?: number;
  timestamp: number;
}

export function useRemoteCommands(
  onCommand: (cmd: RemoteCommand) => void
) {
  const callbackRef = useRef(onCommand);
  callbackRef.current = onCommand;

  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (e) => callbackRef.current(e.data);
    } catch { /* BroadcastChannel not supported */ }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'iptv-remote-cmd' && e.newValue) {
        try {
          callbackRef.current(JSON.parse(e.newValue));
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      bc?.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);
}
