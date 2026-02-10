import type { Homography, Point } from "./vision.js";

export interface DiagnosticBundle {
  createdAt: number;
  H: Homography | null;
  errorPx: number | null;
  confidence?: number | null;
  imageSize?: { w: number; h: number } | null;
  overlaySize?: { w: number; h: number } | null;
  pointMappings?: Array<{
    index: number;
    imageSpace: Point;
    boardSpace?: Point | null;
  }>;
  extra?: any;
  screenshotDataUrl?: string | null;
}

// Assemble a diagnostic bundle. `captureCanvas` may be undefined in headless/test env.
export async function buildDiagnosticBundle(options: {
  H: Homography | null;
  errorPx: number | null;
  confidence?: number | null;
  imageSize?: { w: number; h: number } | null;
  overlaySize?: { w: number; h: number } | null;
  pointMappings?: Array<{
    index: number;
    imageSpace: Point;
    boardSpace?: Point | null;
  }>;
  captureCanvas?: HTMLCanvasElement | null;
  extra?: any;
}): Promise<DiagnosticBundle> {
  const {
    H,
    errorPx,
    confidence,
    imageSize,
    overlaySize,
    pointMappings,
    captureCanvas,
    extra,
  } = options;
  let screenshotDataUrl: string | null = null;
  try {
    if (captureCanvas && typeof captureCanvas.toDataURL === "function") {
      screenshotDataUrl = captureCanvas.toDataURL("image/png");
    }
  } catch (e) {
    // ignore - headless envs may throw
    screenshotDataUrl = null;
  }

  return {
    createdAt: Date.now(),
    H: H || null,
    errorPx: typeof errorPx === "number" ? errorPx : null,
    confidence: typeof confidence === "number" ? confidence : null,
    imageSize: imageSize || null,
    overlaySize: overlaySize || null,
    pointMappings: pointMappings || [],
    extra: extra || null,
    screenshotDataUrl,
  };
}

export function downloadDiagnostic(
  bundle: DiagnosticBundle,
  filename?: string,
) {
  const name =
    filename ||
    `ndn-diagnostic-${new Date(bundle.createdAt).toISOString()}.json`;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type DiagnosticPayload = {
  createdAt: number;
  H: Homography | null;
  errorPx: number | null;
  imageSize?: { w: number; h: number } | null;
  overlaySize?: { w: number; h: number } | null;
  calibrationPoints?: Point[];
  pointMappings?: Array<{
    index: number;
    imageSpace: Point;
    boardSpace?: Point;
  }>; // boardSpace may be missing if H null
  notes?: string[];
  sampleImageDataUrl?: string | null;
};

export function createDiagnosticPayload(opts: {
  H: Homography | null;
  errorPx: number | null;
  imageSize?: { w: number; h: number } | null;
  overlaySize?: { w: number; h: number } | null;
  calibrationPoints?: Point[];
  pointMappings?: Array<{
    index: number;
    imageSpace: Point;
    boardSpace?: Point;
  }>;
  notes?: string[];
  sampleImageDataUrl?: string | null;
}): DiagnosticPayload {
  return {
    createdAt: Date.now(),
    H: opts.H,
    errorPx: opts.errorPx,
    imageSize: opts.imageSize ?? null,
    overlaySize: opts.overlaySize ?? null,
    calibrationPoints: opts.calibrationPoints ?? [],
    pointMappings: opts.pointMappings ?? [],
    notes: opts.notes ?? [],
    sampleImageDataUrl: opts.sampleImageDataUrl ?? null,
  };
}

export function exportDiagnosticBundle(payload: DiagnosticPayload) {
  try {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ndn-diagnostic-${payload.createdAt}.json`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to export diagnostic bundle:", err);
  }
}
