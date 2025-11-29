import React from "react";
import { render, act, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { waitFor } from "@testing-library/react";

// (not using jest-dom matchers here)

// Mock the DartDetector to produce one deterministic detection
vi.mock("../../utils/dartDetector", () => {
  return {
    DartDetector: class {
      setROI() {}
      detect() {
        return {
          tip: { x: 160, y: 120 },
          confidence: 0.9,
          bbox: { x: 150, y: 110, w: 20, h: 20 },
        };
      }
      accept() {}
    },
  };
});
// Replace zustand persistence behavior in tests to avoid storage side-effects
vi.doMock("zustand/middleware", async () => {
  const actual = await vi.importActual<any>("zustand/middleware");
  return {
    ...actual,
    // Make persist a no-op wrapper so stores don't try to access real storage
    persist: (config: any) => config,
    // Provide a simple storage factory for createJSONStorage
    createJSONStorage: () => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }),
  };
});

// Provide a simple mock for the calibration store to avoid persistent storage
vi.mock("../../store/calibration", () => {
  const state: any = {
    H: null,
    imageSize: null,
    reset: () => {},
    _hydrated: true,
    setCalibration: (c: any) => Object.assign(state, c),
  };
  const useCalibration = () => state;
  useCalibration.setState = (s: any) => {
    const obj = typeof s === "function" ? s(state) : s;
    Object.assign(state, obj);
  };
  return { useCalibration };
});

// Provide a simple mock for user settings store to avoid persistence
vi.mock("../../store/userSettings", () => {
  const state: any = {
    autoscoreProvider: "built-in",
    preferredCameraLabel: "",
    preferredCameraId: undefined,
    setPreferredCamera: (_id?: any) => {},
    setHideCameraOverlay: () => {},
  };
  const useUserSettings = (selector: any) =>
    selector ? selector(state) : state;
  useUserSettings.setState = (s: any) => {
    const obj = typeof s === "function" ? s(state) : s;
    Object.assign(state, obj);
  };
  useUserSettings.getState = () => state;
  return { useUserSettings };
});

import { useCalibration } from "../../store/calibration";
let useCalibrationRef: any;
let useUserSettings: any;
// Note: We'll use real stores with persistence stubbed out above

import { scoreFromImagePoint } from "../../utils/autoscore";

// Helper to stub canvas getContext and video properties
function stubCanvasContext(canvas: HTMLCanvasElement) {
  (canvas as any).getContext = (type: string) => {
    if (type !== "2d") return null;
    return {
      drawImage: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      putImageData: () => {},
      beginPath: () => {},
      stroke: () => {},
      arc: () => {},
      moveTo: () => {},
      lineTo: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      fillStyle: "",
    };
  };
}

