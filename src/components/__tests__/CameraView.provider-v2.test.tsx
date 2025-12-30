import React, { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import CameraView, { type CameraViewHandle } from "../CameraView";

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
    cameraEnabled: true,
    preferredCameraLocked: false,
    hideCameraOverlay: false,
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
    expect(() => render(<CameraView ref={ref as any} scoringMode="x01" />)).not.toThrow();
  });
});
