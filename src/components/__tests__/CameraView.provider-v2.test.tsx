import React, { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import CameraView, { type CameraViewHandle } from "../CameraView.js";

// Minimal canvas shim for jsdom
beforeEach(() => {
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

// Force the userSettings hook to return built-in-v2 provider.
// We only need a handful of fields for the effect to mount.
vi.mock("../../store/userSettings", async () => {
  const actual = await vi.importActual<any>("../../store/userSettings");
  // zustand store: preserve getState but override hook selector reads
  const state = {
    autoscoreProvider: "built-in-v2",
    autoscoreWsUrl: "",
    autoCommitMode: "wait-for-clear",
    confirmUncertainDarts: true,
    autoScoreConfidenceThreshold: 0.85,
    harshLightingMode: false,
    enhanceBigTrebles: false,
    cameraEnabled: true,
    preferredCameraLocked: false,
    hideCameraOverlay: false,
    cameraAspect: "wide",
    cameraFitMode: "fit",
    cameraScale: 1,
  };

  return {
    ...actual,
    useUserSettings: Object.assign(
      (sel: any) => {
        try {
          return sel(state);
        } catch {
          return undefined;
        }
      },
      {
        getState: () => state,
      },
    ),
  };
});

describe("CameraView autoscoreProvider built-in-v2", () => {
  it("mounts without throwing (provider is accepted)", () => {
    const ref = createRef<CameraViewHandle>();
    expect(() =>
      render(<CameraView ref={ref as any} scoringMode="x01" />),
    ).not.toThrow();
  });

  it("does not crash when provider is built-in-v2 (even without cameras)", async () => {
    // Avoid real camera access in tests.
    (navigator as any).mediaDevices = {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [],
        getVideoTracks: () => [],
        getAudioTracks: () => [],
      })),
      enumerateDevices: vi.fn(async () => []),
    };

    const ref = createRef<CameraViewHandle>();
    const out = render(<CameraView ref={ref as any} scoringMode="x01" />);

    // Let effects run; we only assert we didn't throw during async startup.
    await new Promise((r) => setTimeout(r, 50));

    out.unmount();
  });
});
