/* eslint-disable jsx-a11y/media-has-caption */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { dlog } from "../utils/logger";
import { ensureVideoPlays } from "../utils/ensureVideoPlays";
import { useUserSettings } from "../store/userSettings";
import {
  useCameraSession,
  type CameraStreamMode,
} from "../store/cameraSession";
import {
  discoverNetworkDevices,
  connectToNetworkDevice,
  type NetworkDevice,
  discoverUSBDevices,
  requestUSBDevice,
  connectToUSBDevice,
  type USBDevice,
} from "../utils/networkDevices";
import { apiFetch } from "../utils/api";
import { getPreferredWsUrl } from "../utils/ws";

type CameraTileProps = {
  label?: string;
  autoStart?: boolean;
  /** Force the tile to kick off streaming even if global camera toggle is off (useful for pre-match preview). */
  forceAutoStart?: boolean;
  scale?: number;
  className?: string;
  aspect?: "inherit" | "wide" | "square" | "portrait" | "classic" | "free";
  style?: CSSProperties;
  fill?: boolean;
  // Offline mode props
  user?: any;
  playerScore?: number;
  aiScore?: number;
  x01Score?: number;
  inMatch?: boolean;
  showWinPopup?: boolean;
  pendingLegWinner?: "player" | "ai" | null;
  playerDartsThrown?: number;
  aiDartsThrown?: number;
  totalPlayerDarts?: number;
  totalAiDarts?: number;
  totalPlayerPoints?: number;
  totalAiPoints?: number;
  player180s?: number;
  player140s?: number;
  player100s?: number;
  ai180s?: number;
  ai140s?: number;
  ai100s?: number;
  playerHighestCheckout?: number;
  aiHighestCheckout?: number;
  onClose?: () => void;
  onOpen?: () => void;
  layout?: "classic" | "modern";
  /** Override the global fit mode for this tile only. */
  tileFitModeOverride?: "fit" | "fill";
};

