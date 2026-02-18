export type CastState = 'unavailable' | 'available' | 'connecting' | 'connected';

export interface CastManagerCallbacks {
  onStateChange: (state: CastState) => void;
  onError: (error: string) => void;
}

let castSession: cast.framework.CastSession | null = null;
let castContext: cast.framework.CastContext | null = null;
let callbacks: CastManagerCallbacks | null = null;
let initialized = false;

export function initCast(cbs: CastManagerCallbacks) {
  callbacks = cbs;

  if (initialized) return;

  // The Cast SDK calls this global callback when it loads
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any)['__onGCastApiAvailable'] = (isAvailable: boolean) => {
    console.log('[Cast] SDK callback fired, available:', isAvailable);
    if (!isAvailable) {
      callbacks?.onStateChange('unavailable');
      return;
    }
    setupCast();
  };

  // SDK might already be loaded before React mounts
  if (window.cast?.framework) {
    console.log('[Cast] SDK already loaded, initializing');
    setupCast();
  } else {
    // Retry a few times in case the async script is still loading
    let retries = 0;
    const poll = setInterval(() => {
      retries++;
      if (window.cast?.framework) {
        clearInterval(poll);
        console.log('[Cast] SDK detected on retry', retries);
        setupCast();
      } else if (retries >= 10) {
        clearInterval(poll);
        console.log('[Cast] SDK not detected after retries — Chrome with Cast support required');
      }
    }, 1000);
  }
}

function setupCast() {
  if (initialized) return;
  initialized = true;

  try {
    castContext = cast.framework.CastContext.getInstance();
    castContext.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });

    castContext.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (event: cast.framework.SessionStateEventData) => {
        switch (event.sessionState) {
          case cast.framework.SessionState.SESSION_STARTED:
          case cast.framework.SessionState.SESSION_RESUMED:
            castSession = castContext!.getCurrentSession();
            callbacks?.onStateChange('connected');
            break;
          case cast.framework.SessionState.SESSION_ENDED:
            castSession = null;
            callbacks?.onStateChange('available');
            break;
          case cast.framework.SessionState.SESSION_STARTING:
            callbacks?.onStateChange('connecting');
            break;
          default:
            break;
        }
      }
    );

    callbacks?.onStateChange('available');
    console.log('[Cast] Initialized successfully');
  } catch (e) {
    console.error('[Cast] Init error:', e);
    callbacks?.onStateChange('unavailable');
  }
}

const CAST_IGNORABLE_ERRORS = ['cancel', 'session_error', 'timeout', 'receiver_unavailable'];

export function requestCastSession() {
  if (!castContext) {
    const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg|OPR/.test(navigator.userAgent);
    if (!isChrome) {
      callbacks?.onError('Chromecast requires Google Chrome browser.');
    } else {
      callbacks?.onError('No Chromecast found. Make sure your Chromecast is on the same Wi-Fi network and try refreshing the page.');
    }
    return;
  }
  castContext.requestSession().catch((err: unknown) => {
    if (!err) return;

    // Extract error code/message from whatever format the SDK gives us
    let code = '';
    if (typeof err === 'string') {
      code = err;
    } else if (typeof err === 'object' && err !== null) {
      code = (err as { code?: string }).code
        || (err as { message?: string }).message
        || '';
    }
    code = code.toLowerCase();

    // These are all "no device found / user cancelled" — not real errors
    if (!code || CAST_IGNORABLE_ERRORS.includes(code)) {
      console.log('[Cast] Session not started:', code || 'cancelled');
      return;
    }

    callbacks?.onError(`Cast error: ${code}`);
  });
}

export function stopCasting() {
  if (castSession) {
    castSession.endSession(true);
    castSession = null;
  }
}

export function castMedia(url: string, title: string, contentType?: string) {
  if (!castSession) {
    callbacks?.onError('No active cast session');
    return;
  }

  const mediaInfo = new chrome.cast.media.MediaInfo(url, contentType || 'application/x-mpegURL');
  mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
  mediaInfo.metadata.title = title;

  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  request.autoplay = true;

  castSession.loadMedia(request).then(
    () => console.log('[Cast] Media loaded successfully'),
    (err: chrome.cast.Error) => {
      console.error('[Cast] Media load error:', err);
      callbacks?.onError(`Failed to cast: ${err.description || err.code}`);
    }
  );
}

export function getCastState(): CastState {
  if (!castContext) return 'unavailable';
  const session = castContext.getCurrentSession();
  if (session) return 'connected';
  return 'available';
}

export function getCastDeviceName(): string | null {
  if (!castSession) return null;
  return castSession.getCastDevice().friendlyName || null;
}
