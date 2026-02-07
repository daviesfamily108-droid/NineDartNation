import { detectBoard, refineRingDetection } from "../utils/boardDetection";

type DetectMessage = {
  type: "detect";
  bitmap: ImageBitmap;
};

type WorkerMessage = DetectMessage;

const ctx2d = (canvas: OffscreenCanvas) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Unable to get 2D context for detection");
  return ctx;
};

self.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
  const data = event.data;
  if (!data || data.type !== "detect") return;
  const { bitmap } = data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = ctx2d(canvas);
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
    const detection = detectBoard(canvas as unknown as HTMLCanvasElement);
    const refined = detection ? refineRingDetection(detection) : detection;
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "result",
      detection: refined ?? detection,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    (self as DedicatedWorkerGlobalScope).postMessage({ error: message });
  } finally {
    try {
      bitmap.close?.();
    } catch {}
  }
});