export default function CameraTile({
  label,
  autoStart,
  forceAutoStart = false,
  scale: scaleOverrideProp,
  className,
  aspect = "inherit",
  style,
  fill = false,
  tileFitModeOverride: tileFitModeOverrideProp,
}: CameraTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraSession = useCameraSession();
  const [streaming, setStreaming] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pc, setPc] = useState<RTCPeerConnection | null>(null);
  const lastRegisteredModeRef = useRef<CameraStreamMode | null>(null);

  // Always register the current <video> element with the global camera session.
  // This is especially important for the pre-game overlay where we want the
  // already-running calibrated stream to appear immediately.
  useEffect(() => {
    try {
      const v = videoRef.current;
      if (v) {
        const current = cameraSession.getVideoElementRef?.();
        // Avoid thrashing the global ref when multiple tiles mount.
        // Only claim it if nobody has one yet or we're already the active ref.
        if (!current || current === v) {
          cameraSession.setVideoElementRef?.(v);
        }
      }
    } catch {}
    return () => {
      try {
        // IMPORTANT: don't clear the global ref automatically.
        // Other UI surfaces (MatchStartShowcase overlay, CameraView) rely on it.
        // Clearing here can cause the pre-game preview to go black if another tile
        // hasn't re-registered yet.
      } catch {}
    };
  }, [cameraSession]);
  const registerStream = useCallback(
    (stream: MediaStream | null, modeOverride: CameraStreamMode = "local") => {
      try {
        if (stream) {
          cameraSession.setMediaStream(stream);
          if (videoRef.current) {
            // consumer-only: do NOT set cameraSession video ref
          }
          cameraSession.setMode(modeOverride);
          cameraSession.setStreaming(true);
          lastRegisteredModeRef.current = modeOverride;
        } else if (
          lastRegisteredModeRef.current &&
          lastRegisteredModeRef.current !== "phone"
        ) {
          cameraSession.setStreaming(false);
          cameraSession.setMediaStream(null);
          lastRegisteredModeRef.current = null;
        }
      } catch (err) {
        console.warn(
          "[CameraTile] Failed to register stream with camera session:",
          err,
        );
      }
    },
    [cameraSession],
  );

  const attachExistingStream = useCallback(async () => {
    try {
      const existingStream = cameraSession.getMediaStream();
      if (!existingStream) {
        console.log(
          "[CameraTile] attachExistingStream: No existing stream found",
        );
        return false;
      }
      if (!videoRef.current) {
        console.log("[CameraTile] attachExistingStream: No video ref");
        return false;
      }
      const res = await ensureVideoPlays({
        video: videoRef.current,
        stream: existingStream,
        onPlayError: (e) => console.warn("[CameraTile] Play failed:", e),
      });
      setStreaming(!!res.played);
      return !!res.played;
    } catch (err) {
      console.warn("[CameraTile] Failed to reuse global camera stream", err);
      return false;
    }
  }, [cameraSession]);

  // Initialize mode: prioritize phone camera if preferred, otherwise use localStorage
  const preferredCameraLabel = useUserSettings((s) => s.preferredCameraLabel);
  const [mode, setMode] = useState<"local" | "phone" | "wifi">(() => {
    // If phone camera is selected, start in phone mode
    if (preferredCameraLabel === "Phone Camera") {
      dlog(
        "[CAMERATILE] Initializing mode to phone (from preferred camera selection)",
      );
      return "phone";
    }
    // Otherwise use saved mode or default to local
    const saved = localStorage.getItem("ndn:camera:mode") as any;
    dlog(
      "[CAMERATILE] Initializing mode to",
      saved || "local",
      "(from localStorage)",
    );
    return saved || "local";
  });

  const [, setExpiresAt] = useState<number | null>(null);
  const [, setPaired] = useState<boolean>(false);
  const [lanHost, setLanHost] = useState<string | null>(null);
  const [httpsInfo, setHttpsInfo] = useState<{
    https: boolean;
    port: number;
  } | null>(null);
  const [showTips, setShowTips] = useState<boolean>(true);
  const [wifiDevices, setWifiDevices] = useState<NetworkDevice[]>([]);
  const [discoveringWifi, setDiscoveringWifi] = useState<boolean>(false);
  const [usbDevices, setUsbDevices] = useState<USBDevice[]>([]);
  const [discoveringUsb, setDiscoveringUsb] = useState<boolean>(false);
  const autoscoreProvider = useUserSettings((s) => s.autoscoreProvider);
  const cameraEnabledSetting = useUserSettings((s) => s.cameraEnabled);
  const setPreferredCameraLocked = useUserSettings(
    (s) => s.setPreferredCameraLocked,
  );
  const preferredCameraLocked = useUserSettings((s) => s.preferredCameraLocked);
  const setPreferredCamera = useUserSettings((s) => s.setPreferredCamera);
  const preferredCameraId = useUserSettings((s) => s.preferredCameraId);

  // If manual mode is active, we usually show the fallback.
  // BUT if forceAutoStart is true (e.g. pre-game preview), we should show the camera anyway.
  if (autoscoreProvider === "manual" && !forceAutoStart) {
    const fallbackBase = fill
      ? "rounded-2xl overflow-hidden bg-black w-full flex flex-col"
      : "rounded-2xl overflow-hidden bg-black w-full mx-auto";
    const fallbackClass = [fallbackBase, className]
      .filter(Boolean)
      .join(" ")
      .trim();
    const fallbackStyle: CSSProperties = { ...(style || {}) };
    if (
      !fill &&
      fallbackStyle.aspectRatio === undefined &&
      fallbackStyle.height === undefined &&
      fallbackStyle.minHeight === undefined
    ) {
      fallbackStyle.aspectRatio = "4 / 3";
    }
    return (
      <div className={fallbackClass} style={fallbackStyle}>
        <div className="flex-1 w-full h-full flex items-center justify-center bg-slate-900 text-slate-200 text-xs p-4 text-center">
          Manual scoring mode active — camera feeds are disabled.
        </div>
      </div>
    );
  }
  useEffect(() => {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") {
      apiFetch(`/api/hosts`)
        .then((r) => r.json())
        .then((j) => {
          const ip = Array.isArray(j?.hosts) && j.hosts.find((x: string) => x);
          if (ip) setLanHost(ip);
        })
        .catch(() => {});
    }
    // Detect HTTPS support for the phone link
    apiFetch(`/api/https-info`)
      .then((r) => r.json())
      .then((j) => {
        if (j && typeof j.https === "boolean")
          setHttpsInfo({ https: !!j.https, port: Number(j.port) || 8788 });
      })
      .catch(() => {});
  }, []);
  const mobileUrl = useMemo(() => {
    const code = pairCode || "____";
    // If a hosted WS URL is configured (e.g., Render), derive the server origin from it
    const envUrl = (import.meta as any).env?.VITE_WS_URL as string | undefined;
    if (envUrl && envUrl.length > 0) {
      try {
        // Convert ws(s)://host[/ws] -> http(s)://host (strip trailing /ws)
        const u = new URL(envUrl);
        const isSecure = u.protocol === "wss:";
        const origin = `${isSecure ? "https" : "http"}://${u.host}${u.pathname.endsWith("/ws") ? "" : u.pathname}`;
        const base = origin.replace(/\/?ws$/i, "");
        return `${base}/mobile-cam.html?code=${code}`;
      } catch (e) {}
    }
    // Fallback to local development: prefer LAN host if detected
    const host = lanHost || window.location.hostname;
    const useHttps = !!httpsInfo?.https;
    const port = useHttps ? httpsInfo?.port || 8788 : 8787;
    const proto = useHttps ? "https" : "http";
    return `${proto}://${host}:${port}/mobile-cam.html?code=${code}`;
  }, [pairCode, lanHost, httpsInfo]);
  useEffect(() => {
    dlog("[CAMERATILE] Mode changed to:", mode, "- persisting to localStorage");
    localStorage.setItem("ndn:camera:mode", mode);
  }, [mode]);

  useEffect(() => {
    if (!cameraSession.isStreaming) return;
    attachExistingStream();
  }, [cameraSession.isStreaming, attachExistingStream]);

  const [manualModeSetAt, setManualModeSetAt] = useState<number | null>(null);

  // start/stop are implemented later (deduplicated); keep single definition below.

  // Sync phone camera selection from Calibrator into CameraTile mode state
  // When user locks in phone camera in Calibrator, it updates preferredCameraLabel
  // This effect ensures CameraTile's UI reflects that selection
  useEffect(() => {
    const ignore = useUserSettings.getState().ignorePreferredCameraSync;
    dlog(
      "[CAMERATILE] Checking camera selection sync: preferredCameraLabel=",
      preferredCameraLabel,
      "mode=",
      mode,
      "ignoreSync=",
      ignore,
      "manualModeSetAt=",
      manualModeSetAt,
    );
    if (ignore) return;
    // If user manually changed mode recently, avoid auto-syncing preferred camera
    if (manualModeSetAt && Date.now() - manualModeSetAt < 30_000) return;
    if (preferredCameraLabel === "Phone Camera" && mode !== "phone") {
      dlog("[CAMERATILE] Syncing mode to phone from Calibrator selection");
      setMode("phone");
    }
  }, [preferredCameraLabel, mode, manualModeSetAt]);

  // Intentionally disabled automatic regeneration of phone pairing codes.
  // Codes will only be created when the user explicitly requests it (button click).
  // This prevents a code expiring and the UI silently generating a new one while pairing.

  // If the user selected Phone Camera, bind the global stream into this tile
  useEffect(() => {
    const apply = async () => {
      try {
        const allowPhoneAttach =
          (preferredCameraLabel === "Phone Camera" &&
            (!manualModeSetAt || Date.now() - manualModeSetAt >= 30_000)) ||
          mode === "phone";
        if (!allowPhoneAttach) return;
        const s = cameraSession.getMediaStream();
        const v = videoRef.current;
        if (!v || !s) return;
        const liveTracks = (s.getVideoTracks?.() || []).filter(
          (t) => t.readyState === "live",
        );
        if (liveTracks.length === 0) {
          console.warn(
            "[CameraTile] Phone attach: stream has no live tracks; skipping attach",
            s.id,
          );
          setStreaming(false);
          return;
        }
        if (v.srcObject !== s) {
          v.srcObject = s;
        }
        // Ensure playback starts reliably (autoplay policies / metadata timing)
        try {
          const res = await ensureVideoPlays({ video: v, stream: s });
          setStreaming(!!res.played);
        } catch {
          setStreaming(true);
        }
        // Once attached and playing, no need to keep polling.
        return true;
      } catch {}
      return false;
    };
    // Try immediately and poll briefly to catch late-arriving stream
    let cleared = false;
    let t: any = null;
    const maybeClear = (ok?: boolean) => {
      if (!!ok && t && !cleared) {
        cleared = true;
        try {
          clearInterval(t);
        } catch {}
      }
    };
    Promise.resolve(apply())
      .then(maybeClear)
      .catch(() => {});
    t = setInterval(() => {
      Promise.resolve(apply())
        .then(maybeClear)
        .catch(() => {});
    }, 800);
    return () => {
      try {
        if (t) clearInterval(t);
      } catch {}
    };
  }, [preferredCameraLabel, mode, cameraSession, cameraSession.isStreaming]);

  const start = useCallback(async () => {
    console.log("[CameraTile] start() invoked with mode=", mode);
    if (await attachExistingStream()) {
      console.log("[CameraTile] Reused calibrated global stream");
      return;
    }
    if (mode === "wifi") {
      return startWifiConnection();
    }
    console.log(
      "[CameraTile] Attempting to attach global stream for phone mode...",
    );

    // If phone camera is selected and paired, don't try to start local camera
    if (preferredCameraLabel === "Phone Camera" || mode === "phone") {
      const s = cameraSession.getMediaStream();
      const liveTracks = (s?.getVideoTracks?.() || []).filter(
        (t) => t.readyState === "live",
      );
      if (s && liveTracks.length > 0 && videoRef.current) {
        try {
          const res = await ensureVideoPlays({
            video: videoRef.current,
            stream: s,
          });
          setStreaming(!!res.played);
          if (res.played) return;
        } catch {}
      }
      // If no global stream yet, for phone mode we should attempt pairing
      if (mode === "phone") {
        try {
          await startPhonePairing();
          return;
        } catch {}
      }
    }

    // NOTE: CameraTile is preview/UI only.
    // Local capture is owned by CameraView and stored in the global cameraSession.
    // Starting a second getUserMedia stream here can cause devices (especially
    // virtual cameras) to flicker/white-screen as tracks are rapidly opened/closed.
    // So: just attempt to reuse whatever the global session has.
    try {
      const s = cameraSession.getMediaStream?.();
      const liveTracks = (s?.getVideoTracks?.() || []).filter(
        (t) => t.readyState === "live",
      );
      if (s && liveTracks.length > 0 && videoRef.current) {
        const res = await ensureVideoPlays({
          video: videoRef.current,
          stream: s,
        });
        setStreaming(!!res.played);
        if (res.played) return;
      }
    } catch {}
  }, [
    mode,
    preferredCameraLabel,
    cameraSession,
    registerStream,
    startPhonePairing,
    startWifiConnection,
    attachExistingStream,
  ]);

  // Failsafe: whenever the tile is mounted (e.g., pre-game overlay), ensure we
  // attach any already-running global stream to this video element. If none is
  // present and forceAutoStart is set, kick off start(). This helps the
  // bull-up/prestart preview reliably show the live feed.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) {
      console.log("[CameraTile] Failsafe: No video ref");
      return;
    }
    const s = cameraSession.getMediaStream?.();
    const liveTracks = (s?.getVideoTracks?.() || []).filter(
      (t) => t.readyState === "live",
    );
    if (s && liveTracks.length > 0) {
      try {
        Promise.resolve(
          ensureVideoPlays({
            video: v,
            stream: s,
            onPlayError: (e) =>
              console.warn("[CameraTile] Failsafe play error", e),
          }),
        )
          .then((res) => {
            if (res.played) {
              console.log("[CameraTile] Failsafe: Playing");
              setStreaming(true);
            }
          })
          .catch(() => {});
        return;
      } catch {}
    } else {
      console.log("[CameraTile] Failsafe: No stream in session");
    }
    if (forceAutoStart || autoStart) {
      console.log(
        "[CameraTile] Failsafe: Triggering start() (no stream or dead tracks)",
        {
          hasStream: !!s,
          liveTracks: liveTracks.length,
        },
      );
      start().catch(() => {});
    }
  }, [
    cameraSession,
    forceAutoStart,
    autoStart,
    start,
    cameraSession.isStreaming,
  ]);
  const stop = useCallback(() => {
    // Preview-only: do NOT stop tracks here, as the global cameraSession stream
    // may be shared by CameraView and other UI surfaces.
    //
    // IMPORTANT: do not aggressively detach srcObject here.
    // On some browsers/devices, repeatedly clearing srcObject while other
    // components are reusing the same stream can lead to a black preview until a
    // full reattach/replay happens.
    setStreaming(false);
  }, [registerStream]);

  // Auto-start/stop the tile when requested.
  useEffect(() => {
    // Allow pre-match/bull-up overlays to force a preview even when the user has
    // camera toggled off or autoscore provider is non-built-in.
    if (!forceAutoStart) {
      if (!cameraEnabledSetting) return;
      if (
        autoscoreProvider &&
        autoscoreProvider !== "built-in" &&
        autoscoreProvider !== "external-ws"
      )
        return;
    }

    // If autoStart is undefined, we don't do anything unless forceAutoStart is true
    if (autoStart === undefined && !forceAutoStart) return;

    if (autoStart || forceAutoStart) {
      let cancelled = false;
      const desiredLabel = preferredCameraLabel || "default";
      const timer = window.setTimeout(() => {
        if (cancelled || streaming) return;
        start().catch((err) =>
          console.warn(
            `[CameraTile] Auto-start failed for ${desiredLabel}:`,
            err,
          ),
        );
      }, 200);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    stop();
  }, [
    autoStart,
    forceAutoStart,
    streaming,
    cameraEnabledSetting,
    autoscoreProvider,
    preferredCameraLabel,
    start,
    stop,
  ]);

  async function startWifiConnection() {
    setDiscoveringWifi(true);
    try {
      const devices = await discoverNetworkDevices();
      setWifiDevices(devices);
      if (devices.length === 0) {
        alert(
          "No wifi scoring devices found on your network. Make sure devices are powered on and connected to the same network.",
        );
      }
    } catch (error) {
      console.error("Wifi device discovery failed:", error);
      alert(
        "Failed to discover wifi devices. Please check your network connection.",
      );
    } finally {
      setDiscoveringWifi(false);
    }
  }

  async function connectToWifiDevice(device: NetworkDevice) {
    try {
      setWifiDevices((devices) =>
        devices.map((d) =>
          d.id === device.id ? { ...d, status: "connecting" as const } : d,
        ),
      );

      const stream = await connectToNetworkDevice(device);
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
        registerStream(stream, "wifi");
        setWifiDevices((devices) =>
          devices.map((d) =>
            d.id === device.id ? { ...d, status: "online" as const } : d,
          ),
        );
      } else {
        throw new Error("Failed to get video stream");
      }
    } catch (error) {
      console.error("Failed to connect to wifi device:", error);
      alert(
        `Failed to connect to ${device.name}. Please check the device and try again.`,
      );
      setWifiDevices((devices) =>
        devices.map((d) =>
          d.id === device.id ? { ...d, status: "offline" as const } : d,
        ),
      );
    }
  }

  async function startUsbConnection() {
    setDiscoveringUsb(true);
    try {
      // First try to get already paired devices
      const devices = await discoverUSBDevices();
      setUsbDevices(devices);

      // Then request user to select a new device
      const newDevice = await requestUSBDevice();
      if (newDevice) {
        setUsbDevices((prev) => [...prev, newDevice]);
      }

      if (devices.length === 0 && !newDevice) {
        alert(
          "No USB scoring devices found. Please connect a device and try again.",
        );
      }
    } catch (error) {
      console.error("USB device discovery failed:", error);
      alert("Failed to discover USB devices. Please check device connections.");
    } finally {
      setDiscoveringUsb(false);
    }
  }

  async function connectToUsbDevice(device: USBDevice) {
    try {
      setUsbDevices((devices) =>
        devices.map((d) =>
          d.id === device.id ? { ...d, status: "connecting" as const } : d,
        ),
      );
      const stream = await connectToUSBDevice(device);
      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
        setMode("wifi"); // Using wifi mode for USB devices too
        registerStream(stream, "wifi");
        setUsbDevices((devices) =>
          devices.map((d) =>
            d.id === device.id ? { ...d, status: "online" as const } : d,
          ),
        );
      } else {
        throw new Error("Failed to get video stream");
      }
    } catch (error) {
      console.error("Failed to connect to USB device:", error);
      alert(
        `Failed to connect to ${device.name}. Please check the device and try again.`,
      );
      setUsbDevices((devices) =>
        devices.map((d) =>
          d.id === device.id ? { ...d, status: "offline" as const } : d,
        ),
      );
    }
  }

  // Listen for global event to start local camera from other UI components
  const handleModeSelect = useCallback(
    (newMode: "local" | "phone" | "wifi" | "usb") => {
      try {
        setMode(newMode === "usb" ? "wifi" : newMode);
        setManualModeSetAt(Date.now());
        // Persist the user's selection and lock it to avoid auto-switching
        try {
          if (newMode === "local") {
            try {
              setPreferredCamera(preferredCameraId, "Local", true);
            } catch {}
            try {
              setPreferredCameraLocked(true);
            } catch {}
          } else if (newMode === "phone") {
            try {
              setPreferredCamera(undefined, "Phone Camera", true);
            } catch {}
            try {
              setPreferredCameraLocked(true);
            } catch {}
          } else if (newMode === "wifi" || newMode === "usb") {
            try {
              setPreferredCamera(undefined, "WiFi/USB", true);
            } catch {}
            try {
              setPreferredCameraLocked(true);
            } catch {}
          }
        } catch {}
        if (newMode === "local") {
          start().catch(() => {});
        } else if (newMode === "phone") {
          startPhonePairing();
        } else if (newMode === "wifi") {
          startWifiConnection();
        } else if (newMode === "usb") {
          startUsbConnection();
        }
      } catch (err) {
        console.warn("[CameraTile] handleModeSelect failed", err);
      }
    },
    [
      start,
      startPhonePairing,
      startWifiConnection,
      startUsbConnection,
      setPreferredCamera,
      setPreferredCameraLocked,
      preferredCameraId,
    ],
  );

  useEffect(() => {
    const onStart = (ev: any) => {
      try {
        const modeFromEvent = ev && ev.detail && ev.detail.mode;
        if (
          modeFromEvent &&
          ["local", "phone", "wifi", "usb"].includes(modeFromEvent)
        ) {
          // Respect explicit mode requests and treat as manual selection
          handleModeSelect(modeFromEvent);
          // Ensure start is invoked after selection is applied
          start().catch(() => {});
        } else {
          // No explicit mode provided — just try to start current mode
          start().catch(() => {});
        }
      } catch {}
    };
    window.addEventListener("ndn:start-camera" as any, onStart as any);
    return () => {
      window.removeEventListener("ndn:start-camera" as any, onStart as any);
    };
  }, [start, handleModeSelect]);

  // Phone pairing via WebRTC
  function ensureWS() {
    if (ws && ws.readyState === WebSocket.OPEN) return ws;
    const url = getPreferredWsUrl();
    const socket = new WebSocket(url);
    setWs(socket);
    return socket;
  }
  async function startPhonePairing() {
    setMode("phone");
    setPaired(false);
    const socket = ensureWS();
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "cam-create" }));
    } else {
      socket.onopen = () => socket.send(JSON.stringify({ type: "cam-create" }));
    }
    socket.onmessage = async (ev) => {
      const data = JSON.parse(ev.data);
      if (data.type === "cam-code") {
        setPairCode(data.code);
        if (data.expiresAt) setExpiresAt(data.expiresAt);
      } else if (data.type === "cam-peer-joined") {
        setPaired(true);
        // Create offer to the phone
        const peer = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        setPc(peer);
        peer.onicecandidate = (e) => {
          if (e.candidate && pairCode)
            socket.send(
              JSON.stringify({
                type: "cam-ice",
                code: pairCode,
                payload: e.candidate,
              }),
            );
        };
        peer.ontrack = (ev) => {
          if (videoRef.current) {
            const inbound = ev.streams?.[0];
            if (inbound) {
              videoRef.current.srcObject = inbound;
              videoRef.current.play().catch(() => {});
              // Promote the inbound phone stream to the global camera session so
              // other surfaces (pre-game popup, overlays, status badges) can
              // immediately reuse it.
              try {
                registerStream(inbound, "phone");
                cameraSession.setVideoElementRef?.(videoRef.current);
              } catch {}
              setStreaming(true);
            }
          }
        };
        const offer = await peer.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: true,
        });
        await peer.setLocalDescription(offer);
        if (pairCode)
          socket.send(
            JSON.stringify({
              type: "cam-offer",
              code: pairCode,
              payload: offer,
            }),
          );
      } else if (data.type === "cam-answer") {
        if (pc)
          await pc.setRemoteDescription(
            new RTCSessionDescription(data.payload),
          );
      } else if (data.type === "cam-ice") {
        if (pc)
          try {
            await pc.addIceCandidate(data.payload);
          } catch {}
      }
    };
  }
  function regenerateCode() {
    setPairCode(null);
    setExpiresAt(null);
    setPaired(false);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "cam-create" }));
    } else {
      startPhonePairing();
    }
    try {
      setPreferredCameraLocked(true);
    } catch {}
  }

  function stopAll() {
    stop();
    setPairCode(null);
    setPaired(false);
    setExpiresAt(null);
    if (pc) {
      try {
        pc.close();
      } catch {}
      setPc(null);
    }
  }
  return (
    <CameraFrame
      label={label}
      autoStart={autoStart}
      start={start}
      stopAll={stopAll}
      startPhonePairing={startPhonePairing}
      startWifiConnection={startWifiConnection}
      startUsbConnection={startUsbConnection}
      connectToWifiDevice={connectToWifiDevice}
      connectToUsbDevice={connectToUsbDevice}
      videoRef={videoRef}
      streaming={streaming}
      mode={mode}
      setMode={setMode}
      pairCode={pairCode}
      mobileUrl={mobileUrl}
      regenerateCode={regenerateCode}
      httpsInfo={httpsInfo}
      showTips={showTips}
      setShowTips={setShowTips}
      wifiDevices={wifiDevices}
      usbDevices={usbDevices}
      discoveringWifi={discoveringWifi}
      discoveringUsb={discoveringUsb}
      scaleOverride={scaleOverrideProp}
      tileFitModeOverride={tileFitModeOverrideProp}
      className={className}
      aspect={aspect}
      style={style}
      fill={fill}
      onModeSelect={handleModeSelect}
      preferredCameraLocked={preferredCameraLocked}
    />
  );
}

