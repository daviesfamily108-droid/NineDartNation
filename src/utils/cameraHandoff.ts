// PoC: forward small JPEG frames from a video element across windows using BroadcastChannel
import { broadcastMessage, subscribeMatchSync } from "./broadcast";

let _interval: number | null = null;
let _video: HTMLVideoElement | null = null;

export function startForwarding(video: HTMLVideoElement, ms = 500) {
  try {
    stopForwarding();
    _video = video;
    _interval = window.setInterval(() => {
      try {
        if (!_video || !_video.videoWidth || !_video.videoHeight) return;
        const w = 320;
        const h = Math.round((_video.videoHeight / _video.videoWidth) * w) || 180;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(_video, 0, 0, w, h);
        try {
          const frame = c.toDataURL("image/jpeg", 0.45);
          broadcastMessage({ type: "cameraFrame", frame, ts: Date.now() });
        } catch (e) {}
      } catch (e) {}
    }, ms) as unknown as number;
  } catch (e) {}
}

export function stopForwarding() {
  try {
    if (_interval) {
      clearInterval(_interval as number);
      _interval = null;
    }
    _video = null;
  } catch {}
}

export function subscribeFrames(onFrame: (dataUrl: string) => void) {
  const unsub = subscribeMatchSync((msg: any) => {
    try {
      if (!msg) return;
      if (msg.type === "cameraFrame" && msg.frame) onFrame(msg.frame as string);
    } catch {}
  });
  return unsub;
}
