import { describe, it, expect } from "vitest";
import { sampleRing, scaleHomography, BoardRadii } from "../vision.js";

describe("Overlay scaling math", () => {
  it("produces identical drawn points whether scaling via overlay preservation or native canvas scaling", () => {
    const H: any = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // identity homography
    const imageSize = { w: 1600, h: 1200 };
    const overlaySaved = { w: 800, h: 600 }; // preserved overlay at lock time
    const currentCanvas = { w: 1200, h: 900 }; // current rendering canvas size

    const sxSaved = overlaySaved.w / imageSize.w;
    const sySaved = overlaySaved.h / imageSize.h;
    const sxCurrent = currentCanvas.w / imageSize.w;
    const syCurrent = currentCanvas.h / imageSize.h;

    const HsSaved = scaleHomography(H, sxSaved, sySaved);
    const HsCurrent = scaleHomography(H, sxCurrent, syCurrent);

    const steps = 32;
    const ring = BoardRadii.trebleOuter;
    const ptsSaved = sampleRing(HsSaved as any, ring, steps);
    const ptsCurrent = sampleRing(HsCurrent as any, ring, steps);

    const drawScaleX = currentCanvas.w / overlaySaved.w;
    const drawScaleY = currentCanvas.h / overlaySaved.h;

    for (let i = 0; i < steps; i++) {
      const pSaved = ptsSaved[i];
      const pDrawSaved = { x: pSaved.x * drawScaleX, y: pSaved.y * drawScaleY };
      const pCurrent = ptsCurrent[i];
      expect(pDrawSaved.x).toBeCloseTo(pCurrent.x, 6);
      expect(pDrawSaved.y).toBeCloseTo(pCurrent.y, 6);
    }
  });
});
