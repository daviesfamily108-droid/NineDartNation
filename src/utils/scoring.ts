// Generic autoscore provider helpers: parse vendor-agnostic payloads and subscribe via WebSocket

export type Ring =
  | "MISS"
  | "SINGLE"
  | "DOUBLE"
  | "TRIPLE"
  | "BULL"
  | "INNER_BULL";
export type ParsedDart = {
  value: number;
  ring: Ring;
  sector?: number | null;
  mult?: 0 | 1 | 2 | 3;
  // Optional provider confidence. Prefer 0..1 when available.
  // If a provider sends 0..100, we normalize it to 0..1.
  confidence?: number;
};

// Try to parse a variety of vendor payload shapes
export function parseExternalDart(data: any): ParsedDart | null {
  try {
    if (!data || typeof data !== "object") return null;
    const rawConf = (data as any).confidence;
    const conf =
      typeof rawConf === "number" && Number.isFinite(rawConf)
        ? rawConf > 1
          ? Math.max(0, Math.min(1, rawConf / 100))
          : Math.max(0, Math.min(1, rawConf))
        : undefined;
    // 1) { type:'dart', value: <0-60>, ring: 'SINGLE'|'DOUBLE'|... }
    if (
      (data.type === "dart" || data.kind === "dart" || data.event === "dart") &&
      typeof data.value === "number"
    ) {
      const ring = normalizeRing(data.ring);
      const base = finalizeFromValue(data.value, ring);
      return base ? { ...base, confidence: conf } : null;
    }
    // 2) { value, ring }
    if (typeof data.value === "number" && data.ring) {
      const ring = normalizeRing(data.ring);
      const base = finalizeFromValue(data.value, ring);
      return base ? { ...base, confidence: conf } : null;
    }
    // 3) { score: 'T20'|'D16'|'S5'|'25'|'50' }
    if (typeof data.score === "string") {
      const s = data.score.trim().toUpperCase();
      if (s === "50" || s === "DBULL" || s === "INNER_BULL")
        return {
          value: 50,
          ring: "INNER_BULL",
          sector: null,
          mult: 0,
          confidence: conf,
        };
      if (s === "25" || s === "BULL" || s === "OBULL")
        return {
          value: 25,
          ring: "BULL",
          sector: null,
          mult: 0,
          confidence: conf,
        };
      const m = s.match(/^(S|D|T)(\d{1,2})$/);
      if (m) {
        const mult = m[1] === "S" ? 1 : m[1] === "D" ? 2 : 3;
        const sec = parseInt(m[2], 10);
        if (sec >= 1 && sec <= 20)
          return {
            value: sec * mult,
            ring: mult === 1 ? "SINGLE" : mult === 2 ? "DOUBLE" : "TRIPLE",
            sector: sec,
            mult: mult as 1 | 2 | 3,
            confidence: conf,
          };
      }
    }
    // 4) { sector: 1..20, mult: 1|2|3 }
    if (typeof data.sector === "number" && typeof data.mult === "number") {
      const sec = Math.max(1, Math.min(20, Math.floor(data.sector)));
      const mul = data.mult === 1 ? 1 : data.mult === 2 ? 2 : 3;
      return {
        value: sec * mul,
        ring: mul === 1 ? "SINGLE" : mul === 2 ? "DOUBLE" : "TRIPLE",
        sector: sec,
        mult: mul as 1 | 2 | 3,
        confidence: conf,
      };
    }
    // 5) { bull: 'outer'|'inner'|true }
    if (data.bull) {
      const inner =
        String(data.bull).toLowerCase() === "inner" || data.bull === true;
      return {
        value: inner ? 50 : 25,
        ring: inner ? "INNER_BULL" : "BULL",
        sector: null,
        mult: 0,
        confidence: conf,
      };
    }
  } catch {}
  return null;
}

function normalizeRing(r: any): Ring {
  const s = String(r || "").toUpperCase();
  if (s.startsWith("TR")) return "TRIPLE";
  if (s.startsWith("DO")) return "DOUBLE";
  if (s.startsWith("SI")) return "SINGLE";
  if (s === "INNER_BULL" || s === "DBULL" || s === "50" || s === "IBULL")
    return "INNER_BULL";
  if (s === "BULL" || s === "25" || s === "OBULL" || s === "OUTER_BULL")
    return "BULL";
  if (s === "MISS" || s === "0") return "MISS";
  return "SINGLE";
}

function finalizeFromValue(value: number, ring: Ring): ParsedDart | null {
  const v = Math.max(0, Math.min(60, Math.round(Number(value) || 0)));
  if (ring === "INNER_BULL") return { value: 50, ring };
  if (ring === "BULL") return { value: 25, ring };
  // Best-effort: preserve base if consistent with ring
  return { value: v, ring };
}

export type ExternalSub = { close: () => void };

export function subscribeExternalWS(
  url: string,
  onDart: (d: ParsedDart) => void,
): ExternalSub {
  let socket: WebSocket | null = null;
  let alive = true;
  // Lightweight duplicate suppression: ignore exact repeat within a short window
  let lastSig: string | null = null;
  let lastSigAt = 0;
  const DEDUP_WINDOW_MS = 400;
  // Optional ID-based dedup if provider sends unique ids
  const seenIds: string[] = [];
  const seenSet = new Set<string>();

  function considerForward(payload: any, parsed: ParsedDart) {
    // If payload has a stable id, drop if seen
    const pid =
      typeof payload?.id === "string" || typeof payload?.id === "number"
        ? String(payload.id)
        : null;
    if (pid) {
      if (seenSet.has(pid)) return;
      seenSet.add(pid);
      seenIds.push(pid);
      if (seenIds.length > 200) {
        const old = seenIds.shift();
        if (old) seenSet.delete(old);
      }
    }
    // Time-based dedup by signature (safe; darts cannot occur within <400ms)
    const sig = `${parsed.value}|${parsed.ring}|${parsed.sector ?? ""}|${parsed.mult ?? ""}`;
    const now = Date.now();
    if (sig === lastSig && now - lastSigAt < DEDUP_WINDOW_MS) return;
    lastSig = sig;
    lastSigAt = now;
    onDart(parsed);
  }

  function connect() {
    if (!alive) return;
    try {
      socket = new WebSocket(url);
      socket.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          const parsed = parseExternalDart(payload);
          if (parsed) considerForward(payload, parsed);
        } catch {}
      };
      socket.onclose = () => {
        socket = null;
        setTimeout(connect, 1500);
      };
      socket.onerror = () => {
        /* ignore; will reconnect on close */
      };
    } catch {
      setTimeout(connect, 2000);
    }
  }
  connect();
  return {
    close: () => {
      alive = false;
      try {
        socket?.close();
      } catch {}
    },
  };
}
