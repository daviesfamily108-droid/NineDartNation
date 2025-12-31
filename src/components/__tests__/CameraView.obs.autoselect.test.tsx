import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock the DartDetector to avoid running detection
vi.mock("../../utils/dartDetector", () => {
  return {
    DartDetector: class {
      setROI() {}
      detect() {
        return null as any;
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

// Provide a simple mock for user settings store to capture calls to setPreferredCamera
vi.mock("../../store/userSettings", () => {
  // create a spy that also updates state to mimic real behavior
  const spySet = (id?: any, label?: any, locked?: any) => {
    state.preferredCameraId = id;
    state.preferredCameraLabel = label || state.preferredCameraLabel;
    state.preferredCameraLocked = !!locked;
  };
  const setPreferredCamera = vi.fn(spySet);
  const state: any = {
    autoscoreProvider: "built-in",
    confirmUncertainDarts: true,
    autoScoreConfidenceThreshold: 0.85,
    preferredCameraLabel: "",
    preferredCameraId: undefined,
    setPreferredCamera,
    setHideCameraOverlay: () => {},
    preferredCameraLocked: false,
  };
  const useUserSettings = (selector: any) =>
    selector ? selector(state) : state;
  useUserSettings.setState = (s: any) => {
    const obj = typeof s === "function" ? s(state) : s;
    Object.assign(state, obj);
  };
  useUserSettings.getState = () => state;
  return { useUserSettings, __setMock: (v: any) => Object.assign(state, v) };
});

// Small helper to set navigator.mediaDevices.enumerateDevices
function mockEnumerateDevices(list: MediaDeviceInfo[]) {
  const md: any = {
    enumerateDevices: () => Promise.resolve(list),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (global as any).navigator = (global as any).navigator || {};
  (global as any).navigator.mediaDevices = md;
}

describe("CameraView auto-select OBS virtual camera", () => {
  beforeEach(() => {
    try {
      vi.resetAllMocks();
    } catch {}
    try {
      vi.resetModules();
    } catch {}
  });
  afterEach(() => {
    try {
      vi.restoreAllMocks();
    } catch {}
    try {
      vi.resetModules();
    } catch {}
  });

  // The auto-select effect requires a fully-reactive mocked store —
  // this unit test validates that devices are enumerated and the OBS label is present.
  // A full integration test should assert the actual setPreferredCamera invocation.
  it("should pick an OBS/virtual device when available and no preferredCameraId set", async () => {
    const devices: any = [
      { deviceId: "cam1", kind: "videoinput", label: "Built-in Webcam" },
      { deviceId: "obs1", kind: "videoinput", label: "OBS Virtual Camera" },
    ];
    mockEnumerateDevices(devices);

    const { useUserSettings } = await vi.importActual<any>(
      "../../store/userSettings",
    );
    // Ensure initial state has no preference
    useUserSettings.setState?.({
      preferredCameraId: undefined,
      preferredCameraLocked: false,
    });
    const CameraView = (await vi.importActual<any>("../CameraView")).default;
    // Render the component; the enumerateDevices effect should run and call setPreferredCamera
    await act(async () => {
      const { render } = await vi.importActual<any>("@testing-library/react");
      render(<CameraView />);
    });

    // Wait for the mocked setter to be called with the OBS device
    await waitFor(
      async () => {
        const { useUserSettings } = await import("../../store/userSettings");
        const spy = useUserSettings.getState().setPreferredCamera as any;
        expect(typeof spy).toBe("function");
        expect(spy.mock?.calls?.length || 0).toBeGreaterThan(0);
        const calls = spy.mock?.calls || [];
        const hit = calls.some((c: any[]) => c[0] === "obs1");
        expect(hit).toBe(true);
      },
      { timeout: 1000 },
    );
  });
});
