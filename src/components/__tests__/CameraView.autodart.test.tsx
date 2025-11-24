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
  const useMatch = (await vi.importActual("../../store/match")).useMatch;
  const addVisitSpy = vi.fn();
  useMatch.getState().addVisit = addVisitSpy;
    // Ensure calibration matrix and image size present for autoscore mapping
    useCalibration.setState?.({ H: [1, 0, 160, 0, 1, 120, 0, 0, 1], imageSize: { w: 320, h: 240 } });
    // Oxygen: Render CameraView with onAutoDart; the detector mock will return a detection
    // The CameraView uses the store mocks above, so render is safe
    // We'll render the component and wait for the detection to be processed
    const { default: CameraView } = await vi.importActual("../CameraView");
    const { render, act } = await vi.importActual("@testing-library/react");
  let out: ReturnType<typeof render>;
  await act(async () => {
    out = render(<CameraView ref={cameraRef} scoringMode="x01" onAutoDart={onAutoDart} />);
  });
  // Mostly for test harness: ensure canvas context functions exist
  const canvases = out.container.querySelectorAll("canvas");
  canvases.forEach((c) => stubCanvasContext(c as HTMLCanvasElement));
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
    await waitFor(() => cameraRef.current?.runDetectionTick, { timeout: 2000 });
  // Call once to trigger a single detection event
  cameraRef.current?.runDetectionTick?.();
  // await the first onAutoDart call and then unmount immediately to avoid additional notifications
  await calledP;
  out.unmount();
  // Verify parent handler was invoked and camera did not commit locally
  expect(onAutoDart).toHaveBeenCalled();
  expect(addVisitSpy).not.toHaveBeenCalled();
  });
});
