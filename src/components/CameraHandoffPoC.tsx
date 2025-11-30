import React, { useEffect, useRef, useState } from 'react';

// Experimental PoC: capture frames and broadcast ImageBitmap via BroadcastChannel
// Note: browsers limit cross-tab camera usage; this is an experimental demo only.

export default function CameraHandoffPoC() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [running, setRunning] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    return () => {
      try { channelRef.current?.close(); } catch {}
    };
  }, []);

  async function startCapture() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (videoRef.current) videoRef.current.srcObject = stream;
      // Create a BroadcastChannel to publish frames
      try {
        const bc = new BroadcastChannel('ndn-camera-frames');
        channelRef.current = bc;
      } catch {}
      setRunning(true);
      // lightweight loop: draw to canvas and postImageBitmap
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const vid = videoRef.current as HTMLVideoElement;
      const tick = async () => {
        if (!running || !vid || vid.readyState < 2) return;
        canvas.width = vid.videoWidth;
        canvas.height = vid.videoHeight;
        if (ctx) ctx.drawImage(vid, 0, 0);
        try {
          const bitmap = await createImageBitmap(canvas);
          try { channelRef.current?.postMessage({ type: 'frame', bitmap }); } catch {}
        } catch {}
        setTimeout(tick, 200); // 5fps; keep low for demo
      };
      setTimeout(tick, 500);
    } catch (e) {
      console.error('Camera PoC failed', e);
    }
  }

  function stop() {
    try {
      const vid = videoRef.current as HTMLVideoElement;
      const s = vid?.srcObject as MediaStream | undefined;
      s?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    } catch {}
    try { channelRef.current?.close(); } catch {}
    setRunning(false);
  }

  return (
    <div className="card p-3">
      <h3 className="font-bold mb-2">Camera Handoff PoC (experimental)</h3>
      <video ref={videoRef} autoPlay muted playsInline className="w-full bg-black" />
      <div className="flex gap-2 mt-2">
        {!running ? (
          <button className="btn" onClick={startCapture}>Start Capture</button>
        ) : (
          <button className="btn bg-rose-600" onClick={stop}>Stop</button>
        )}
        <div className="text-sm opacity-70">Note: frame transfer across tabs is experimental and may be blocked by browser security.</div>
      </div>
    </div>
  );
}
