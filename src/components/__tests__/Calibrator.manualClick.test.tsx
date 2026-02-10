import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Ensure localStorage stub exists for persist middleware
beforeEach(() => {
  if (
    typeof (window as any).localStorage === "undefined" ||
    typeof (window as any).localStorage.setItem !== "function"
  ) {
    (window as any).localStorage = {
      _store: {} as Record<string, string>,
      getItem: function (k: string) {
        return Object.prototype.hasOwnProperty.call(this._store, k)
          ? this._store[k]
          : null;
      },
      setItem: function (k: string, v: string) {
        this._store[k] = String(v);
      },
      removeItem: function (k: string) {
        delete this._store[k];
      },
      clear: function () {
        for (const k of Object.keys(this._store)) delete this._store[k];
      },
      key: function (i: number) {
        return Object.keys(this._store)[i] || null;
      },
      get length() {
        return Object.keys(this._store).length;
      },
    } as Storage;
  }
});

vi.mock("../../utils/vision", async () => {
  const actual = await vi.importActual<any>("../../utils/vision");
  return {
    ...actual,
    computeHomographyDLT: vi.fn(() => [1, 0, 0, 0, 1, 0, 0, 0, 1]),
    rmsError: vi.fn(() => 2.5),
  };
});

describe("Calibrator manual click mapping", () => {
  it("does not apply calibration when manual clicks are disabled", async () => {
    const { default: Calibrator } = await import("../Calibrator.js");
    const { useCalibration } = await import("../../store/calibration.js");

    const { container: calContainer } = render(<Calibrator />);

    // Find the canvas element and ensure it has a resolution
    const canvas = calContainer.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas).toBeTruthy();
    // Set intrinsic size
    canvas.width = 800;
    canvas.height = 600;
    // Mock display rect
    (canvas.getBoundingClientRect as any) = () => ({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
    });

    // Find video and set intrinsic resolution
    const video = calContainer.querySelector(
      "video",
    ) as HTMLVideoElement | null;
    if (video) {
      // jsdom doesn't implement videoWidth/videoHeight - define them as properties
      try {
        Object.defineProperty(video, "videoWidth", {
          configurable: true,
          value: 1280,
        });
        Object.defineProperty(video, "videoHeight", {
          configurable: true,
          value: 720,
        });
      } catch {
        // ignore if environment doesn't allow
      }
    }

    // Simulate 5 clicks in different display positions
    fireEvent.click(canvas, { clientX: 50, clientY: 50 });
    fireEvent.click(canvas, { clientX: 350, clientY: 50 });
    fireEvent.click(canvas, { clientX: 350, clientY: 250 });
    fireEvent.click(canvas, { clientX: 50, clientY: 250 });
    fireEvent.click(canvas, { clientX: 200, clientY: 150 });

    await waitFor(() => {
      const s = useCalibration.getState();
      expect(s.imageSize).toBeNull();
      expect(s.overlaySize).toBeNull();
    });
  });
});
