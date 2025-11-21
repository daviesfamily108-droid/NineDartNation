import { detectBoard, refineRingDetection } from "../utils/boardDetection";

// Worker receives an ImageBitmap and runs the detection on an OffscreenCanvas.
self.onmessage = async (ev: MessageEvent) => {
  try {
    const { type, bitmap } = ev.data || {};
    if (type !== "detect" || !bitmap) return;
    // Create offscreen canvas of same size as bitmap
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      postMessage({ error: "OffscreenCanvas context unavailable" });
      return;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Run detection
    let detection = detectBoard(canvas as any as HTMLCanvasElement);
    detection = refineRingDetection(detection as any);
    // Transfer results back (serializable fields only)
    postMessage({ type: "result", detection });
  } catch (err) {
    postMessage({
      error: (err as any)?.message || String(err) || "Worker error",
    });
  }
};

export {};
