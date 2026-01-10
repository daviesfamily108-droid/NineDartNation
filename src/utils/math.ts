// Small math helpers extracted from vision utilities to avoid circular import
// and temporal-dead-zone issues during module initialization.
export function thetaRadToDeg(theta: number | null): number {
  if (theta === null) return 0;
  return -(theta * 180) / Math.PI; // Negate to match previous UI convention
}

// Backwards-compatible alias for callers still using the old name
export const thetaToDegrees = thetaRadToDeg;
