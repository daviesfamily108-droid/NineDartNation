import React, { useRef, useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { useCameraSession, CameraStreamMode } from '../store/cameraSession';
import { useUserSettings } from '../store/userSettings';
import { apiFetch } from '../utils/api';
import { getPreferredWsUrl } from '../utils/ws';
import { ensureVideoPlays } from '../utils/ensureVideoPlays';
import { Camera, Smartphone } from 'lucide-react';

function clsx(...args: any[]) {
  return args.filter(Boolean).join(' ');
}

type CameraTileProps = {
  label?: string;
  autoStart?: boolean;
  forceAutoStart?: boolean;
  scale?: number;
  className?: string;
  aspect?: 'inherit' | 'wide' | 'square' | 'portrait' | 'classic' | 'free';
  style?: CSSProperties;
  fill?: boolean;
  tileFitModeOverride?: 'fit' | 'fill';
};

export default function CameraTile(props: CameraTileProps) {
  const {
    label,
    autoStart,
    forceAutoStart = false,
    scale: scaleOverrideProp,
    className,
    aspect = 'inherit',
    style,
    fill = false,
    tileFitModeOverride: tileFitModeOverrideProp,
  } = props;

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraSession = useCameraSession();
  const [streaming, setStreaming] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const pairCodeRef = useRef<string | null>(null);
  const [pc, setPc] = useState<RTCPeerConnection | null>(null);
  const lastRegisteredModeRef = useRef<CameraStreamMode | null>(null);

  useEffect(() => {
    pairCodeRef.current = pairCode;
  }, [pairCode]);

  const registerStream = useCallback(
    (stream: MediaStream | null, modeOverride: CameraStreamMode = 'local') => {
      try {
        if (stream) {
          cameraSession.setMediaStream(stream);
          cameraSession.setMode(modeOverride);
          cameraSession.setStreaming(true);
          lastRegisteredModeRef.current = modeOverride;
        } else if (
          lastRegisteredModeRef.current &&
          lastRegisteredModeRef.current !== 'phone'
        ) {
          cameraSession.setStreaming(false);
          cameraSession.setMediaStream(null);
          lastRegisteredModeRef.current = null;
        }
      } catch (err) {}
    },
    [cameraSession],
  );

  const attachFromSession = useCallback(async () => {
    try {
      const v = videoRef.current;
      if (!v) return false;
      const s = cameraSession.getMediaStream?.() || null;
      const liveTracks = (s?.getVideoTracks?.() || []).filter(
        (t: MediaStreamTrack) => t.readyState === 'live',
      );
      if (!s || liveTracks.length === 0) return false;

      const res = await ensureVideoPlays({
        video: v,
        stream: s,
        onPlayError: (e: any) => console.warn('[CameraTile] Play failed:', e),
      });
      setStreaming(!!res.played);
      if (res.played) {
        try {
          const current = cameraSession.getVideoElementRef?.();
          if (!current || current === v) {
            cameraSession.setVideoElementRef?.(v);
          }
        } catch {}
      }
      return !!res.played;
    } catch {
      return false;
    }
  }, [cameraSession]);

  const preferredCameraLabel = useUserSettings((s: any) => s.preferredCameraLabel);
  const [mode, setMode] = useState<'local' | 'phone' | 'wifi'>(() => {
    if (preferredCameraLabel === 'Phone Camera') return 'phone';
    const saved = localStorage.getItem('ndn:camera:mode') as any;
    return saved || 'local';
  });

  const [lanHost, setLanHost] = useState<string | null>(null);
  const [httpsInfo, setHttpsInfo] = useState<{ https: boolean; port: number } | null>(null);

  useEffect(() => {
    localStorage.setItem('ndn:camera:mode', mode);
  }, [mode]);

  useEffect(() => {
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      apiFetch('/api/hosts')
        .then((r) => r.json())
        .then((j: any) => {
          const ip = Array.isArray(j?.hosts) && j.hosts.find((x: string) => x);
          if (ip) setLanHost(ip);
        })
        .catch(() => {});
    }
    apiFetch('/api/https-info')
      .then((r) => r.json())
      .then((j: any) => {
        if (j && typeof j.https === 'boolean')
          setHttpsInfo({ https: !!j.https, port: Number(j.port) || 8788 });
      })
      .catch(() => {});
  }, []);

  const mobileUrl = useMemo(() => {
    const code = pairCode || '____';
    const host = lanHost || window.location.hostname;
    const proto = httpsInfo?.https ? 'https' : 'http';
    const port = httpsInfo?.https ? httpsInfo.port : 8787;
    return `${proto}://${host}:${port}/mobile-cam.html?code=${code}`;
  }, [pairCode, lanHost, httpsInfo]);

  function ensureWS() {
    if (ws && ws.readyState === WebSocket.OPEN) return ws;
    const url = getPreferredWsUrl();
    const socket = new WebSocket(url);
    setWs(socket);
    return socket;
  }

  const startPhonePairing = useCallback(() => {
    setMode('phone');
    const socket = ensureWS();
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'cam-create' }));
    } else {
      socket.onopen = () => socket.send(JSON.stringify({ type: 'cam-create' }));
    }
    socket.onmessage = async (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === 'cam-code') {
        setPairCode(data.code);
        pairCodeRef.current = data.code;
      } else if (data.type === 'cam-peer-joined') {
        const peer = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        setPc(peer);
        peer.onicecandidate = (e) => {
          if (e.candidate && pairCodeRef.current)
            socket.send(
              JSON.stringify({
                type: 'cam-ice',
                code: pairCodeRef.current,
                payload: e.candidate,
              }),
            );
        };
        peer.ontrack = (ev) => {
          if (videoRef.current && ev.streams?.[0]) {
            videoRef.current.srcObject = ev.streams[0];
            videoRef.current.play().catch(() => {});
            registerStream(ev.streams[0], 'phone');
            setStreaming(true);
          }
        };
        const offer = await peer.createOffer({ offerToReceiveVideo: true });
        await peer.setLocalDescription(offer);
        if (pairCodeRef.current)
          socket.send(
            JSON.stringify({
              type: 'cam-offer',
              code: pairCodeRef.current,
              payload: offer,
            }),
          );
      } else if (data.type === 'cam-answer' && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
      } else if (data.type === 'cam-ice' && pc) {
        try {
          await pc.addIceCandidate(data.payload);
        } catch {}
      }
    };
  }, [registerStream, pc, ws]);

  const startLocal = useCallback(async () => {
    const ok = await attachFromSession();
    if (!ok) {
      window.dispatchEvent(
        new CustomEvent('ndn:start-camera', { detail: { mode: 'local' } }),
      );
    }
  }, [attachFromSession]);

  const handleModeSelect = useCallback(
    (newMode: string) => {
      setMode(newMode as any);
      if (newMode === 'local') startLocal();
      else if (newMode === 'phone') startPhonePairing();
    },
    [startLocal, startPhonePairing],
  );

  useEffect(() => {
    if (autoStart || forceAutoStart) {
      if (mode === 'local') startLocal();
      else if (mode === 'phone') startPhonePairing();
    }
  }, [autoStart, forceAutoStart, mode, startLocal, startPhonePairing]);

  return (
    <CameraFrame
      {...props}
      videoRef={videoRef}
      streaming={streaming}
      mode={mode}
      pairCode={pairCode}
      mobileUrl={mobileUrl}
      startPhonePairing={startPhonePairing}
      onModeSelect={handleModeSelect}
    />
  );
}

