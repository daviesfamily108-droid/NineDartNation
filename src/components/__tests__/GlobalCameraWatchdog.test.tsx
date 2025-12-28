import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import GlobalCameraWatchdog from "../GlobalCameraWatchdog";
import { NDN_CAMERA_RECOVERY_EVENT } from "../../utils/cameraRecoveryEvents";

// The watchdog now delegates recovery dispatch to a helper; mock it so we can assert behavior.
vi.mock("../../utils/cameraRecovery", () => {
  return {
    dispatchCameraRecovery: vi.fn(),
  };
});

// Mock stores used by the watchdog
vi.mock("../../store/userSettings", () => {
  let state: any = { cameraEnabled: true, preferredCameraLabel: undefined };
  return {
    useUserSettings: (sel: any) => (sel ? sel(state) : state),
  };
});

vi.mock("../../store/cameraSession", () => {
  let videoTime = 0;
  const video = {
    currentTime: 0,
    srcObject: null as any,
    play: vi.fn(() => Promise.resolve()),
  } as any;

  const session: any = {
    isStreaming: true,
    mode: "local",
    getMediaStream: vi.fn(() => ({} as any)),
    getVideoElementRef: vi.fn(() => {
      video.currentTime = videoTime;
      return video;
    }),
  };

  return {
    useCameraSession: () => session,
    __setVideoTime: (t: number) => {
      videoTime = t;
    },
    __session: session,
  };
});

const camMod = await import("../../store/cameraSession");

describe("GlobalCameraWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("dispatches recovery when video stalls", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const recMod = await import("../../utils/cameraRecovery");
    const rec = (recMod as any).dispatchCameraRecovery as ReturnType<typeof vi.fn>;
    render(<GlobalCameraWatchdog />);

    // Keep currentTime constant for >4 ticks
    (camMod as any).__setVideoTime(1);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);

    // Should have attempted recovery via helper
    expect(rec).toHaveBeenCalled();

    // Should also emit the UI event so we can show the recovery toast.
    expect(
      dispatchSpy.mock.calls.some(
        (c) => (c[0] as any)?.type === (NDN_CAMERA_RECOVERY_EVENT as any),
      ),
    ).toBe(true);
  });
});
