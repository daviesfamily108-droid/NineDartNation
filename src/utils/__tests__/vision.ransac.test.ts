import {
  canonicalRimTargets,
  ransacHomography,
  rmsError,
  rotateHomography,
  scaleHomography,
  translateHomography,
  applyHomography,
} from "../vision";

// deterministic RNG for tests
function seededRng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    // simple LCG
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0xfffffff) / 0x10000000;
  };
}

test("ransacHomography tolerates outliers and recovers a good fit", () => {
  const src = canonicalRimTargets("outer");
  // Build a ground-truth homography: rotate 10deg, scale, translate
  let Htrue = rotateHomography(
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
    (10 * Math.PI) / 180,
  );
  Htrue = scaleHomography(Htrue, 1.15, 1.15);
  Htrue = translateHomography(Htrue, 50, 30);

  const dst = src.map((p) => applyHomography(Htrue, p));

  // Add outliers to a couple of dst points
  const dstNoisy = dst.map((p, i) => {
    if (i === 1 || i === 3) {
      return { x: p.x + 200 + i * 10, y: p.y + 150 + i * 5 };
    }
    // small noise
    return {
      x: p.x + (Math.random() - 0.5) * 1.5,
      y: p.y + (Math.random() - 0.5) * 1.5,
    };
  });

  const rng = seededRng(42);
  const res = ransacHomography(src, dstNoisy, {
    thresholdPx: 8,
    maxIter: 200,
    rng,
  });
  expect(res.H).not.toBeNull();
  const inlierCount = res.inliers.filter(Boolean).length;
  // Should find at least 3 good inliers out of 5 (we added 2 outliers)
  expect(inlierCount).toBeGreaterThanOrEqual(3);
  expect(res.errorPx).not.toBeNull();
  if (res.H && res.errorPx !== null) {
    expect(res.errorPx).toBeLessThan(10);
  }
});
