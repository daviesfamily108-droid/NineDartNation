import React from "react";
import { render, act, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

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
  it("maps image center to inner bull when H maps board origin to center", () => {
    const H = [1, 0, 160, 0, 1, 120, 0, 0, 1];
    const pImg = { x: 160, y: 120 };
    const score = scoreFromImagePoint(H as any, pImg as any);
    expect(score.base).toBe(50);
    expect(score.ring).toBe("INNER_BULL");
  });

  it("calls parent onAutoDart once when provided and avoids double-commit", async () => {
    const onAutoDart = vi.fn();
    // Ensure calibration matrix and image size present for autoscore mapping
    useCalibration.setState?.({ H: [1, 0, 160, 0, 1, 120, 0, 0, 1], imageSize: { w: 320, h: 240 } });
    // Oxygen: Render CameraView with onAutoDart; the detector mock will return a detection
    // The CameraView uses the store mocks above, so render is safe
    // We'll render the component and wait for the detection to be processed
    const { default: CameraView } = await vi.importActual("../CameraView");
    const { render } = await vi.importActual("@testing-library/react");
    const out = render(<CameraView scoringMode="x01" onAutoDart={onAutoDart} />);
    // Give a little time for the render loop to tick (autoscore uses RAF)
    await new Promise((r) => setTimeout(r, 250));
    // We expect the parent's callback to be called at least once but not duplicated
    expect(onAutoDart).toHaveBeenCalledTimes(1);
  });
});