function CameraFrame(props: any) {
  const {
    videoRef,
    streaming,
    mode,
    pairCode,
    mobileUrl,
    startPhonePairing,
    label,
    fill,
    className,
    style,
    scale: scaleProp,
    aspect = 'inherit',
    tileFitModeOverride,
  } = props;
  const { cameraScale, cameraAspect: storedAspect, cameraFitMode: globalFitMode } = useUserSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [forceFallbackMode, setForceFallbackMode] = useState(false);

  const isContainerVisible = useCallback(() => {
    if (!containerRef.current) return true;
    const r = containerRef.current.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.top < (window.innerHeight || 2000) &&
      r.bottom > 0
    );
  }, []);

  const effectiveFitMode: 'fit' | 'fill' = 
    tileFitModeOverride || (fill ? 'fill' : globalFitMode || 'fill');
  const scale = Number(scaleProp ?? cameraScale ?? 1);

  const aspectChoice =
    fill && effectiveFitMode === 'fill'
      ? 'free'
      : aspect && aspect !== 'inherit'
      ? aspect
      : (storedAspect as any) || 'wide';

  const aspectClass =
    aspectChoice === 'square'
      ? 'aspect-square'
      : aspectChoice === 'portrait'
      ? 'aspect-[3/4]'
      : aspectChoice === 'classic'
      ? 'aspect-[4/3]'
      : aspectChoice === 'free'
      ? 'h-full'
      : 'aspect-video';

  useEffect(() => {
    let raf = 0;
    let running = true;
    let sampleHandle = 0;
    let activated = false;

    const drawLoop = () => {
      if (!running) return;
      const v = videoRef.current;
      const c = previewCanvasRef.current;
      const useFallback = v && (forceFallbackMode || (v.videoWidth > 0 && v.readyState < 2));

      if (v && c && useFallback) {
        const ctx = c.getContext('2d', { alpha: false });
        if (ctx && v.videoWidth > 0) {
          if (!activated) {
            console.info('CameraTile: canvas fallback activated');
            activated = true;
          }
          if (c.width !== v.videoWidth) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
          }
          ctx.drawImage(v, 0, 0);
          c.style.visibility = 'visible';
        }
      } else if (c) {
        c.style.visibility = 'hidden';
      }
      raf = requestAnimationFrame(drawLoop);
    };
    raf = requestAnimationFrame(drawLoop);

    sampleHandle = window.setInterval(() => {
      const v = videoRef.current;
      if (v && v.videoWidth > 0 && isContainerVisible()) {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          try {
            ctx.drawImage(v, 0, 0, 16, 16);
            const data = ctx.getImageData(0, 0, 16, 16).data;
            let sum = 0;
            for (let i = 0; i < data.length; i += 4)
              sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const avg = sum / (16 * 16 * 255);
            if (avg < 0.02) setForceFallbackMode(true);
            else setForceFallbackMode(false);
          } catch (e) {}
        }
      }
    }, 2000);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.clearInterval(sampleHandle);
    };
  }, [videoRef, isContainerVisible, forceFallbackMode]);

  return (
    <div
      ref={containerRef}
      className={clsx(
        'relative bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/5',
        className,
        fill && 'w-full h-full'
      )}
      style={style}
    >
      <div className={clsx('relative w-full', aspectClass)}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={clsx(
            'w-full h-full',
            effectiveFitMode === 'fill' ? 'object-cover' : 'object-contain',
            forceFallbackMode ? 'opacity-0 absolute' : 'block'
          )}
          style={{ transform: `scale(${scale})` }}
        />
        <canvas
          ref={previewCanvasRef}
          className={clsx(
            'absolute inset-0 w-full h-full bg-black',
            effectiveFitMode === 'fill' ? 'object-cover' : 'object-contain'
          )}
          style={{ visibility: 'hidden', transform: `scale(${scale})` }}
        />
      </div>

      <div className='absolute top-3 left-3 flex items-center gap-2'>
        <div className='w-8 h-8 rounded-full bg-indigo-500/20 backdrop-blur-md flex items-center justify-center text-white'>
          <Camera size={14} />
        </div>
        <div className='flex flex-col'>
          <span className='text-[10px] text-white/40 uppercase tracking-widest font-bold'>
            Live Feed
          </span>
          <span className='text-white font-bold leading-none'>
            {label || mode}
          </span>
        </div>
      </div>
      {streaming && (
        <div className='absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30'>
          <div className='w-2 h-2 rounded-full bg-emerald-400 animate-pulse' />
          <span className='text-xs text-emerald-400 font-bold uppercase tracking-widest'>
            Live
          </span>
        </div>
      )}
    </div>
  );
}
