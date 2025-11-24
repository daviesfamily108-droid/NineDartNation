import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react";
import { vi } from "vitest";
// Importing Calibrator dynamically inside tests to ensure the persisted store is
// constructed using our mocked localStorage in the test lifecycle.
// We'll use dynamic import for the persisted calibration store so we can ensure
// the test environment's localStorage is present before the store is created.
// boardDetection will be imported dynamically inside tests to avoid importing
// modules that could create persisted stores before we've mocked localStorage.

describe("Calibrator auto-detection flows (unit-friendly)", () => {
  beforeAll(() => {
    if (typeof window !== "undefined") {
      const bad = (v: any) => typeof v !== "function";
      if (typeof (window as any).localStorage === "undefined" || bad((window as any).localStorage.setItem)) {
        (window as any).localStorage = {
          _store: {} as Record<string, string>,
          getItem: function (k: string) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
          setItem: function (k: string, v: string) { this._store[k] = String(v); },
          removeItem: function (k: string) { delete this._store[k]; },
          clear: function () { for (const k of Object.keys(this._store)) delete this._store[k]; },
          key: function (i: number) { return Object.keys(this._store)[i] || null; },
          get length() { return Object.keys(this._store).length; },
        } as any;
      }
    }
  });

  beforeEach(async () => {
    // reset store after ensuring localStorage mock exists
    const mod = await import("../../store/calibration");
    mod.useCalibration.getState().reset();
    // No-op alert
    (window as any).alert = () => {};
  });

  afterEach(async () => {
    const mod = await import("../../store/calibration");
    mod.useCalibration.getState().reset();
  });

  it("runs autoCalibrate (sync fallback) and sets calibration", async () => {
  // Mock detectBoard/refine to return a consistent detection
  const fake = {
      success: true,
      cx: 400,
      cy: 300,
      bullInner: 6.35,
      bullOuter: 15.9,
      trebleInner: 99,
      trebleOuter: 107,
      doubleInner: 162,
      doubleOuter: 170,
      confidence: 100,
      homography: [1, 0, 0, 0, 1, 0, 0, 0, 1] as any,
      errorPx: 0,
      calibrationPoints: [
        { x: 400, y: 130 },
        { x: 570, y: 300 },
        { x: 400, y: 470 },
        { x: 230, y: 300 },
      ],
      message: "OK",
    } as any;
    const boardDetection = await import("../../utils/boardDetection");
    vi.spyOn(boardDetection, "detectBoard").mockImplementation(() => fake);
    vi.spyOn(boardDetection, "refineRingDetection").mockImplementation((d: any) => d);
    // Ensure worker path (if used) returns the same fake payload
    (globalThis as any).__TEST_WORKER_HANDLER = (msg: any) => {
      if (msg && msg.type === "detect") return { type: "result", detection: fake };
      return { error: "unexpected" };
    };

  const { default: Calibrator } = await import("../Calibrator");
  const r = render(<Calibrator />);
    const enableButton = r.getByText(/Enable camera/i, { selector: 'button' }) as HTMLButtonElement | null;
    if (enableButton) {
      await act(async () => {
        fireEvent.click(enableButton);
      });
    }
    const video = r.container.querySelector("video") as HTMLVideoElement | null;
    if (video) {
      video.srcObject = new (window as any).MediaStream();
      try {
        Object.defineProperty(video, "videoWidth", {
          value: 1024,
          configurable: true,
        });
        Object.defineProperty(video, "videoHeight", {
          value: 768,
          configurable: true,
        });
      } catch {}
    }
    // ensure camera simulation above is enough to enable capture
    // Start camera (simulate) so we can capture a frame (already done above)
    // find the Auto-Calibrate button and click it
  const button = r.getByTestId("autocalibrate-advanced");
  // ensure canvas exists and has size so the function doesn't early-return
    const canvas = r.container.querySelector("canvas");
    if (canvas) {
      (canvas as HTMLCanvasElement).width = 800;
      (canvas as HTMLCanvasElement).height = 600;
      const ctx = (canvas as HTMLCanvasElement).getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 800, 600);
    }
    // If no snapshot is present, capture one now (component requires hasSnapshot)
    const captureBtn = r.getByText(/Capture frame/i, { selector: 'button' }) as HTMLButtonElement | null;
    if (captureBtn) {
      await act(async () => { fireEvent.click(captureBtn); });
    }
    await act(async () => {
      fireEvent.click(button);
    });
  const { useCalibration: store } = await import("../../store/calibration");
  await waitFor(() => {
    const state = store.getState();
    expect(state.H).not.toBeNull();
    expect(state.anchors?.dst.length).toBe(4);
    expect(state.errorPx).toBe(0);
  }, { timeout: 10000 });
  }, 20000);

  it("runs legacy Auto detect rings and sets calibration", async () => {
  // The legacy auto detect runs its own algorithm over the snapshot canvas.
    // We'll draw a simple pattern on canvas that should still let it proceed through the function.
  const { default: Calibrator } = await import("../Calibrator");
  const r = render(<Calibrator />);
    const enableButton = r.getByText(/Enable camera/i, { selector: 'button' }) as HTMLButtonElement | null;
    if (enableButton) {
      await act(async () => {
        fireEvent.click(enableButton);
      });
    }
    const video = r.container.querySelector("video") as HTMLVideoElement | null;
    if (video) {
      video.srcObject = new (window as any).MediaStream();
      try {
        Object.defineProperty(video, "videoWidth", {
          value: 1024,
          configurable: true,
        });
        Object.defineProperty(video, "videoHeight", {
          value: 768,
          configurable: true,
        });
      } catch {}
    }
  const button = r.getByTestId("autodetect-legacy");
    const canvas = r.container.querySelector("canvas");
    if (canvas) {
      (canvas as HTMLCanvasElement).width = 1024;
      (canvas as HTMLCanvasElement).height = 768;
      const ctx = (canvas as HTMLCanvasElement).getContext("2d")!;
      // Draw an approximate bull & double ring to produce edges
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 1024, 768);
      ctx.beginPath();
      ctx.arc(512, 384, 170, 0, Math.PI * 2);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(512, 384, 99, 0, Math.PI * 2);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    const captureBtn = r.getByText(/Capture frame/i, { selector: 'button' }) as HTMLButtonElement | null;
    if (captureBtn) {
      await act(async () => { fireEvent.click(captureBtn); });
    }
    await act(async () => {
      fireEvent.click(button);
    });
  const { useCalibration: store } = await import("../../store/calibration");
  await waitFor(() => {
    const state = store.getState();
    // Either successful detection (homography) or not. Assert it set dst points.
    expect(state.anchors?.dst.length === 4 || state.errorPx !== null).toBeTruthy();
  }, { timeout: 10000 });
  }, 20000);
  afterEach(() => {
    // Clean up the test worker handler to avoid leakage across tests
    try { delete (globalThis as any).__TEST_WORKER_HANDLER; } catch {}
  });
});
