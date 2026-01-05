import { createScoringValidator } from "../scoringAccuracy";

describe("ScoringAccuracyValidator metrics", () => {
  it("calculates successRate and averages correctly", () => {
    const validator = createScoringValidator();

    // Mock calibration (valid)
    const calibration: any = {
      success: true,
      confidence: 95,
      errorPx: 1,
      // Homography must be non-zero in every element for isValidHomography()
      homography: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    };

    // Two good detections
    const good = { score: 60, ring: "TRIPLE", confidence: 0.9, boardPoint: { x: 0, y: 0 } } as any;
    const good2 = { score: 20, ring: "SINGLE", confidence: 0.9, boardPoint: { x: 0, y: 0 } } as any;

    // One bad detection (low confidence)
    const bad = { score: 0, ring: "MISS", confidence: 0.2, boardPoint: { x: 0, y: 0 } } as any;

    validator.validateScoring(good, calibration);
    validator.validateScoring(good2, calibration);
    validator.validateScoring(bad, calibration);

    const m = validator.getMetrics();

    expect(m.totalDetections).toBe(3);
    expect(m.acceptedCount).toBe(2);
    expect(m.rejectedCount).toBe(1);
    expect(m.totalDartsScored).toBe(3);
    // successRate should be accepted / detections = 2 / 3
    expect(m.successRate).toBeCloseTo(2 / 3, 6);
    // averageConfidence should be mean of [0.9, 0.9, 0.2]
    expect(m.averageConfidence).toBeCloseTo((0.9 + 0.9 + 0.2) / 3, 6);
  });
});
