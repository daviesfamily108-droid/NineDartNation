import { DartDetector } from "../dartDetector";

function makeImageData(width: number, height: number, gray = 100) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    data[p] = gray;
    data[p + 1] = gray;
    data[p + 2] = gray;
    data[p + 3] = 255;
  }
  return { data, width, height } as ImageData;
}

describe("DartDetector basic detection - small blob", () => {
  it("detects a small synthetic dart blob when configured", () => {
    const width = 160;
    const height = 120;
  const det = new DartDetector({ minArea: 6, thresh: 1, requireStableN: 1 });

    const bg = makeImageData(width, height, 100);
    det.updateBackground(bg, 1.0);

    // Create a frame with a small bright blob near center
    const frame = makeImageData(width, height, 100);
    const centerX = Math.floor(width / 2);
    const centerY = Math.floor(height / 2);
    // Use a darker blob (black) instead of bright; the detector ignores specular highlights
    for (let y = centerY - 8; y <= centerY + 8; y++) {
      for (let x = centerX - 6; x <= centerX + 6; x++) {
        const idx = (y * width + x) * 4;
        frame.data[idx] = 0;
        frame.data[idx + 1] = 0;
        frame.data[idx + 2] = 0;
      }
    }

    // warm up background statistics a few frames with clear background
    for (let i = 0; i < 6; i++) det.detect(bg as any as ImageData);
    let detection: any = null;
    for (let i = 0; i < 4; i++) {
      detection = det.detect(frame as any as ImageData);
      if (detection) break;
    }
    expect(detection).not.toBeNull();
    if (detection) {
        expect(detection.tip.x).toBeGreaterThanOrEqual(centerX - 6);
        expect(detection.tip.x).toBeLessThanOrEqual(centerX + 6);
      expect(detection.confidence).toBeGreaterThan(0.3);
    }
  });
});
