export type ApiPath = string;

let cachedBaseUrl: string | null = null;

function computeApiBase(): string {
  if (cachedBaseUrl) return cachedBaseUrl;
  const envUrl = ((import.meta as any)?.env?.VITE_API_URL as string | undefined)?.trim();
  if (envUrl) {
    cachedBaseUrl = envUrl.replace(/\/$/, '');
    return cachedBaseUrl;
  }
  if (typeof window !== 'undefined') {
    const { protocol, host, hostname } = window.location;
    const sameOrigin = `${protocol}//${host}`;
    if (hostname.endsWith('onrender.com') || hostname === 'localhost' || hostname === '127.0.0.1') {
      cachedBaseUrl = sameOrigin.replace(/\/$/, '');
    } else {
      cachedBaseUrl = 'https://ninedartnation.onrender.com';
    }
    return cachedBaseUrl;
  }
  // Fallback for build/test environments without window
  cachedBaseUrl = 'https://ninedartnation.onrender.com';
  return cachedBaseUrl;
}

function normalizePath(path: ApiPath): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = computeApiBase();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export function resolveApiUrl(path: ApiPath): string {
  return normalizePath(path);
}

export function apiFetch(path: ApiPath, init?: RequestInit) {
  const url = resolveApiUrl(path);
  return fetch(url, init);
}

export function installApiInterceptor() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  const anyWindow = window as typeof window & { __ndnApiPatched?: boolean };
  if (anyWindow.__ndnApiPatched) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (typeof input === 'string') {
        if (input.startsWith('/')) {
          return originalFetch(resolveApiUrl(input), init);
        }
        return originalFetch(input, init);
      }
      if (input instanceof Request) {
        const reqUrl = input.url.startsWith('/') ? resolveApiUrl(input.url) : input.url;
        if (reqUrl === input.url) {
          return originalFetch(input, init);
        }
        const cloned = new Request(reqUrl, input);
        return originalFetch(cloned, init);
      }
      if (input instanceof URL) {
        const href = input.href.startsWith('/') ? resolveApiUrl(input.href) : input.href;
        return originalFetch(href, init);
      }
    } catch (err) {
      console.warn('[API] Interceptor failed, falling back to original fetch', err);
    }
    return originalFetch(input as any, init);
  };
  anyWindow.__ndnApiPatched = true;
}
