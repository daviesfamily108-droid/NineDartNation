import { buildDiagnosticBundle } from "../../utils/calibrationDiagnostics";

test("buildDiagnosticBundle returns expected shape even without canvas", async () => {
  const bundle = await buildDiagnosticBundle({
    H: null,
    errorPx: null,
    imageSize: { w: 320, h: 240 },
    overlaySize: { w: 400, h: 300 },
    pointMappings: [],
    captureCanvas: null,
    extra: { test: true },
  });
  expect(bundle).toHaveProperty("createdAt");
  expect(bundle).toHaveProperty("H", null);
  expect(bundle).toHaveProperty("imageSize");
  expect(bundle.imageSize).toEqual({ w: 320, h: 240 });
  expect(
    bundle.screenshotDataUrl === null ||
      typeof bundle.screenshotDataUrl === "string",
  ).toBeTruthy();
});
