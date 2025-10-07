// Simple profanity filter: replaces detected profane words with asterisks of the same length.
// Note: This is a lightweight heuristic and not exhaustive.

const patterns: RegExp[] = [
  /\b(f+[\W_]*u+[\W_]*c+[\W_]*k+)\b/gi,
  /\b(s+[\W_]*h+[\W_]*i+[\W_]*t+)\b/gi,
  /\b(b+[\W_]*i+[\W_]*t+[\W_]*c+[\W_]*h+)\b/gi,
  /\b(a+[\W_]*s+[\W_]*s+[\W_]*h+[\W_]*o+[\W_]*l+[\W_]*e+)\b/gi,
  /\b(d+[\W_]*a+[\W_]*m+[\W_]*n+)\b/gi,
  /\b(c+[\W_]*r+[\W_]*a+[\W_]*p+)\b/gi,
  /\b(p+[\W_]*i+[\W_]*s+[\W_]*s+)\b/gi,
]

function starify(match: string) {
  // Preserve whitespace/punct positions; just replace letters/numbers with *
  return match.replace(/[\p{L}\p{N}]/gu, '*')
}

export function censorProfanity(input: string): string {
  if (!input) return input
  let out = input
  for (const re of patterns) {
    out = out.replace(re, (m) => starify(m))
  }
  return out
}

export function containsProfanity(input: string): boolean {
  if (!input) return false
  return patterns.some((re) => re.test(input))
}
