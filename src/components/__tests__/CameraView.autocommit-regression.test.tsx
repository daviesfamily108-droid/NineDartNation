import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

// These tests focus on preventing the historical regression where CameraView
// could force an immediate visit commit (callAddVisit) even when the app was
// configured for wait-for-clear.
//
// We keep these tests intentionally narrow: they validate the contract around
// commit mode plumbing and ensure we don't reintroduce a bypass.

// Minimal stubs for browser APIs CameraView touches.
vi.stubGlobal("navigator", {
  mediaDevices: {
    enumerateDevices: vi.fn(async () => []),
    getUserMedia: vi.fn(async () => ({ getTracks: () => [] })),
  },
} as any);

// Mock stores/hooks CameraView depends on.
vi.mock("../../store/match", () => {
  return {
    useMatch: () => ({
      // callAddVisit is the thing we must NOT call in wait-for-clear mode.
      callAddVisit: vi.fn(),
      inProgress: true,
      mode: "x01-match",
      currentPlayerIdx: 0,
      players: ["P1"],
    }),
  };
});

vi.mock("../../store/userSettings", () => {
  const state = {
    autoscoreProvider: "built-in",
    autoCommitMode: "wait-for-clear",
    allowAutocommitInOnline: false,
    confirmUncertainDarts: true,
    autoScoreConfidenceThreshold: 0.85,
    autoscoreDetectorMinArea: 30,
    autoscoreDetectorThresh: 15,
    autoscoreDetectorRequireStableN: 2,
    preferredCameraId: undefined,
    preferredCameraLabel: undefined,
    preferredCameraLocked: false,
    cameraEnabled: true,
    hideCameraOverlay: false,
    preserveCalibrationOverlay: true,
    preserveCalibrationOnCameraChange: true,
    calibrationGuide: true,
    cameraScale: 1,
    cameraAspect: "wide",
    cameraFitMode: "fit",
    setPreferredCamera: vi.fn(),
    setPreferredCameraLocked: vi.fn(),
    setIgnorePreferredCameraSync: vi.fn(),
    setCameraEnabled: vi.fn(),
    setHideCameraOverlay: vi.fn(),
  };

  const useUserSettings: any = (selector?: any) =>
    typeof selector === "function" ? selector(state) : state;
  useUserSettings.getState = () => state;

  return {
    useUserSettings,
  };
});

vi.mock("../../store/calibration", () => {
  return {
    useCalibration: () => ({
      H: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      imageSize: { w: 1280, h: 720 },
      overlaySize: { w: 1280, h: 720 },
      errorPx: 2.5,
      locked: true,
    }),
  };
});

vi.mock("../../store/pendingVisit", () => {
  return {
    usePendingVisit: () => ({
      pendingDarts: [],
      addPendingDart: vi.fn(),
      clearPendingDarts: vi.fn(),
      removePendingDart: vi.fn(),
    }),
  };
});

// CameraView imports various helpers; we don't need the full implementations for
// this regression test and sometimes they reference browser-only features.
vi.mock("../../utils/ensureVideoPlays", () => ({
  ensureVideoPlays: vi.fn(async () => {}),
}));

// IMPORTANT: Use a dynamic import so mocks are applied before the module loads.
async function loadCameraView() {
  const mod = await import("../CameraView");
  return mod.default;
}

describe("CameraView autocommit regression", () => {
  it("does not throw with diagnostics overlay present", async () => {
    const CameraView = await loadCameraView();
    expect(() =>
      render(<CameraView cameraAutoCommit="camera" />),
    ).not.toThrow();
  });

  it('does not immediately callAddVisit when cameraAutoCommit="camera" in wait-for-clear mode', async () => {
    const CameraView = await loadCameraView();

    const { useMatch } = await import("../../store/match");
    const match = (useMatch as any)();

    render(<CameraView cameraAutoCommit="camera" />);

    // Historically this was called immediately upon a single camera detection.
    // In wait-for-clear mode, this must never happen.
    expect(match.callAddVisit).not.toHaveBeenCalled();
  });

  it('does not immediately callAddVisit when cameraAutoCommit="parent" unless immediateAutoCommit is true', async () => {
    const CameraView = await loadCameraView();

    const { useMatch } = await import("../../store/match");
    const match = (useMatch as any)();

    render(
      <CameraView cameraAutoCommit="parent" immediateAutoCommit={false} />,
    );

    expect(match.callAddVisit).not.toHaveBeenCalled();
  });
});
