// Very lightweight checkout suggestions. For proper coverage consider a full table.
// Returns up to a few route strings like "T20 T20 D20" for a given remaining.

const doubles = [
  'D1','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12','D13','D14','D15','D16','D17','D18','D19','D20','DB'
]

function dVal(tag: string): number { if (tag === 'DB') return 50; const n = Number(tag.slice(1)); return n*2 }

function prefsDoubleScore(fav: string): number {
  if (!doubles.includes(fav)) return 32 // default D16
  return dVal(fav)
}

export function suggestCheckouts(remaining: number, favoriteDouble: string = 'D16'): string[] {
  if (remaining > 170 || remaining <= 1) return []
  // Simple known highest routes for popular numbers, then fall back to greedy towards favourite double
  const hardcoded: Record<number, string[]> = {
    170: ['T20 T20 DB'], 167: ['T20 T19 DB'], 164: ['T20 T18 DB'], 161: ['T20 T17 DB'], 160: ['T20 T20 D20'],
    158: ['T20 T20 D19'], 157: ['T20 T19 D20'], 156: ['T20 T20 D18'], 155: ['T20 T19 D19'], 154: ['T20 T18 D20'],
    153: ['T20 T19 D18'], 152: ['T20 T20 D16'], 151: ['T20 T17 D20'], 150: ['T20 T18 D18'], 149: ['T20 T19 D16'],
    148: ['T20 T16 D20'], 147: ['T20 T17 D18'], 146: ['T20 T18 D16'], 145: ['T20 T15 D20'], 144: ['T20 T20 D12'],
    141: ['T20 T19 D12'], 140: ['T20 T20 D10'], 137: ['T20 T19 D10'], 136: ['T20 T20 D8'], 132: ['BULL T14 D20','T20 T12 D8'],
    130: ['T20 T20 D5','T20 T18 D8'], 129: ['T19 T16 D12'], 128: ['T18 T14 D16'], 127: ['T20 T17 D8'], 126: ['T19 T19 D6'],
    121: ['T20 11 D20','T20 T15 D8'], 120: ['T20 20 D20','T20 S20 D20'], 110: ['T20 10 D20'], 100: ['T20 D20'], 99: ['T19 10 D16','T19 S10 D16'], 97: ['T19 D20'],
    96: ['T20 D18'], 95: ['T19 D19'], 94: ['T18 D20'], 92: ['T20 D16'], 90: ['T18 D18','T20 D15'], 86: ['T18 D16'], 84: ['T20 D12','T16 D18'],
    82: ['BULL D16','T14 D20'], 81: ['T19 D12'], 80: ['T20 D10','D20 D20'], 78: ['T18 D12'], 76: ['T20 D8','T16 D14'], 74: ['T14 D16','T18 D10'],
    72: ['T16 D12','T20 D6'], 70: ['T18 D8','S20 BULL'], 68: ['T20 D4','T16 D10'], 66: ['T10 D18','T14 D12'], 64: ['T16 D8','D16 D16'],
    62: ['T10 D16','T12 D13'], 60: ['20 D20','S20 D20'], 58: ['18 D20','S18 D20'], 56: ['16 D20','S16 D20'], 54: ['14 D20','S14 D20'],
    52: ['20 D16','S20 D16'], 50: ['BULL','10 D20'], 48: ['16 D16','S16 D16'], 46: ['14 D16'], 44: ['12 D16'], 42: ['10 D16'],
    40: ['D20'], 38: ['D19'], 36: ['D18'], 34: ['D17'], 32: ['D16'], 30: ['D15'], 28: ['D14'], 26: ['D13'], 24: ['D12'], 22: ['D11'], 20: ['D10'], 18: ['D9'], 16: ['D8'], 14: ['D7'], 12: ['D6'], 10: ['D5'], 8: ['D4'], 6: ['D3'], 4: ['D2'], 2: ['D1']
  }
  if (hardcoded[remaining]) return hardcoded[remaining]
  // Greedy fallback: aim to leave favourite double if possible in two darts
  const target = prefsDoubleScore(favoriteDouble)
  const routes: string[] = []
  // Try to hit a treble/big single that leaves the fav double
  for (const t of [60, 57, 54, 51, 48]) { // T20..T16
    const left = remaining - t
    if (left === target) { routes.push(`T${t/3} ${favoriteDouble}`); break }
  }
  if (!routes.length) {
    for (const s of [20, 19, 18, 17, 16, 15]) {
      const left = remaining - s
      if (left === target) { routes.push(`${s} ${favoriteDouble}`); break }
    }
  }
  return routes
}

export function sayScore(name: string, scored: number, remaining: number, voiceName?: string, opts?: { volume?: number; checkoutOnly?: boolean }) {
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    const msg = new SpeechSynthesisUtterance()
    const isCheckout = remaining <= 170 && remaining > 0
    if (opts?.checkoutOnly && !isCheckout) return
    msg.text = isCheckout ? `${name}, you have ${remaining} remaining.` : `${scored}`
    if (voiceName) {
      const v = synth.getVoices().find(v => v.name === voiceName)
      if (v) msg.voice = v
    }
    if (typeof opts?.volume === 'number') msg.volume = Math.max(0, Math.min(1, opts.volume))
    msg.rate = 1.0
    msg.pitch = 1.0
    synth.speak(msg)
  } catch {}
}