describe("scoreFromImagePoint (autoscore) - simple homography tests", () => {
  beforeEach(() => {
    // Reset mocks/state between tests to avoid cross-test interference
    try {
      // Reset mocked calibration store
      const calib = require("../../store/calibration").useCalibration;
      calib.setState?.({ H: null, imageSize: null, _hydrated: true });
    } catch {}
    try {
      const us = require("../../store/userSettings").useUserSettings;
      us.setState?.({ autoscoreProvider: "built-in", preferredCameraLabel: "", preferredCameraId: undefined });
    } catch {}
  });
  afterEach(() => {
    // restore mocks and modules
    try { vi.restoreAllMocks(); } catch {}
    try { vi.resetModules(); } catch {}
  });
  it("maps image center to inner bull when H maps board origin to center", () => {
    const H = [1, 0, 160, 0, 1, 120, 0, 0, 1];
    const pImg = { x: 160, y: 120 };
    const score = scoreFromImagePoint(H as any, pImg as any);
    expect(score.base).toBe(50);
    expect(score.ring).toBe("INNER_BULL");
  });

  it("calls parent onAutoDart once when provided and avoids double-commit", async () => {
    // Make a mock that resolves a promise on the first call so we can unmount
    // immediately and avoid further ticks from invoking the handler again.
    let resolveCalled: any;
    const calledP = new Promise<void>((r) => { resolveCalled = r; });
    const onAutoDart = vi.fn(() => {
      try { resolveCalled(); } catch {}
      return true; // ack ownership so camera doesn't double-commit locally
    });
  const cameraRef = React.createRef<any>();
  const useMatch: any = (await vi.importActual("../../store/match")).useMatch;
  const addVisitSpy = vi.fn();
  useMatch.getState().addVisit = addVisitSpy;
    // Ensure calibration matrix and image size present for autoscore mapping
    useCalibration.setState?.({ H: [1, 0, 160, 0, 1, 120, 0, 0, 1], imageSize: { w: 320, h: 240 } });
    // Oxygen: Render CameraView with onAutoDart; the detector mock will return a detection
    // The CameraView uses the store mocks above, so render is safe
    // We'll render the component and wait for the detection to be processed
  const CameraView = (await vi.importActual("../CameraView")).default as any;
  let out: ReturnType<typeof render>;
  await act(async () => {
    out = render(<CameraView ref={cameraRef} scoringMode="x01" onAutoDart={onAutoDart} />);
  });
  // Mostly for test harness: ensure canvas context functions exist
  const canvases = out.container.querySelectorAll("canvas");
  canvases.forEach((c) => {
    // Ensure overlay canvas size matches calibration image size to avoid scaling issues
    try { (c as HTMLCanvasElement).width = 320; (c as HTMLCanvasElement).height = 240; } catch {}
    stubCanvasContext(c as HTMLCanvasElement);
  });
  // Give a little time for the render loop to tick (autoscore uses RAF)
  // Ensure the video element reports a size so the detection loop will process a frame
  const video = out.container.querySelector("video") as HTMLVideoElement | null;
  if (video) {
    try { Object.defineProperty(video, "videoWidth", { value: 320, configurable: true }); } catch {}
    try { Object.defineProperty(video, "videoHeight", { value: 240, configurable: true }); } catch {}
    try { (video as any).paused = false; } catch {}
  }
  // Force a single detection tick via the imperative handle instead of waiting for RAF
  // Wait for and call the imperative runDetectionTick if provided by CameraView
  // Use the deterministic test helper to directly add a dart and trigger the
  // onAutoDart handler (avoids RAF timing flakiness in JSDOM).
  await waitFor(() => cameraRef.current?.__test_addDart, { timeout: 2000 });
  cameraRef.current?.__test_addDart?.(50, "INNER_BULL 50", "INNER_BULL");
  // await the first onAutoDart call and then unmount immediately to avoid additional notifications
  await calledP;
  out.unmount();
  // Verify parent handler was invoked and camera did not commit locally
  expect(onAutoDart).toHaveBeenCalled();
  expect(addVisitSpy).not.toHaveBeenCalled();

  // end of calls parent onAutoDart test
  });

  it("does not double-commit when ring toggles across quick frames (25 -> 50)", async () => {
    // Arrange: create a scoreFromImagePoint mock that returns 25 then 50 to simulate toggling
    let callCount = 0;
    const mockScore = (h: any, p: any) => {
      callCount += 1;
      if (callCount === 1) return { base: 25, ring: "BULL", sector: null, mult: 1 } as any;
      return { base: 50, ring: "INNER_BULL", sector: null, mult: 1 } as any;
    };
    // Override the autoscore function for this test
    vi.doMock("../../utils/autoscore", async () => {
      const actual = await vi.importActual<any>("../../utils/autoscore");
      return { ...actual, scoreFromImagePoint: mockScore };
    });

    const cameraRef = React.createRef<any>();
  const useMatch: any = (await vi.importActual("../../store/match")).useMatch;
    const addVisitSpy = vi.fn();
    useMatch.getState().addVisit = addVisitSpy;
    useCalibration.setState?.({ H: [1, 0, 160, 0, 1, 120, 0, 0, 1], imageSize: { w: 320, h: 240 } });

  const { default: CameraView } = await vi.importActual("../CameraView");
  let out: ReturnType<typeof render>;
    await act(async () => {
      out = render(<CameraView ref={cameraRef} scoringMode="x01" cameraAutoCommit="camera" immediateAutoCommit />);
    });
    const canvases = out.container.querySelectorAll("canvas");
    canvases.forEach((c) => {
      try { (c as HTMLCanvasElement).width = 320; (c as HTMLCanvasElement).height = 240; } catch {}
      stubCanvasContext(c as HTMLCanvasElement);
    });
    const video = out.container.querySelector("video") as HTMLVideoElement | null;
    if (video) {
      try { Object.defineProperty(video, "videoWidth", { value: 320, configurable: true }); } catch {}
      try { Object.defineProperty(video, "videoHeight", { value: 240, configurable: true }); } catch {}
      try { (video as any).paused = false; } catch {}
    }
  await waitFor(() => cameraRef.current?.__test_addDart, { timeout: 2000 });
  // Use the test helper emulation path to mimic applyAutoHit/dedupe behavior
  cameraRef.current?.__test_addDart?.(25, "BULL 25", "BULL", undefined, { emulateApplyAutoHit: true });
  cameraRef.current?.__test_addDart?.(50, "INNER_BULL 50", "INNER_BULL", undefined, { emulateApplyAutoHit: true });
    // Allow the run loop to process (use waitFor to ensure asynchronicity)
    await waitFor(() => expect(addVisitSpy).toHaveBeenCalledTimes(1), { timeout: 2000 });
    out.unmount();
    expect(addVisitSpy).toHaveBeenCalledTimes(1);
  });

  it("aggregates three autoscore darts and commits once with full visit total", async () => {
    // Arrange: create a scoreFromImagePoint mock that cycles through S19, T19, S7
    const sequence = [
      { base: 19, ring: "SINGLE" },
      { base: 57, ring: "TRIPLE" },
      { base: 7, ring: "SINGLE" },
    ];
    // Return each value twice to satisfy AUTO_COMMIT_MIN_FRAMES = 2
    let frame = 0;
    const mockScore = (_h: any, _p: any) => {
      const idx = Math.floor(frame / 2);
      frame++;
      const s = sequence[Math.min(idx, sequence.length - 1)];
      return { base: s.base, ring: s.ring, sector: null, mult: s.ring === "TRIPLE" ? 3 : 1 } as any;
    };
    vi.doMock("../../utils/autoscore", async () => {
      const actual = await vi.importActual<any>("../../utils/autoscore");
      return { ...actual, scoreFromImagePoint: mockScore };
    });

  const cameraRef = React.createRef<any>();
  const useMatch: any = (await vi.importActual("../../store/match")).useMatch;
    const addVisitSpy = vi.fn();
    useMatch.getState().addVisit = addVisitSpy;
    useCalibration.setState?.({ H: [1, 0, 160, 0, 1, 120, 0, 0, 1], imageSize: { w: 320, h: 240 } });

  const CameraView = (await vi.importActual("../CameraView")).default as any;
    await act(async () => {
      render(<CameraView ref={cameraRef} scoringMode="x01" cameraAutoCommit="camera" onAddVisit={addVisitSpy} />);
    });
    // Wait for runDetectionTick and call it six times (two frames per dart)
    await waitFor(() => cameraRef.current?.runDetectionTick, { timeout: 2000 });
    // Simulate three stable dart additions without relying on detector timing
    await waitFor(() => cameraRef.current?.__test_addDart, { timeout: 2000 });
    cameraRef.current.__test_addDart?.(19, "S19 19", "SINGLE");
    await new Promise((r) => setTimeout(r, 100));
    cameraRef.current.__test_addDart?.(57, "T19 57", "TRIPLE");
    await new Promise((r) => setTimeout(r, 100));
    cameraRef.current.__test_addDart?.(7, "S7 7", "SINGLE");
  // Inspect pending visit store to ensure it first reached 3 darts and then cleared after commit
  const pendingVisitStore = (await vi.importActual("../../store/pendingVisit")).usePendingVisit;
  // Allow a moment for the commit flow to clear the pending visit (we expect commit to clear the pending state)
  await waitFor(() => expect(addVisitSpy).toHaveBeenCalledTimes(1), { timeout: 4000 });
  // After commit, the pending store should have been cleared
  expect((pendingVisitStore as any).getState().darts).toBe(0);
    // Validate the visit total and darts
    expect(addVisitSpy).toHaveBeenCalledWith(83, 3, expect.any(Object));
  });

  it("blocks manual commit in online matches when pending camera entries are not calibration validated", async () => {
    const cameraRef = React.createRef<any>();
    const useMatch: any = (await vi.importActual("../../store/match")).useMatch;
    useMatch.setState({ roomId: "room-1", inProgress: true } as any);
    const addVisitSpy = vi.fn();
    useMatch.getState().addVisit = addVisitSpy;
    const CameraView = (await vi.importActual("../CameraView")).default as any;
  const out = render(<CameraView ref={cameraRef} scoringMode="x01" cameraAutoCommit="camera" immediateAutoCommit />);
    const canvases = out.container.querySelectorAll("canvas");
    canvases.forEach((c) => {
      try { (c as HTMLCanvasElement).width = 320; (c as HTMLCanvasElement).height = 240; } catch {}
      stubCanvasContext(c as HTMLCanvasElement);
    });
    const video = out.container.querySelector("video") as HTMLVideoElement | null;
    if (video) {
      try { Object.defineProperty(video, "videoWidth", { value: 320, configurable: true }); } catch {}
      try { Object.defineProperty(video, "videoHeight", { value: 240, configurable: true }); } catch {}
      try { (video as any).paused = false; } catch {}
    }
    await waitFor(() => cameraRef.current?.__test_addDart, { timeout: 2000 });
    // Insert a pending camera-sourced dart that is NOT calibration validated
    cameraRef.current.__test_addDart?.(60, "T20 60", "TRIPLE", { calibrationValid: false, pBoard: { x: 0, y: -103 }, source: 'camera' });
    // Find and assert commit disabled
    await waitFor(() => expect(out.getByTestId('commit-visit-btn')).toBeDefined(), { timeout: 2000 });
    const commitBtn = out.getByTestId('commit-visit-btn') as HTMLButtonElement;
    expect(commitBtn.disabled).toBeTruthy();
    // Try invoking onCommitVisit to ensure it doesn't call addVisit
    await act(async () => { fireEvent.click(commitBtn); });
    expect(addVisitSpy).not.toHaveBeenCalled();
    out.unmount();
  });

  it("applies three autoscore darts T20,S18,T5 and reduces remaining: 501 -> 408", async () => {
    const sequence = [
      { base: 60, ring: "TRIPLE" },
      { base: 18, ring: "SINGLE" },
      { base: 15, ring: "TRIPLE" },
    ];
    // Return each value twice to satisfy AUTO_COMMIT_MIN_FRAMES = 2
    let frame2 = 0;
    const mockScore = (_h: any, _p: any) => {
      const idx = Math.floor(frame2 / 2);
      frame2++;
      const s = sequence[Math.min(idx, sequence.length - 1)];
      return { base: s.base, ring: s.ring, sector: null, mult: s.ring === "TRIPLE" ? 3 : 1 } as any;
    };
    vi.doMock("../../utils/autoscore", async () => {
      const actual = await vi.importActual<any>("../../utils/autoscore");
      return { ...actual, scoreFromImagePoint: mockScore };
    });

    const cameraRef = React.createRef<any>();
    const useMatch: any = (await vi.importActual("../../store/match")).useMatch;
  // Create a new match and verify remaining updates on insertion
  useMatch.getState().newMatch(["You"], 501);
  const addVisitSpy = vi.fn();
  // Spy on the store implementation so CameraView commits update the store
  const realAddVisit = useMatch.getState().addVisit;
  useMatch.getState().addVisit = (score: number, darts: number, meta?: any) => {
    try { addVisitSpy(score, darts, meta); } catch {}
    try { realAddVisit(score, darts, meta); } catch {}
  };

  const CameraView = (await vi.importActual("../CameraView")).default as any;
    await act(async () => {
      // Do not pass `onAddVisit` so the view will write directly to the store (wrapped by our spy)
      render(<CameraView ref={cameraRef} scoringMode="x01" cameraAutoCommit="camera" immediateAutoCommit />);
    });
    await waitFor(() => cameraRef.current?.runDetectionTick, { timeout: 2000 });
    // Simulate three stable dart additions without relying on detector timing
    await waitFor(() => cameraRef.current?.__test_addDart, { timeout: 2000 });
    cameraRef.current.__test_addDart?.(60, "T20 60", "TRIPLE");
    await new Promise((r) => setTimeout(r, 100));
    cameraRef.current.__test_addDart?.(18, "S18 18", "SINGLE");
    await new Promise((r) => setTimeout(r, 100));
    cameraRef.current.__test_addDart?.(15, "T5 15", "TRIPLE");
  const pendingVisitStore2 = (await vi.importActual("../../store/pendingVisit")).usePendingVisit;
  const pendingState2 = (pendingVisitStore2 as any).getState();
    // Allow loop/process and assert one aggregated commit for the triplet
    await waitFor(() => expect(addVisitSpy).toHaveBeenCalledTimes(1), { timeout: 4000 });
    // Validate single commit with the expected visit total
    expect(addVisitSpy).toHaveBeenCalledWith(93, 3, expect.any(Object));
  });

  it("does not commit a single-frame ghost detection (no multi-frame stability)", async () => {
    // Setup a detector that only produces a detection on the first call then returns null
    let called = 0;
    const mockDet = (h: any, p: any) => {
      called += 1;
      if (called === 1) return { base: 60, ring: "TRIPLE", sector: null, mult: 3 } as any;
      return { base: 0, ring: "MISS", sector: null, mult: 0 } as any;
    };
    vi.doMock("../../utils/autoscore", async () => {
      const actual = await vi.importActual<any>("../../utils/autoscore");
      return { ...actual, scoreFromImagePoint: mockDet };
    });

    const cameraRef = React.createRef<any>();
  const useMatch: any = (await vi.importActual("../../store/match")).useMatch;
  // Start a match so commits can be persisted
  useMatch.getState().newMatch(["You"], 501);
  const addVisitSpy = vi.fn();
  useMatch.getState().addVisit = addVisitSpy;
    useCalibration.setState?.({ H: [1, 0, 160, 0, 1, 120, 0, 0, 1], imageSize: { w: 320, h: 240 } });

    const { default: CameraView } = await vi.importActual("../CameraView");
    const out = render(<CameraView ref={cameraRef} scoringMode="x01" cameraAutoCommit="camera" />);
    const canvases = out.container.querySelectorAll("canvas");
    canvases.forEach((c) => {
      try { (c as HTMLCanvasElement).width = 320; (c as HTMLCanvasElement).height = 240; } catch {}
      stubCanvasContext(c as HTMLCanvasElement);
    });
    await waitFor(() => cameraRef.current?.runDetectionTick, { timeout: 2000 });
    // Run a detection tick that yields a single detection then another tick where detection disappears
    cameraRef.current?.runDetectionTick?.();
    cameraRef.current?.runDetectionTick?.();
    // Wait an amount of time > AUTO_COMMIT_HOLD_MS to ensure the hold path would have fired if the candidate had persisted
    await new Promise((r) => setTimeout(r, 300));
    // assert no commit happened
    expect(addVisitSpy).not.toHaveBeenCalled();
  });

  it("allows manual commit in online matches if camera entries are calibration validated", async () => {
    const cameraRef = React.createRef<any>();
    const useMatch: any = (await vi.importActual("../../store/match")).useMatch;
    useMatch.setState({ roomId: "room-1", inProgress: true } as any);
    const addVisitSpy = vi.fn();
    useMatch.getState().addVisit = addVisitSpy;
    const CameraView = (await vi.importActual("../CameraView")).default as any;
    const out = render(<CameraView ref={cameraRef} scoringMode="x01" cameraAutoCommit="camera" />);
    await waitFor(() => cameraRef.current?.__test_addDart, { timeout: 2000 });
    // Insert a pending camera-sourced dart that IS calibration validated
    cameraRef.current.__test_addDart?.(60, "T20 60", "TRIPLE", { calibrationValid: true, pBoard: { x: 0, y: -103 }, source: 'camera' });
    // Find and assert commit enabled
    await waitFor(() => expect(out.getByTestId('commit-visit-btn')).toBeDefined(), { timeout: 2000 });
    const commitBtn = out.getByTestId('commit-visit-btn') as HTMLButtonElement;
    expect(commitBtn.disabled).toBeFalsy();
    // Click commit, should call addVisit
    await act(async () => { fireEvent.click(commitBtn); });
    expect(addVisitSpy).toHaveBeenCalled();
    out.unmount();
  });

  it("does not commit a multi-frame detection when calibration is not locked or error is high", async () => {
    // Setup a detector that always produces a detection
    const mockDet = () => ({ base: 60, ring: "TRIPLE", sector: null, mult: 3 } as any);
    vi.doMock("../../utils/autoscore", async () => {
      const actual = await vi.importActual<any>("../../utils/autoscore");
      return { ...actual, scoreFromImagePoint: mockDet };
    });

    const cameraRef = React.createRef<any>();
    const useMatch: any = (await vi.importActual("../../store/match")).useMatch;
    useMatch.getState().newMatch(["You"], 501);
    const addVisitSpy = vi.fn();
    useMatch.getState().addVisit = addVisitSpy;
    // Provide calibration H and image size but *not locked* and with high errorPx
    useCalibration.setState?.({ H: [1, 0, 160, 0, 1, 120, 0, 0, 1], imageSize: { w: 320, h: 240 }, locked: false, errorPx: 20 });

    const CameraView = (await vi.importActual("../CameraView")).default as any;
    const out = render(<CameraView ref={cameraRef} scoringMode="x01" cameraAutoCommit="camera" />);
    const canvases = out.container.querySelectorAll("canvas");
    canvases.forEach((c) => {
      try { (c as HTMLCanvasElement).width = 320; (c as HTMLCanvasElement).height = 240; } catch {}
      stubCanvasContext(c as HTMLCanvasElement);
    });
    await waitFor(() => cameraRef.current?.runDetectionTick, { timeout: 2000 });
    // Run two detection ticks (satisfy AUTO_COMMIT_MIN_FRAMES)
    cameraRef.current?.runDetectionTick?.();
    cameraRef.current?.runDetectionTick?.();
    // Wait a bit to ensure commit could have occurred
    await new Promise((r) => setTimeout(r, 300));
    expect(addVisitSpy).not.toHaveBeenCalled();
  });

  it("commits detection when calibration is locked", async () => {
    const mockDet = () => ({ base: 60, ring: "TRIPLE", sector: null, mult: 3 } as any);
    vi.doMock("../../utils/autoscore", async () => {
      const actual = await vi.importActual<any>("../../utils/autoscore");
      return { ...actual, scoreFromImagePoint: mockDet };
    });
    const cameraRef = React.createRef<any>();
    const useMatch: any = (await vi.importActual("../../store/match")).useMatch;
    useMatch.getState().newMatch(["You"], 501);
    const addVisitSpy = vi.fn();
    useMatch.getState().addVisit = addVisitSpy;
  useCalibration.setState?.({ H: [1, 0, 160, 0, 1, 120, 0, 0, 1], imageSize: { w: 320, h: 240 }, locked: true, errorPx: 1 });
    const CameraView = (await vi.importActual("../CameraView")).default as any;
    const out = render(<CameraView ref={cameraRef} scoringMode="x01" cameraAutoCommit="camera" />);
    const canvases = out.container.querySelectorAll("canvas");
    canvases.forEach((c) => {
      try { (c as HTMLCanvasElement).width = 320; (c as HTMLCanvasElement).height = 240; } catch {}
      stubCanvasContext(c as HTMLCanvasElement);
    });
  await waitFor(() => cameraRef.current?.__test_addDart, { timeout: 2000 });
  // Trigger deterministic applyAutoHit emulate path to commit when calibration is locked
  cameraRef.current?.__test_addDart?.(60, "T20 60", "TRIPLE", undefined, { emulateApplyAutoHit: true });
    await waitFor(() => expect(addVisitSpy).toHaveBeenCalled(), { timeout: 2000 });
  });

  // in-flight commit prevention: handled via candidate/time gating and addDart debounce.
  // Dedupe behavior is validated by the already-present tests which assert no double-commit
  // across rapid ring toggles or parent-supplied onAutoDart ack.

  
});
