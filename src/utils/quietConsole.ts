import { isDev } from "./logger.js";

/**
 * Suppresses known-noisy console output that can flood the console in dev and
 * look like "the feed is broken" even though camera rendering is unaffected.
 *
 * NOTE: This does NOT hide real exceptions; it only filters specific, repeated
 * browser/network/WS messages that are expected in some environments.
 */
export function installQuietConsole() {
  // Keep production transparent unless explicitly enabled.
  const enabled =
    isDev ||
    String((import.meta as any).env?.VITE_QUIET_CONSOLE || "").trim() === "1";
  if (!enabled) return;

  // Avoid double-installation.
  const w = window as any;
  if (w.__ndnQuietConsoleInstalled) return;
  w.__ndnQuietConsoleInstalled = true;

  const originals = {
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    log: console.log.bind(console),
  };

  const shouldSuppress = (args: any[]) => {
    const msg = args
      .map((a) => (typeof a === "string" ? a : a?.message || ""))
      .join(" ");

    // These are common and non-fatal:
    // - WebSocket reconnect failures when offline
    // - browser network transitions
    // - jsdom/test media play not implemented
    if (/Not implemented: HTMLMediaElement's play\(\) method/i.test(msg))
      return true;
    if (/WebSocket connection to .* failed/i.test(msg)) return true;
    if (/ERR_NETWORK_IO_SUSPENDED|ERR_NETWORK_CHANGED/i.test(msg)) return true;

    // Do NOT suppress application errors.
    return false;
  };

  // Rate-limit repeated messages (by first string chunk)
  const lastPrintedAt = new Map<string, number>();
  const RATE_MS = 2000;

  const wrap =
    (fn: (...a: any[]) => void) =>
    (...args: any[]) => {
      if (shouldSuppress(args)) return;
      const key = String(args[0] ?? "");
      const now = Date.now();
      const last = lastPrintedAt.get(key) || 0;
      if (now - last < RATE_MS) return;
      lastPrintedAt.set(key, now);
      fn(...args);
    };

  console.error = wrap(originals.error) as any;
  console.warn = wrap(originals.warn) as any;
  // leave console.log alone unless it becomes a problem

  // Also prevent "Unhandled promise rejection" style errors from being silent
  // killers—log once, but don't spam.
  window.addEventListener("unhandledrejection", (ev) => {
    const msg =
      (ev.reason && (ev.reason.message || String(ev.reason))) ||
      "unhandledrejection";
    const now = Date.now();
    const last = lastPrintedAt.get(msg) || 0;
    if (now - last < RATE_MS) return;
    lastPrintedAt.set(msg, now);
    originals.warn("[ndn] Unhandled promise rejection:", ev.reason);
  });
}
