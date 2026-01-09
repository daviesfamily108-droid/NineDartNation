type EnsureVideoPlaysResult = {
  attached: boolean;
  played: boolean;
  reason?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForMetadata(video: HTMLVideoElement, timeoutMs: number) {
  const start = Date.now();

  // If metadata is already present (or we already have dimensions), bail fast.
  if (video.readyState >= 1 || (video.videoWidth ?? 0) > 0) return;

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    };

    const onLoaded = () => finish();
    const onCanPlay = () => finish();

    const timer = window.setInterval(() => {
      if (Date.now() - start > timeoutMs) finish();
      if (video.readyState >= 1) finish();
      if ((video.videoWidth ?? 0) > 0) finish();
    }, 50);

    const cleanup = () => {
      try {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("canplay", onCanPlay);
        window.clearInterval(timer);
      } catch {}
    };

    try {
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("canplay", onCanPlay);
    } catch {
      // If events are unavailable (tests), rely on polling + timeout.
    }
  });
}

/**
 * Attaches `stream` to `video` (if needed) and aggressively nudges `play()` with
 * small retries. Designed for preview tiles where timing/autoplay quirks happen.
 */
export async function ensureVideoPlays(opts: {
  video: HTMLVideoElement | null;
  stream: MediaStream | null;
  attach?: boolean;
  /** Default true - preview should be muted to satisfy autoplay policies. */
  muted?: boolean;
  /** Default true, important on iOS. */
  playsInline?: boolean;
  /** Default 4 attempts. */
  maxAttempts?: number;
  /** Default 1200ms. */
  metadataTimeoutMs?: number;
  onPlayError?: (err: unknown) => void;
}): Promise<EnsureVideoPlaysResult> {
  const {
    video,
    stream,
    attach = true,
    muted = true,
    playsInline = true,
    maxAttempts = 4,
    metadataTimeoutMs = 1200,
    onPlayError,
  } = opts;

  if (!video) return { attached: false, played: false, reason: "no video" };

  const liveVideoTracks = (stream?.getVideoTracks?.() || []).filter(
    (t) => t.readyState === "live",
  );
  if (!stream || liveVideoTracks.length === 0) {
    return {
      attached: false,
      played: false,
      reason: "no live stream",
    };
  }

  try {
    if (muted) video.muted = true;
    if (playsInline) (video as any).playsInline = true;
  } catch {}

  let attached = false;
  if (attach) {
    try {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      attached = true;
    } catch (e) {
      return { attached: false, played: false, reason: "attach failed" };
    }
  }
  // Serialize concurrent play attempts for the same <video> element to avoid
  // AbortError races where a new load/play replaces a pending one.
  // Use a WeakMap so entries don't leak when elements are removed.
  const playAttemptMap: WeakMap<
    HTMLVideoElement,
    Promise<EnsureVideoPlaysResult>
  > = (ensureVideoPlays as any)._playAttemptMap || new WeakMap();
  (ensureVideoPlays as any)._playAttemptMap = playAttemptMap;

  // If another caller is already trying to play this video, wait for it to
  // complete first so we don't overlap load/play operations.
  const existing = playAttemptMap.get(video);
  if (existing) {
    try {
      const r = await existing;
      return r;
    } catch {
      // fallthrough and attempt ourselves
    }
  }

  const attemptPromise = (async (): Promise<EnsureVideoPlaysResult> => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await waitForMetadata(video, metadataTimeoutMs);
      } catch {}

      try {
        // Some browsers require a fresh play nudge even if already playing.
        const p = video.play();
        if (p && typeof (p as any).then === "function") await p;

        // If we have frames coming through, we are good.
        if ((video.videoWidth ?? 0) > 0 && (video.videoHeight ?? 0) > 0) {
          return { attached, played: true };
        }

        // Even if dimensions aren't populated yet, if not paused we likely succeeded.
        if (video.paused === false) {
          return { attached, played: true };
        }
      } catch (err: any) {
        // Treat AbortError specially: commonly caused by concurrent load/play
        // events. Wait a short backoff and retry. Still report the error to
        // the provided hook for diagnostics.
        try {
          onPlayError?.(err);
        } catch {}
        if (err && err.name === "AbortError") {
          // small backoff before retrying
          await sleep(120 + i * 150);
          continue;
        }
      }

      await sleep(120 + i * 150);
    }

    return { attached, played: false, reason: "play retries exhausted" };
  })();

  // store and await
  playAttemptMap.set(video, attemptPromise);
  try {
    const res = await attemptPromise;
    return res;
  } finally {
    // cleanup
    try {
      playAttemptMap.delete(video);
    } catch {}
  }
}
