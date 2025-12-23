export function threeDartAverage(totalScore: number, darts: number): number {
  if (darts === 0) return 0;
  return (totalScore / darts) * 3;
}

export function formatAvg(n?: number) {
  return (n ?? 0).toFixed(2);
}
