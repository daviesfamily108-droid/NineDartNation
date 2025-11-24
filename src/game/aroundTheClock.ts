export type ATCState = {
  target: number; // 1..20 then 25 (outer bull) then 50 (inner)
  finished: boolean;
};

export const ATC_ORDER: number[] = [
  ...Array.from({ length: 20 }, (_, i) => i + 1),
  25,
  50,
];

export function nextTarget(current: number): number | null {
  const idx = ATC_ORDER.indexOf(current);
  if (idx < 0) return ATC_ORDER[0];
  if (idx >= ATC_ORDER.length - 1) return null;
  return ATC_ORDER[idx + 1];
}

export function isCorrectHit(value: number, target: number): boolean {
  return value === target;
}
