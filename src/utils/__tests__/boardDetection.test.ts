import { describe, it, expect } from "vitest";
import { detectBoard } from "../boardDetection";

describe("boardDetection basic behavior (unit-friendly)", () => {
  it("detects concentric rings drawn on canvas using a synthetic ImageData", () => {
    // Setup a canvas with drawn concentric circles approximating the board
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    // Instead of using a real canvas context which isn't available in jsdom,
    // produce a synthetic ImageData with ring edges by painting precise pixels
    const width = 800;
    const height = 600;
    const data = new Uint8ClampedArray(width * height * 4);
    // Fill background with mid-gray
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      data[idx] = 128;
      data[idx + 1] = 128;
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    function paintRing(radius: number, thickness = 2) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.hypot(dx, dy);
          if (Math.abs(dist - radius) <= thickness) {
            const idx = (y * width + x) * 4;
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 255;
          }
        }
      }
    }
    paintRing(170, 2); // double
    paintRing(99, 2); // treble
    paintRing(15, 1); // bull

    // Create a minimal fake canvas object with getContext that returns getImageData
    const fakeCanvas: any = {
      width,
      height,
      getContext: (kind: string) => ({
        getImageData: (sx: number, sy: number, w: number, h: number) => ({ data, width, height }),
      }),
    };
    const res = detectBoard(fakeCanvas as any as HTMLCanvasElement);
    expect(res).toBeDefined();
    // Detection may produce lower confidence but should find homography and calibration points
    expect(Array.isArray(res.calibrationPoints)).toBeTruthy();
    expect(res.calibrationPoints.length === 4 || res.homography !== null).toBeTruthy();
  });
});
