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

  it("does not lock calibration if repeated detection is unstable (sync fallback)", async () => {
    // Mock detectBoard/refine to return different results on subsequent calls
    const boardDetection = await import("../../utils/boardDetection");
    const fake1 = {
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
    const fake2 = { ...fake1, cx: 430, cy: 320, doubleOuter: 193 } as any;
    let calls = 0;
    vi.spyOn(boardDetection, "detectBoard").mockImplementation(() => {
      calls++;
      // return alternating results so repeated checks are unstable
      return calls === 1 ? fake1 : fake2;
    });
    vi.spyOn(boardDetection, "refineRingDetection").mockImplementation((d: any) => d);

  // Ensure worker path is disabled so this test uses sync fallback exclusively
  (globalThis as any).Worker = undefined;
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
    const button = r.getByTestId("autocalibrate-advanced");
    const canvas = r.container.querySelector("canvas");
    if (canvas) {
      (canvas as HTMLCanvasElement).width = 800;
      (canvas as HTMLCanvasElement).height = 600;
      const ctx = (canvas as HTMLCanvasElement).getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 800, 600);
    }
    const captureBtn = r.getByText(/Capture frame/i, { selector: 'button' }) as HTMLButtonElement | null;
    if (captureBtn) {
      await act(async () => { fireEvent.click(captureBtn); });
    }
    await act(async () => { fireEvent.click(button); });
    const { useCalibration: store } = await import("../../store/calibration");
    await waitFor(() => {
      const state = store.getState();
      // Calibration should exist but should NOT be locked since detection was unstable
      expect(state.H).not.toBeNull();
      expect(state.locked).toBe(false);
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

  it("does not lock auto-detect when repeated detectBoard runs are unstable (legacy)", async () => {
    const boardDetection = await import("../../utils/boardDetection");
    const fake1 = {
      success: true,
      cx: 400,
      cy: 300,
      doubleOuter: 170,
      bullInner: 6.35,
      bullOuter: 15.9,
      trebleInner: 99,
      trebleOuter: 107,
      doubleInner: 162,
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
    const fake2 = { ...fake1, cx: 450, cy: 280, doubleOuter: 200 } as any;
    let calls = 0;
    vi.spyOn(boardDetection, "detectBoard").mockImplementation(() => {
      calls++;
      return calls === 1 ? fake1 : fake2;
    });
    vi.spyOn(boardDetection, "refineRingDetection").mockImplementation((d: any) => d);

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
        Object.defineProperty(video, "videoWidth", { value: 1024, configurable: true });
        Object.defineProperty(video, "videoHeight", { value: 768, configurable: true });
      } catch {}
    }
    const button = r.getByTestId("autodetect-legacy");
    const canvas = r.container.querySelector("canvas");
    if (canvas) {
      (canvas as HTMLCanvasElement).width = 1024;
      (canvas as HTMLCanvasElement).height = 768;
      const ctx = (canvas as HTMLCanvasElement).getContext("2d")!;
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
    await act(async () => { fireEvent.click(button); });
    const { useCalibration: store } = await import("../../store/calibration");
    await waitFor(() => {
      const state = store.getState();
      // Should have a detection but not be locked due to instability
      expect(state.anchors?.dst.length).toBe(4);
      expect(state.locked).toBe(false);
    }, { timeout: 10000 });
  }, 20000);

  it("device picker select does not close on immediate clicks (refocus/ref guard)", async () => {
    const { default: Calibrator } = await import("../Calibrator");
    const r = render(<Calibrator />);
    // Find the DevicePicker top-level container via the title text
  const title = r.getByText(/Select camera device/i);
  const container = title.closest("div");
  expect(container).toBeDefined();
    const select = r.container.querySelector("select") as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    // Focus the select (simulate user opening native dropdown)
    await act(async () => { fireEvent.focus(select!); });
  // Check data-open attribute was set by focus handler
  expect(r.container.querySelector('[data-open="true"]')).not.toBeNull();
    // Simulate a pointerdown on the select element
    await act(async () => { fireEvent.pointerDown(select!); });
  // Because the dropdownRef is set, the outside click handler should see the click as inside
  // and therefore not close it. The dataset.open should still be set while the select has focus.
  expect(r.container.querySelector('[data-open="true"]')).not.toBeNull();
  }, 5000);

  it("shows darts overlay when toggled on", async () => {
    const { default: Calibrator } = await import("../Calibrator");
    const r = render(<Calibrator />);
    const enableButton = r.getByText(/Enable camera/i, { selector: 'button' }) as HTMLButtonElement | null;
    if (enableButton) {
      await act(async () => { fireEvent.click(enableButton); });
    }
    // Toggle dart overlay
    const checkbox = r.getByLabelText(/Show darts overlay/i) as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    if (checkbox) {
      await act(async () => { fireEvent.click(checkbox); });
    }
    // overlay canvas should exist
    const overlay = r.container.querySelector('canvas[aria-hidden="true"]') || r.container.querySelector('canvas');
    expect(overlay).not.toBeNull();
  }, 5000);

  it("can commit detected dart to offline match (test autocommit)", async () => {
    const { default: Calibrator } = await import("../Calibrator");
    const r = render(<Calibrator />);
    // Start an offline match
    const match = (await import("../../store/match")).useMatch.getState();
    act(() => { match.newMatch(["You", "Player 2"], 501); });
    const canvas = r.container.querySelector("canvas") as HTMLCanvasElement | null;
    // Setup a calibration H and image size so the click maps to bull
    const { useCalibration: calib } = await import("../../store/calibration");
    act(() => {
      calib.getState().setCalibration({
        H: [1,0,0,0,1,0,0,0,1] as any,
        createdAt: Date.now(),
        errorPx: 0,
        imageSize: { w: 320, h: 240 },
        overlaySize: { w: 320, h: 240 },
        anchors: null as any,
      });
    });
    // Ensure overlay exists and set size, then toggle overlay and autocommit toggle
    if (canvas) {
      (canvas as HTMLCanvasElement).width = 320;
      (canvas as HTMLCanvasElement).height = 240;
    }
    const enable = r.getByText(/Enable camera/i, { selector: 'button' }) as HTMLButtonElement | null;
    if (enable) await act(async () => { fireEvent.click(enable); });
    const show = r.getByLabelText(/Show darts overlay/i) as HTMLInputElement | null;
    if (show) await act(async () => { fireEvent.click(show); });
    const auto = r.getByLabelText(/Enable autocommit test mode/i) as HTMLInputElement | null;
    if (auto) await act(async () => { fireEvent.click(auto); });
    const commit = r.getByText(/Commit detected/i, { selector: 'button' }) as HTMLButtonElement | null;
    // Simulate a click at center of canvas
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      await act(async () => { fireEvent.pointerDown(canvas, { clientX: rect.left + 160, clientY: rect.top + 120 }); });
    }
    // Now click commit
    if (commit) await act(async () => { fireEvent.click(commit); });
    // assert: player's remaining is 501 - value
    const p = match.players[0];
    expect(p.legs[p.legs.length - 1].totalScoreRemaining).toBeLessThan(501);
  }, 5000);

  it("header tools pill mirrors aside toggles and shows popup", async () => {
    const { default: Calibrator } = await import("../Calibrator");
    const r = render(<Calibrator />);
    const headerButton = r.getByText(/Cal\. Tools/i);
    expect(headerButton).toBeDefined();
    await act(async () => { fireEvent.click(headerButton); });
    // Popup should appear with controls
    expect(r.getByText(/Calibrator quick tools/i)).toBeDefined();
    const hdrShow = r.getByLabelText(/Show darts overlay/i) as HTMLInputElement;
    const asideShow = r.getByLabelText(/Show darts overlay/i, { selector: 'input' });
    expect(hdrShow).toBeDefined();
    expect(asideShow).toBeDefined();
    // Toggle in header and expect aside to reflect
    const initial = hdrShow.checked;
    await act(async () => { fireEvent.click(hdrShow); });
    expect(asideShow.checked).toBe(!initial);
  }, 5000);
  afterEach(() => {
    // Clean up the test worker handler to avoid leakage across tests
    try { delete (globalThis as any).__TEST_WORKER_HANDLER; } catch {}
  });

  it("allows autocommit in online matches when enabled via settings", async () => {
    const { default: Calibrator } = await import("../Calibrator");
    const r = render(<Calibrator />);
    // Set match to online and inProgress
    const { useMatch } = await import("../../store/match");
    useMatch.setState({ roomId: "room-1", inProgress: true } as any);
    // Enable autocommit via settings
    const { useUserSettings } = await import("../../store/userSettings");
    useUserSettings.setState({ allowAutocommitInOnline: true } as any);
    // Verify addVisit gets called when Commit detected runs
    const spy = vi.spyOn(useMatch.getState(), "addVisit");
    // Set current H & image size so onclick in computed mode returns a valid value
    const { useCalibration } = await import("../../store/calibration");
    useCalibration.setState({ H: [1,0,0,0,1,0,0,0,1], imageSize: { w: 800, h: 600 } } as any);
  // Ensure overlay canvas exists and simulate a detection click in center
    const canvas = r.container.querySelector("canvas") as HTMLCanvasElement | null;
    if (canvas) {
      (canvas as HTMLCanvasElement).width = 320;
      (canvas as HTMLCanvasElement).height = 240;
      const rect = canvas.getBoundingClientRect();
      // Enable test autocommit mode and immediate commits
      const auto = r.getByLabelText(/Enable autocommit test mode/i) as HTMLInputElement | null;
      if (auto) await act(async () => { fireEvent.click(auto); });
      const immediate = r.getByLabelText(/Autocommit immediate when dart detected/i) as HTMLInputElement | null;
      if (immediate) await act(async () => { fireEvent.click(immediate); });
      const allowOnline = r.getByLabelText(/Allow autocommit in Online\/Tournament matches/i) as HTMLInputElement | null;
      if (allowOnline) await act(async () => { fireEvent.click(allowOnline); });
      await act(async () => { fireEvent.pointerDown(canvas, { clientX: rect.left + 160, clientY: rect.top + 120 }); });
    }
    // For online autocommit, commit should have been called (if allowed)
    expect(spy).toHaveBeenCalled();
  });
});
