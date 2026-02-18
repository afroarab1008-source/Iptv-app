export interface Recording {
  id: string;
  channelName: string;
  channelLogo?: string;
  startedAt: number;
  duration: number;
  blobUrl: string;
  size: number;
}

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingStart = 0;
let currentRecording: { channelName: string; channelLogo?: string } | null = null;

export function isRecordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof (HTMLVideoElement.prototype as unknown as Record<string, unknown>).captureStream === 'function';
}

export function startRecording(
  videoElement: HTMLVideoElement,
  channelName: string,
  channelLogo?: string
): boolean {
  if (!isRecordingSupported()) return false;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') return false;

  try {
    // captureStream only works on same-origin or CORS-enabled media
    const stream = (videoElement as unknown as { captureStream: () => MediaStream }).captureStream();
    recordedChunks = [];
    currentRecording = { channelName, channelLogo };

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.start(1000);
    recordingStart = Date.now();
    return true;
  } catch (err) {
    console.error('[Recorder] Failed to start:', err);
    return false;
  }
}

export function stopRecording(): Recording | null {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return null;

  return new Promise<Recording | null>((resolve) => {
    mediaRecorder!.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const blobUrl = URL.createObjectURL(blob);
      const duration = Math.floor((Date.now() - recordingStart) / 1000);

      const recording: Recording = {
        id: `rec-${Date.now()}`,
        channelName: currentRecording?.channelName || 'Unknown',
        channelLogo: currentRecording?.channelLogo,
        startedAt: recordingStart,
        duration,
        blobUrl,
        size: blob.size,
      };

      recordedChunks = [];
      currentRecording = null;
      mediaRecorder = null;
      resolve(recording);
    };

    mediaRecorder!.stop();
  }) as unknown as Recording | null;
}

export async function stopRecordingAsync(): Promise<Recording | null> {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return null;

  return new Promise<Recording>((resolve) => {
    mediaRecorder!.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const blobUrl = URL.createObjectURL(blob);
      const duration = Math.floor((Date.now() - recordingStart) / 1000);

      const recording: Recording = {
        id: `rec-${Date.now()}`,
        channelName: currentRecording?.channelName || 'Unknown',
        channelLogo: currentRecording?.channelLogo,
        startedAt: recordingStart,
        duration,
        blobUrl,
        size: blob.size,
      };

      recordedChunks = [];
      currentRecording = null;
      mediaRecorder = null;
      resolve(recording);
    };

    mediaRecorder!.stop();
  });
}

export function getRecordingState(): 'inactive' | 'recording' | 'paused' {
  if (!mediaRecorder) return 'inactive';
  return mediaRecorder.state;
}

export function downloadRecording(recording: Recording) {
  const a = document.createElement('a');
  a.href = recording.blobUrl;
  a.download = `${recording.channelName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date(recording.startedAt).toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
  a.click();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
