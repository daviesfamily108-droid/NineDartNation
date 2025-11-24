// Test setup hooks for Vitest
// Provide a harmless global.fetch fallback for tests to avoid "Invalid URL" warnings
// when code calls fetch with a relative URL (Node's fetch requires an absolute URL).
// The mock is intentionally conservative: it returns a basic successful JSON response.
// Tests can override it with more specific behavior if needed.

// No-op body: if fetch exists, keep it. Otherwise add a minimal stub.
{
  // Wrap an existing fetch so we can prefix relative paths to avoid undici errors
  const originalFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (input: any, init?: any) => {
    try {
      const url = String(input);
      // If input is a relative path (starts with /), avoid calling the real network in tests
      if (url.startsWith("/")) {
        // Return a safe stubbed response rather than invoking real network
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => "",
        };
      }
      if (originalFetch) return originalFetch(url, init);
    } catch {}
    // Fallback stubbed response
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    };
  };
}

// Setup jest DOM matchers
import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";
import { afterEach } from "vitest";

// Provide a small helper to globally silence noisy, known harmless warnings if desired
// (OPTIONAL) You can add additional filters or transforms here in the future.

// Mock react-focus-lock to a no-op in tests to avoid asynchronous focus management warnings
vi.mock("react-focus-lock", () => ({
  default: ({ children }: any) => React.createElement("div", null, children),
}));

// Ensure a robust localStorage stub is present for tests that import persisted stores
if (typeof (globalThis as any).localStorage === "undefined") {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: (i: number) => Object.keys(store)[i] || null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
}

// Polyfill matchMedia for the jsdom environment used by Vitest
if (typeof (globalThis as any).matchMedia !== "function") {
  (globalThis as any).matchMedia = (query: string) => {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  };
}

// Polyfill MediaStream for jsdom so components that check srcObject instanceof MediaStream work
if (typeof (globalThis as any).MediaStream === "undefined") {
  (globalThis as any).MediaStream = class {
    getTracks() { return []; }
    addTrack() {}
    removeTrack() {}
  };
}

// Minimal navigator.mediaDevices.getUserMedia stub
if (typeof (globalThis as any).navigator?.mediaDevices === "undefined") {
  (globalThis as any).navigator = (globalThis as any).navigator || {};
  (globalThis as any).navigator.mediaDevices = {
    getUserMedia: async (_: any) => new (globalThis as any).MediaStream(),
  };
}

// Polyfill createImageBitmap to short-circuit actual bitmap creation in tests
// and to support the detection worker path which posts bitmaps.
if (typeof (globalThis as any).createImageBitmap !== "function") {
  (globalThis as any).createImageBitmap = async (canvas: any) => {
    // Return the source canvas as a stand-in for ImageBitmap; tests and worker
    // polyfills consult the payload rather than requiring a real ImageBitmap.
    return canvas;
  };
}

// Lightweight Worker polyfill to allow modules that spawn workers to run in the
// Node/Vitest environment. Tests can optionally set `globalThis.__TEST_WORKER_HANDLER`
// to control the worker response for detect requests in Calibrator tests.
if (typeof (globalThis as any).Worker === "undefined") {
  class TestWorker {
    listeners: Record<string, Function[]> = {};
    onmessage: ((ev: any) => void) | null = null;
    constructor(_url?: string, _opts?: any) {
      // no-op
    }
    addEventListener(name: string, cb: Function) {
      this.listeners[name] = this.listeners[name] || [];
      this.listeners[name].push(cb);
    }
    removeEventListener(name: string, cb: Function) {
      if (!this.listeners[name]) return;
      this.listeners[name] = this.listeners[name].filter((f) => f !== cb);
    }
    postMessage(msg: any, _transfer?: any) {
      // Run asynchronously to mimic real worker behavior. Tests can set
      // `globalThis.__TEST_WORKER_HANDLER = (msg) => ({ type: 'result', detection })`
      // to return custom results. Otherwise send a fallback 'error' message.
      setTimeout(() => {
        try {
          const handler = (globalThis as any).__TEST_WORKER_HANDLER;
          if (typeof handler === "function") {
            const res = handler(msg);
            if (this.listeners["message"]) {
              this.listeners["message"].forEach((cb) => cb({ data: res }));
            }
            if (this.onmessage) this.onmessage({ data: res } as any);
            return;
          }
        } catch (err) {
          // ignore
        }
        const res = { error: "no test worker handler installed" };
        if (this.listeners["message"]) {
          this.listeners["message"].forEach((cb) => cb({ data: res }));
        }
        if (this.onmessage) this.onmessage({ data: res } as any);
      }, 0);
    }
    terminate() {}
    // mimic Worker.prototype.postMessage signature
  }
  (globalThis as any).Worker = TestWorker;
}

// Very small CanvasRenderingContext2D stub for jsdom to allow getContext('2d') calls in unit tests
// Replace getContext unconditionally with a small 2D context stub for tests
{
  const fakeCtx: any = {
    clearRect: () => undefined,
    fillRect: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    arc: () => undefined,
    stroke: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
  setLineDash: () => undefined,
    fillText: () => undefined,
    measureText: () => ({ width: 0 }),
    getImageData: (x: number, y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => undefined,
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    drawImage: () => undefined,
    setTransform: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    scale: () => undefined,
    strokeStyle: "#000",
    lineWidth: 1,
  };
  HTMLCanvasElement.prototype.getContext = function (type: string) {
    if (type === "2d") return fakeCtx;
    return null as any;
  } as any;
}

// Global test cleanup: remove any left-over portals, root elements, and clear mocks/timers
afterEach(() => {
  try {
    // Remove any match-start portals (used by MatchStartShowcase)
    const portals = Array.from(document.querySelectorAll('.ndn-match-start-portal'));
    portals.forEach((p) => p.parentElement?.removeChild(p));
  } catch {}

  try {
    const root = document.getElementById('root');
    if (root && root.parentElement) root.parentElement.removeChild(root);
  } catch {}

  try {
    // Reset document body to a clean state for the next test.
    document.body.innerHTML = "";
  } catch {}

  try {
    // Clear localStorage between tests
    try { (globalThis as any).localStorage?.clear?.(); } catch {}
  } catch {}

  // Reset Vitest mocks and timers
  try { vi.resetAllMocks(); } catch {}
  try { vi.restoreAllMocks(); } catch {}
  try { vi.useRealTimers(); } catch {}
});
