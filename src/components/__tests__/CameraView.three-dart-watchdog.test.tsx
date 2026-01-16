import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, act } from "@testing-library/react";

import CameraView from "../CameraView";

// Minimal mocks so CameraView test helpers are available and the component can mount.
vi.mock("../../store/match", async () => {
  const actual: any = await vi.importActual("../../store/match");
  return {
    ...actual,
    useMatch: (sel: any) =>
      sel({
        roomId: null,
        startingScore: 501,
        inProgress: true,
        currentPlayerIdx: 0,
        players: [
          {
            id: "p1",
            name: "Alice",
            legs: [{ totalScoreRemaining: 501, dartsThrown: 0 }],
          },
        ],
      }),
  };
});

vi.mock("../../store/userSettings", async () => {
  const actual: any = await vi.importActual("../../store/userSettings");
  const state = {
    // Turn watchdog is implemented by the existing per-dart timer.
    dartTimerEnabled: true,
    dartTimerSeconds: 1,
    setPreferredCamera: vi.fn(),
    setCameraEnabled: vi.fn(),
    setHideCameraOverlay: vi.fn(),
    setCameraFitMode: vi.fn(),
    setCameraAspect: vi.fn(),
    setCameraScale: vi.fn(),
  } as any;

  const useUserSettings: any = (sel: any) =>
    typeof sel === "function" ? sel(state) : state;
  useUserSettings.getState = () => state;

  return {
    ...actual,
    useUserSettings,
  };
});

// The camera session store is referenced for video element wiring; keep it inert.
vi.mock("../../store/cameraSession", async () => {
  const actual: any = await vi.importActual("../../store/cameraSession");
  const state = {
    mode: "local",
    streaming: false,
    setMode: vi.fn(),
    setStreaming: vi.fn(),
    setVideoElementRef: vi.fn(),
    getMediaStream: vi.fn(async () => null),
  } as any;
  return {
    ...actual,
    useCameraSession: (sel: any) =>
      typeof sel === "function" ? sel(state) : state,
  };
});

// Avoid speech synthesis side-effects.
Object.defineProperty(window, "speechSynthesis", {
  value: undefined,
  configurable: true,
});

// Prevent CameraView from trying to start a real camera in JSDOM.
// Return a MediaStream-like object with the methods CameraView expects.
const fakeStream = {
  getVideoTracks: () => [],
  getTracks: () => [],
} as any;
try {
  (navigator as any).mediaDevices = (navigator as any).mediaDevices || {};
  (navigator as any).mediaDevices.getUserMedia = vi.fn(async () => fakeStream);
} catch {}

describe("CameraView three-dart watchdog", () => {
  test("when time expires with 2 darts pending, it auto-fills the 3rd as MISS and commits 3 darts", async () => {
    vi.useFakeTimers();

    const onAddVisit = vi.fn();
    const onVisitCommitted = vi.fn();

    const ref = React.createRef<any>();

    render(
      <CameraView
        ref={ref}
        disableDetection={true}
        // Keep commit immediate so we can observe onVisitCommitted without needing
        // the board-clear event.
        immediateAutoCommit={true}
        scoringMode="x01"
        onAddVisit={onAddVisit}
        onVisitCommitted={onVisitCommitted}
      />,
    );

    // Add two darts.
    act(() => {
      ref.current.__test_addDart(60, "S20 20", "SINGLE", {
        source: "manual",
        calibrationValid: true,
      });
      ref.current.__test_addDart(60, "S20 20", "SINGLE", {
        source: "manual",
        calibrationValid: true,
      });
    });

    // Let the per-dart timer expire.
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    // Third dart should be filled as MISS and the visit should be committed.
    expect(onAddVisit).toHaveBeenCalled();

    const lastAddVisit =
      onAddVisit.mock.calls[onAddVisit.mock.calls.length - 1];
    const [_score, darts] = lastAddVisit;
    expect(darts).toBe(3);

    expect(onVisitCommitted).toHaveBeenCalled();
    const lastCommit =
      onVisitCommitted.mock.calls[onVisitCommitted.mock.calls.length - 1];
    expect(lastCommit[1]).toBe(3);

    vi.useRealTimers();
  });
});
