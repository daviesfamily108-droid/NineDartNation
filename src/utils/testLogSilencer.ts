// Lightweight, centralized test-only log silencing.
//
// Motivation: Some tests intentionally exercise camera/autoscore flows that emit lots of
// debug logging. In interactive environments (like editor chat consoles), large stdout
// bursts can cause sluggishness or crashes even though the tests pass.
//
// This module should ONLY be imported by the Vitest setup file.

/* eslint-disable no-console */

type ConsoleMethod = (...args: any[]) => void;

export function installTestLogSilencer(opts?: {
  silenceConsoleLog?: boolean;
  silenceConsoleInfo?: boolean;
  silenceConsoleDebug?: boolean;
  keepWarnAndError?: boolean;
  // When set, allow matching messages through even if silenced.
  allow?: RegExp[];
  // Always suppress these messages.
  deny?: RegExp[];
}) {
  if (typeof process === "undefined" || process.env?.NODE_ENV !== "test") return;

  const {
    silenceConsoleLog = true,
    silenceConsoleInfo = true,
    silenceConsoleDebug = true,
    keepWarnAndError = true,
    allow = [],
    deny = [
      /Not implemented: HTMLMediaElement's play\(\) method/i,
      /\[CAMERA\]/i,
      /\[DETECTION\]/i,
      /\[DETECTOR\]/i,
      /^\[Audit:/i,
      /\(node:\d+\) Warning: `--localstorage-file` was provided without a valid path/i,
      /Failed to fetch notifications:/i,
    ],
  } = opts || {};

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    debug: (console as any).debug ? (console as any).debug.bind(console) : console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  const shouldSuppress = (args: any[]) => {
    const msg = String(args?.[0] ?? "");
    if (allow.some((re) => re.test(msg))) return false;
    if (deny.some((re) => re.test(msg))) return true;
    return false;
  };

  const wrap = (name: keyof typeof original, enabled: boolean): ConsoleMethod => {
    const fn = original[name];
    if (!enabled) return fn;
    return (...args: any[]) => {
      if (shouldSuppress(args)) return;
      fn(...args);
    };
  };

  if (silenceConsoleLog) console.log = wrap("log", true);
  if (silenceConsoleInfo) console.info = wrap("info", true);
  if (silenceConsoleDebug) (console as any).debug = wrap("debug", true);

  if (keepWarnAndError) {
    console.warn = wrap("warn", true);
    console.error = wrap("error", true);
  }

  // Expose originals for rare tests that need them
  (globalThis as any).__NDN_ORIGINAL_CONSOLE__ = original;
}
