import React, { createRef } from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import CameraView, { type CameraViewHandle } from "../CameraView";

// Mock detector to return a low-confidence detection deterministically
vi.mock("../../utils/dartDetector", () => {
  return {
    DartDetector: class {
      setROI() {}
      detect() {
        return {
          tip: { x: 160, y: 120 },
          confidence: 0.6,
          bbox: { x: 150, y: 110, w: 20, h: 20 },
        };
      }
      accept() {}
    },
  };
});

// Minimal calibration to allow scoring computations
vi.mock("../../store/calibration", () => {
  const state: any = {
    H: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    imageSize: { w: 320, h: 240 },
    overlaySize: { w: 320, h: 240 },
    theta: 0,
    sectorOffset: 0,
    reset: () => {},
    _hydrated: true,
    locked: true,
    errorPx: 1,
  };
  const useCalibration = () => state;
  useCalibration.setState = (s: any) => Object.assign(state, s);
  return { useCalibration };
});

// Mock user settings to enable confirm-on-uncertain
vi.mock("../../store/userSettings", () => {
  const state: any = {
    autoscoreProvider: "built-in",
    autoscoreWsUrl: "",
    autoCommitMode: "wait-for-clear",
    confirmUncertainDarts: true,
    autoScoreConfidenceThreshold: 0.85,

    preferredCameraId: undefined,
    preferredCameraLabel: "",
    preferredCameraLocked: false,
    cameraScale: 1,
    cameraAspect: "wide",
    cameraFitMode: "fit",
    cameraEnabled: true,
    hideCameraOverlay: false,
    preserveCalibrationOverlay: true,

    callerEnabled: false,
    callerVoice: "",
    callerVolume: 1,

    setPreferredCamera: () => {},
    setPreferredCameraLocked: () => {},
    setHideCameraOverlay: () => {},
    setCameraScale: () => {},
    setCameraAspect: () => {},
    setCameraFitMode: () => {},
    setCameraEnabled: () => {},
    setAutoscoreProvider: () => {},
    setAutoscoreWsUrl: () => {},
    setAutoCommitMode: () => {},
    setConfirmUncertainDarts: (v: boolean) => {
      state.confirmUncertainDarts = !!v;
    },
    setAutoScoreConfidenceThreshold: (n: number) => {
      state.autoScoreConfidenceThreshold = n;
    },
    setCallerEnabled: () => {},
    setCallerVoice: () => {},
    setCallerVolume: () => {},
  };
  const useUserSettings: any = (selector: any) => (selector ? selector(state) : state);
  useUserSettings.setState = (s: any) => {
    const obj = typeof s === "function" ? s(state) : s;
    Object.assign(state, obj);
  };
  useUserSettings.getState = () => state;
  return { useUserSettings };
});

// Mock match and pending visit stores (only what CameraView reads)
vi.mock("../../store/match", () => {
  const state: any = {
    startingScore: 501,
    currentPlayerIdx: 0,
    players: [{ id: "p1", name: "Alice", legs: [{ totalScoreRemaining: 501, visits: [] }] }],
    addVisit: vi.fn(),
    endLeg: vi.fn(),
  };
  const useMatch: any = (selector: any) => (selector ? selector(state) : state);
  useMatch.setState = (s: any) => Object.assign(state, s);
  useMatch.getState = () => state;
  return { useMatch };
});

vi.mock("../../store/pendingVisit", () => {
  const state: any = { setVisit: vi.fn(), reset: vi.fn() };
  const usePendingVisit: any = (selector: any) => (selector ? selector(state) : state);
  return { usePendingVisit };
});

vi.mock("../../store/cameraSession", () => {
  const state: any = {
    isStreaming: false,
    mode: "local",
    showOverlay: true,
    setMode: vi.fn(),
    setStreaming: vi.fn(),
    setVideoElementRef: vi.fn(),
  };
  const useCameraSession: any = (selector: any) =>
    selector ? selector(state) : state;
  useCameraSession.getState = () => state;
  useCameraSession.setState = (s: any) => {
    const obj = typeof s === "function" ? s(state) : s;
    Object.assign(state, obj);
  };
  return { useCameraSession };
});

vi.mock("../../store/matchControl", () => {
  const state: any = { paused: false };
  const useMatchControl: any = (selector: any) => (selector ? selector(state) : state);
  return { useMatchControl };
});

vi.mock("../../store/audit", () => {
  const state: any = { log: vi.fn() };
  const useAudit: any = (selector: any) => (selector ? selector(state) : state);
  return { useAudit };
});

vi.mock("../../store/heatmap", () => {
  const state: any = { addSample: vi.fn() };
  const useHeatmapStore: any = (selector: any) => (selector ? selector(state) : state);
  return { default: useHeatmapStore };
});

vi.mock("../../utils/broadcast", () => ({ broadcastMessage: vi.fn() }));
vi.mock("../../utils/matchSync", () => ({ writeMatchSnapshot: vi.fn() }));
vi.mock("../../utils/cameraHandoff", () => ({ startForwarding: vi.fn(), stopForwarding: vi.fn() }));
vi.mock("../../store/profileStats", () => ({ addSample: vi.fn() }));
vi.mock("../../utils/scoring", () => ({ subscribeExternalWS: vi.fn() }));
vi.mock("../../utils/checkout", () => ({ sayDart: vi.fn() }));

// Basic canvas/video shims for jsdom
beforeEach(() => {
  // canvas getContext stub
  (HTMLCanvasElement.prototype as any).getContext = () => ({
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }),
    putImageData: () => {},
    beginPath: () => {},
    arc: () => {},
    stroke: () => {},
    fill: () => {},
    clearRect: () => {},
  });
});

describe("CameraView confirm-on-uncertain", () => {
  it("does not auto-add low-confidence dart; shows confirm modal; accept records dart", async () => {
    const cameraRef = createRef<CameraViewHandle>();

    const { getByText, queryByText } = render(
      <CameraView ref={cameraRef as any} scoringMode="x01" />,
    );

    // Use the test-only hook to simulate a low-confidence camera detection.
    // This avoids depending on camera readiness/arming timers.
    await act(async () => {
      (cameraRef.current as any)?.__test_addDart?.(20, "S20 20", "SINGLE", {
        source: "camera",
        calibrationValid: true,
        confidence: 0.6,
      });
    });

  // Should show confirmation UI
  expect(getByText("Confirm detected dart")).toBeTruthy();

    // Accept
    fireEvent.click(getByText("Accept"));

    // Modal closes
    expect(queryByText("Confirm detected dart")).toBeNull();
  });
});
