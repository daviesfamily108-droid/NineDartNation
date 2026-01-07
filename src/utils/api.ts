export type ApiPath = string;

let cachedBaseUrl: string | null = null;
const fallbackRemoteEnv =
  ((import.meta as any)?.env?.VITE_REMOTE_API_FALLBACK as string | undefined) ||
  "";
const REMOTE_API_FALLBACK = (
  fallbackRemoteEnv.trim() || "https://ninedartnation-1.onrender.com"
).replace(/\/$/, "");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function computeApiBase(): string {
  if (cachedBaseUrl) return cachedBaseUrl;
  const envUrl = (
    (import.meta as any)?.env?.VITE_API_URL as string | undefined
  )?.trim();
  if (envUrl) {
    const normalized = envUrl.replace(/\/$/, "");
    if (
      typeof window !== "undefined" &&
      /https?:\/\/(localhost|127\.0\.0\.1)(:\\d+)?/i.test(normalized) &&
      !LOCAL_HOSTS.has(window.location.hostname)
    ) {
      cachedBaseUrl = REMOTE_API_FALLBACK;
      return cachedBaseUrl;
    }
    cachedBaseUrl = normalized;
    return cachedBaseUrl;
  }
  if (typeof window !== "undefined") {
    const { protocol, host, hostname } = window.location;
    const sameOrigin = `${protocol}//${host}`;
    if (
      hostname.endsWith("onrender.com") ||
      hostname === "localhost" ||
      hostname === "127.0.0.1"
    ) {
      cachedBaseUrl = sameOrigin.replace(/\/$/, "");
    } else {
      cachedBaseUrl = REMOTE_API_FALLBACK;
    }
    return cachedBaseUrl;
  }
  // Fallback for build/test environments without window
  cachedBaseUrl = REMOTE_API_FALLBACK;
  return cachedBaseUrl;
}

function normalizePath(path: ApiPath): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = computeApiBase();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export function resolveApiUrl(path: ApiPath): string {
  return normalizePath(path);
}

export function getApiBaseUrl(): string {
  return computeApiBase();
}

export function apiFetch(path: ApiPath, init?: RequestInit) {
  const url = resolveApiUrl(path);
  return fetch(url, init);
}

export function installApiInterceptor() {
  if (typeof window === "undefined" || typeof window.fetch !== "function")
    return;
  const anyWindow = window as typeof window & { __ndnApiPatched?: boolean };
  if (anyWindow.__ndnApiPatched) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (typeof input === "string") {
        if (input.startsWith("/")) {
          return originalFetch(resolveApiUrl(input), init);
        }
        return originalFetch(input, init);
      }
      if (input instanceof Request) {
        const reqUrl = input.url.startsWith("/")
          ? resolveApiUrl(input.url)
          : input.url;
        if (reqUrl === input.url) {
          return originalFetch(input, init);
        }
        const cloned = new Request(reqUrl, input);
        return originalFetch(cloned, init);
      }
      if (input instanceof URL) {
        const href = input.href.startsWith("/")
          ? resolveApiUrl(input.href)
          : input.href;
        return originalFetch(href, init);
      }
    } catch (err) {
      console.warn(
        "[API] Interceptor failed, falling back to original fetch",
        err,
      );
    }
    return originalFetch(input as any, init);
  };
  anyWindow.__ndnApiPatched = true;
}
