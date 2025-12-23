const fallbackRemoteEnv =
  ((import.meta as any)?.env?.VITE_REMOTE_WS_FALLBACK as string | undefined) ||
  "";

const DEFAULT_REMOTE_WS = "wss://ninedartnation.onrender.com/ws";
const REMOTE_WS_FALLBACK = normalizeWsUrl(
  fallbackRemoteEnv.trim() || DEFAULT_REMOTE_WS,
);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DEV_SERVICE_PORT = 8787;
const ALT_DEV_PORT = 3000;

function normalizeWsUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/\/ws$/i.test(trimmed)) return trimmed;
  return `${trimmed.replace(/\/$/, "")}/ws`;
}

function extractHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalHost(host: string | null | undefined) {
  return !!host && LOCAL_HOSTS.has(host);
}

let cachedWsUrl: string | null = null;

function computePreferredWsUrl(): string {
  if (cachedWsUrl) return cachedWsUrl;
  const envUrl = (
    (import.meta as any)?.env?.VITE_WS_URL as string | undefined
  )?.trim();
  if (envUrl) {
    const normalized = normalizeWsUrl(envUrl);
    if (typeof window !== "undefined") {
      const envHost = extractHost(normalized);
      const pageHost = window.location.hostname;
      if (isLocalHost(envHost) && !isLocalHost(pageHost)) {
        cachedWsUrl = REMOTE_WS_FALLBACK;
        return cachedWsUrl;
      }
    }
    cachedWsUrl = normalized;
    return cachedWsUrl;
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.hostname;
    const sameOrigin = `${proto}://${window.location.host}/ws`;
    if (isLocalHost(host)) {
      cachedWsUrl = `${proto}://${host}:${DEV_SERVICE_PORT}/ws`;
    } else if (host.endsWith("onrender.com")) {
      cachedWsUrl = sameOrigin;
    } else if (host.endsWith("netlify.app")) {
      cachedWsUrl = REMOTE_WS_FALLBACK;
    } else {
      cachedWsUrl = REMOTE_WS_FALLBACK;
    }
    return cachedWsUrl;
  }
  cachedWsUrl = REMOTE_WS_FALLBACK;
  return cachedWsUrl;
}

export function getPreferredWsUrl(): string {
  return computePreferredWsUrl();
}

export function getWsCandidates(): string[] {
  if (typeof window === "undefined") return [getPreferredWsUrl()];
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.hostname;
  const withPort = window.location.host;
  const preferred = getPreferredWsUrl();
  const candidates = new Set<string>([
    preferred,
    `${proto}://${withPort}/ws`,
    `${proto}://${host}/ws`,
    `${proto}://${host}:${DEV_SERVICE_PORT}/ws`,
    `${proto}://${host}:${ALT_DEV_PORT}/ws`,
    REMOTE_WS_FALLBACK,
  ]);
  return Array.from(candidates).filter(Boolean);
}