function CameraFrame(props: any) {
  const cameraSession = useCameraSession();
  const { cameraScale, cameraAspect: storedAspect } = useUserSettings();
  const {
    label,
    start,
    stopAll,
    startPhonePairing,
    startWifiConnection,
    startUsbConnection,
    connectToWifiDevice,
    connectToUsbDevice,
    videoRef,
    streaming,
    mode,
    setMode,
    onModeSelect,
    pairCode,
    mobileUrl,
    regenerateCode,
    httpsInfo,
    showTips,
    setShowTips,
    wifiDevices,
    usbDevices,
    discoveringWifi,
    discoveringUsb,
    scaleOverride,
    tileFitModeOverride,
    className,
    aspect,
    style,
    fill,
    preferredCameraLocked,
  } = props;

  const modeDisplayName: Record<string, string> = {
    local: "Local",
    phone: "PhoneCam",
    wifi: "Wi-Fi/USB",
  };

  const reconnectOptions = useMemo(() => {
    return [
      {
        id: "local",
        title: "Local camera",
        description: "Use the desktop webcam or capture card.",
        action: () => {
          if (onModeSelect) onModeSelect("local");
        },
      },
      {
        id: "phone",
        title: "PhoneCam",
        description: "Stream from your phone via the mobile link.",
        action: () => {
          if (onModeSelect) onModeSelect("phone");
        },
      },
      {
        id: "wifi",
        title: "Wi-Fi/USB",
        description: "Connect to scoring devices on your local network.",
        action: () => {
          if (onModeSelect) onModeSelect("wifi");
        },
      },
      {
        id: "usb",
        title: "USB",
        description: "Connect a USB capture device (treated like WiFi mode).",
        action: () => {
          if (onModeSelect) onModeSelect("usb");
        },
      },
    ];
  }, [
    setMode,
    start,
    startPhonePairing,
    startWifiConnection,
    startUsbConnection,
  ]);

  const [copyFeedback, setCopyFeedback] = useState<"link" | "code" | null>(
    null,
  );
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Respect stored aspect unless we're explicitly in full-bleed fill mode,
  // in which case drop the aspect box so the video can truly cover the area.
  const { cameraFitMode: globalFitMode } = useUserSettings();
  const effectiveFitMode: "fit" | "fill" =
    tileFitModeOverride || (fill ? "fill" : globalFitMode || "fill");
  // In fill mode we guarantee no black bars: never allow downscaling below 1.0
  const scale = (() => {
    const raw = Number(scaleOverride ?? cameraScale ?? 1);
    const clamped = Math.max(0.5, Math.min(2.0, raw));
    return effectiveFitMode === "fill" ? Math.max(1, clamped) : clamped;
  })();
  const aspectChoice: "wide" | "square" | "portrait" | "classic" | "free" =
    fill && effectiveFitMode === "fill"
      ? "free"
      : aspect && aspect !== "inherit"
        ? aspect
        : (storedAspect as any) || "wide";

  const shouldMaintainAspect = aspectChoice !== "free";
  const aspectClass = shouldMaintainAspect
    ? aspectChoice === "square"
      ? "aspect-square"
      : aspectChoice === "portrait"
        ? "aspect-[3/4]"
        : aspectChoice === "classic"
          ? "aspect-[4/3]"
          : "aspect-video"
    : "";

  const containerBase = fill
    ? "rounded-3xl overflow-hidden bg-transparent w-full flex flex-col shadow-2xl border border-slate-700/30"
    : "rounded-3xl overflow-hidden bg-transparent w-full mx-auto flex flex-col shadow-2xl border border-slate-700/30";
  const containerClass = [containerBase, className]
    .filter(Boolean)
    .join(" ")
    .trim();
  const containerStyle: CSSProperties = { ...(style || {}) };

  const viewportClass = fill
    ? "relative flex-1 min-h-0 bg-black"
    : "relative w-full bg-black";

  const commonVideoProps = {
    style: { transform: `scale(${scale})`, transformOrigin: "center" as const },
  };

  const usbActive =
    mode === "wifi" && usbDevices.some((d: USBDevice) => d.status === "online");

  const videoElement = (() => {
    // Apply Fit/Fill preference (fill prop hard-overrides to full-bleed)
    const isFit = effectiveFitMode === "fit";
    const baseVideoClass = isFit
      ? // Fit: preserve entire frame (may letterbox)
        "absolute inset-0 w-full h-full object-contain object-center bg-transparent"
      : // Fill: guarantee full coverage with object-cover so there are no black bars
        "absolute inset-0 w-full h-full object-cover object-center bg-transparent";
    if (fill) {
      if (shouldMaintainAspect) {
        return (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`relative w-full max-w-full max-h-full ${aspectClass}`}
            >
              <video
                ref={videoRef}
                className={baseVideoClass}
                {...commonVideoProps}
                autoPlay
                playsInline
                muted
              />
            </div>
          </div>
        );
      }
      return (
        <video
          ref={videoRef}
          className={baseVideoClass}
          {...commonVideoProps}
          autoPlay
          playsInline
          muted
        />
      );
    }
    if (shouldMaintainAspect) {
      return (
        <div className={`relative w-full ${aspectClass}`}>
          <video
            ref={videoRef}
            className={baseVideoClass}
            {...commonVideoProps}
            autoPlay
            playsInline
            muted
          />
        </div>
      );
    }
    return (
      <div className="relative w-full">
        <video
          ref={videoRef}
          className={baseVideoClass}
          {...commonVideoProps}
          autoPlay
          playsInline
          muted
        />
      </div>
    );
  })();

  async function copyValue(
    value: string | null | undefined,
    type: "link" | "code",
  ) {
    if (!value) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopyFeedback(type);
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(
        () => setCopyFeedback(null),
        1500,
      );
    } catch (err) {
      console.warn("Copy to clipboard failed:", err);
      setCopyFeedback(null);
    }
  }

  return (
    <div className={containerClass} style={containerStyle}>
      <div className={viewportClass}>
        {videoElement}
        {cameraSession.isStreaming && mode === "phone" && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur border border-rose-500/60 text-xs text-rose-200 font-semibold shadow-lg">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <span>REC</span>
          </div>
        )}
      </div>
      <div className="px-3 py-2 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 text-white text-[11px] gap-2 border-t border-slate-700/50">
        <span className="truncate font-medium">
          {label ||
            (streaming
              ? mode === "phone"
                ? "PHONE LIVE"
                : mode === "wifi"
                  ? "WIFI LIVE"
                  : "LIVE"
              : "Camera")}
          {preferredCameraLocked && (
            <span className="ml-2 text-xs opacity-80">🔒</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {!streaming && (
            <>
              <button
                className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${mode === "local" ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}
                onClick={() => onModeSelect("local")}
              >
                Local
              </button>
              <button
                className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${mode === "phone" ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}
                onClick={() => onModeSelect("phone")}
              >
                Phone
              </button>
              <button
                className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${mode === "wifi" ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}
                onClick={() => onModeSelect("wifi")}
              >
                WiFi
              </button>
              <button
                className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${mode === "wifi" ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-200 hover:bg-slate-600"}`}
                onClick={() => onModeSelect("usb")}
              >
                USB
              </button>
            </>
          )}
          {streaming ? (
            <button
              className="px-2 py-1 rounded-md text-xs font-semibold bg-rose-500 text-white hover:bg-rose-600 transition-all"
              onClick={stopAll}
            >
              Stop
            </button>
          ) : null}
        </div>
      </div>
      {mode === "phone" && pairCode && !streaming && (
        <div className="p-2 text-white text-[10px] bg-black/50">
          <div className="text-xs opacity-80">Launch on your mobile:</div>
          <button
            type="button"
            className="mt-1 w-full text-left px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center gap-2"
            onClick={() => copyValue(mobileUrl, "link")}
            title="Copy mobile camera link"
          >
            <span className="flex-1 min-w-0 font-mono break-all">
              {mobileUrl}
            </span>
            <span className="text-[9px] uppercase tracking-wide whitespace-nowrap text-emerald-200">
              {copyFeedback === "link" ? "Copied!" : "Copy"}
            </span>
          </button>
          <div className="mt-1 flex items-center gap-2">
            <a
              href={mobileUrl}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-1 rounded border border-indigo-500/30 text-indigo-100 hover:bg-indigo-500/20 transition"
            >
              Open link
            </a>
            <button
              type="button"
              className="flex-1 text-left px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition flex items-center justify-between gap-2"
              onClick={() => copyValue(pairCode, "code")}
              title="Copy pairing code"
            >
              <span className="font-mono tracking-[0.3em] text-sm">
                {pairCode}
              </span>
              <span className="text-[9px] uppercase tracking-wide whitespace-nowrap text-emerald-200">
                {copyFeedback === "code" ? "Copied!" : "Copy"}
              </span>
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <button
              className="px-1 py-0.5 rounded bg-slate-700"
              onClick={regenerateCode}
            >
              Regenerate
            </button>
          </div>
          {showTips && (
            <div className="mt-2 p-2 rounded bg-slate-900/60 border border-slate-700/50 text-slate-200">
              <div className="font-semibold mb-1">Troubleshooting</div>
              <ul className="list-disc pl-4 space-y-1">
                <li>Phone and desktop must be on the same Wi-Fi network.</li>
                <li>
                  Allow the server through your firewall (ports 8787 and{" "}
                  {httpsInfo?.https ? httpsInfo.port : 8788}).
                </li>
                <li>
                  On iPhone, use HTTPS links (QR will prefer https when
                  enabled).
                </li>
              </ul>
              <div className="mt-2 text-right">
                <button
                  className="btn btn--ghost px-2 py-1 text-xs"
                  onClick={() => setShowTips(false)}
                >
                  Hide tips
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {mode === "wifi" && !streaming && (
        <div className="p-2 text-white text-[10px] bg-black/50">
          <div className="font-semibold mb-2">Scoring Devices</div>

          {/* WiFi Devices */}
          <div className="mb-3">
            <div className="font-medium mb-1">WiFi Devices</div>
            {discoveringWifi ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                <span>Scanning network...</span>
              </div>
            ) : wifiDevices.length > 0 ? (
              <div className="space-y-1">
                {wifiDevices.map((device: NetworkDevice) => (
                  <div
                    key={device.id}
                    className="flex items-center justify-between p-1 rounded bg-slate-900/60"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{device.name}</div>
                      <div className="opacity-70 text-[9px]">
                        {device.ip}:{device.port}
                      </div>
                    </div>
                    <button
                      className={`px-1 py-0.5 rounded text-[9px] ${
                        device.status === "connecting"
                          ? "bg-yellow-600"
                          : device.status === "online"
                            ? "bg-green-600"
                            : "bg-blue-600"
                      }`}
                      onClick={() => connectToWifiDevice(device)}
                      disabled={device.status === "connecting"}
                    >
                      {device.status === "connecting" ? "..." : "Connect"}
                    </button>
                  </div>
                ))}
                <div className="text-center mt-2">
                  <button
                    className="px-1 py-0.5 rounded bg-slate-700 text-[9px]"
                    onClick={startWifiConnection}
                  >
                    Rescan WiFi
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-1 opacity-70">No WiFi devices found</div>
                <button
                  className="px-1 py-0.5 rounded bg-slate-700 text-[9px]"
                  onClick={startWifiConnection}
                >
                  Scan WiFi
                </button>
              </div>
            )}
          </div>

          {/* USB Devices */}
          <div>
            <div className="font-medium mb-1">USB Devices</div>
            {discoveringUsb ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                <span>Scanning USB...</span>
              </div>
            ) : usbDevices.length > 0 ? (
              <div className="space-y-1">
                {usbDevices.map((device: USBDevice) => (
                  <div
                    key={device.id}
                    className="flex items-center justify-between p-1 rounded bg-slate-900/60"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{device.name}</div>
                      <div className="opacity-70 text-[9px]">
                        {device.type.toUpperCase()}
                      </div>
                    </div>
                    <button
                      className={`px-1 py-0.5 rounded text-[9px] ${
                        device.status === "connecting"
                          ? "bg-yellow-600"
                          : device.status === "online"
                            ? "bg-green-600"
                            : "bg-blue-600"
                      }`}
                      onClick={() => connectToUsbDevice(device)}
                      disabled={device.status === "connecting"}
                    >
                      {device.status === "connecting" ? "..." : "Connect 🔌"}
                    </button>
                  </div>
                ))}
                <div className="text-center mt-2">
                  <button
                    className="px-1 py-0.5 rounded bg-slate-700 text-[9px]"
                    onClick={startUsbConnection}
                  >
                    Rescan USB 🔍
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-1 opacity-70">No USB devices found ❌</div>
                <button
                  className="px-1 py-0.5 rounded bg-slate-700 text-[9px]"
                  onClick={startUsbConnection}
                >
                  Scan USB 🔍
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {!streaming && (
        <div className="mt-3 p-3 rounded-2xl bg-white border border-slate-200 shadow-sm text-slate-900">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                Camera modes ⚙️
              </div>
              <div className="text-sm font-semibold text-slate-900">
                Reconnect camera 🔄
              </div>
            </div>
            <span className="text-xs text-slate-500">
              Current: {modeDisplayName[mode] || "Local"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-2">
            Tap a mode to restart the feed or switch inputs.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {reconnectOptions.map((option) => {
              const isActive =
                option.id === "usb" ? usbActive : option.id === mode;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={option.action}
                  className={`text-left p-3 rounded-2xl border ${isActive ? "border-emerald-500 bg-emerald-50 shadow" : "border-slate-200 bg-white/80 hover:bg-slate-50"} transition`}
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {option.title}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    {option.description}
                  </div>
                  {isActive && (
                    <div className="text-[10px] text-emerald-500 mt-2">
                      Active ✅
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
