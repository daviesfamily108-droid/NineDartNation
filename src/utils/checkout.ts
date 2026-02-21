// Very lightweight checkout suggestions. For proper coverage consider a full table.
// Returns up to a few route strings like "T20 T20 D20" for a given remaining.

export type CallerStyle = "professional" | "energetic" | "classic";

/**
 * Score a voice for quality ranking.
 * Higher score = better quality. Neural/Online (Natural) voices in Edge/Chrome
 * sound dramatically better than legacy offline voices.
 */
function voiceQualityScore(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let score = 0;
  // Neural / Online (Natural) voices are top tier (Edge provides these)
  if (n.includes("online (natural)") || n.includes("neural")) score += 100;
  // "Natural" keyword (non-online variants are still good)
  else if (n.includes("natural")) score += 80;
  // Google voices are decent quality
  if (n.includes("google")) score += 40;
  // Microsoft voices (non-legacy) are good
  if (
    n.includes("microsoft") &&
    !n.includes("david") &&
    !n.includes("zira") &&
    !n.includes("mark")
  )
    score += 30;
  // Premium / Enhanced keywords
  if (n.includes("premium") || n.includes("enhanced")) score += 60;
  // Male voices suit darts calling better (traditional)
  if (
    n.includes("ryan") ||
    n.includes("guy") ||
    n.includes("thomas") ||
    n.includes("ralf") ||
    n.includes("george") ||
    n.includes("male")
  )
    score += 15;
  // British English is ideal for darts
  if (v.lang === "en-GB" || v.lang.startsWith("en-GB")) score += 25;
  // Other English locales are fine
  else if (v.lang.startsWith("en")) score += 10;
  // Remote/cloud voices tend to be higher quality
  if (!v.localService) score += 20;
  return score;
}

/**
 * Get recommended voices for natural-sounding darts calling.
 * Strongly prefers neural/natural voices (Edge "Online (Natural)", Google, etc.)
 * and British English voices which suit darts calling best.
 */
export function getRecommendedVoices(): SpeechSynthesisVoice[] {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return [];
    const voices = synth.getVoices();
    // Only include English voices
    const english = voices.filter((v) => v.lang.startsWith("en"));
    // Sort by quality score descending
    return english.sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a));
  } catch {
    return [];
  }
}

/**
 * Get a human-readable quality label for a voice (shown in settings dropdown)
 */
export function getVoiceQualityLabel(v: SpeechSynthesisVoice): string {
  const n = v.name.toLowerCase();
  if (n.includes("online (natural)") || n.includes("neural"))
    return "★★★ Neural";
  if (n.includes("natural") || n.includes("premium") || n.includes("enhanced"))
    return "★★ Natural";
  if (n.includes("google")) return "★★ Google";
  if (n.includes("microsoft") && !n.includes("david") && !n.includes("zira"))
    return "★ Microsoft";
  if (!v.localService) return "★ Cloud";
  return "";
}

/**
 * Get the best default voice for darts calling
 */
export function getBestCallerVoice(): SpeechSynthesisVoice | null {
  const recommended = getRecommendedVoices();
  return recommended.length > 0 ? recommended[0] : null;
}

const doubles = [
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "D6",
  "D7",
  "D8",
  "D9",
  "D10",
  "D11",
  "D12",
  "D13",
  "D14",
  "D15",
  "D16",
  "D17",
  "D18",
  "D19",
  "D20",
  "DB",
];

function dVal(tag: string): number {
  if (tag === "DB") return 50;
  const n = Number(tag.slice(1));
  return n * 2;
}

function prefsDoubleScore(fav: string): number {
  if (!doubles.includes(fav)) return 32; // default D16
  return dVal(fav);
}

export function suggestCheckouts(
  remaining: number,
  favoriteDouble: string = "D16",
): string[] {
  if (remaining > 170 || remaining <= 1) return [];
  // Simple known highest routes for popular numbers, then fall back to greedy towards favourite double
  const hardcoded: Record<number, string[]> = {
    170: ["T20 T20 DB"],
    167: ["T20 T19 DB"],
    164: ["T20 T18 DB"],
    161: ["T20 T17 DB"],
    160: ["T20 T20 D20"],
    158: ["T20 T20 D19"],
    157: ["T20 T19 D20"],
    156: ["T20 T20 D18"],
    155: ["T20 T19 D19"],
    154: ["T20 T18 D20"],
    153: ["T20 T19 D18"],
    152: ["T20 T20 D16"],
    151: ["T20 T17 D20"],
    150: ["T20 T18 D18"],
    149: ["T20 T19 D16"],
    148: ["T20 T16 D20"],
    147: ["T20 T17 D18"],
    146: ["T20 T18 D16"],
    145: ["T20 T15 D20"],
    144: ["T20 T20 D12"],
    141: ["T20 T19 D12"],
    140: ["T20 T20 D10"],
    137: ["T20 T19 D10"],
    136: ["T20 T20 D8"],
    132: ["BULL T14 D20", "T20 T12 D8"],
    130: ["T20 T20 D5", "T20 T18 D8"],
    129: ["T19 T16 D12"],
    128: ["T18 T14 D16"],
    127: ["T20 T17 D8"],
    126: ["T19 T19 D6"],
    121: ["T20 11 D20", "T20 T15 D8"],
    120: ["T20 20 D20", "T20 S20 D20"],
    110: ["T20 10 D20"],
    100: ["T20 D20"],
    99: ["T19 10 D16", "T19 S10 D16"],
    97: ["T19 D20"],
    96: ["T20 D18"],
    95: ["T19 D19"],
    94: ["T18 D20"],
    92: ["T20 D16"],
    90: ["T18 D18", "T20 D15"],
    86: ["T18 D16"],
    84: ["T20 D12", "T16 D18"],
    82: ["BULL D16", "T14 D20"],
    81: ["T19 D12"],
    80: ["T20 D10", "D20 D20"],
    78: ["T18 D12"],
    76: ["T20 D8", "T16 D14"],
    74: ["T14 D16", "T18 D10"],
    72: ["T16 D12", "T20 D6"],
    70: ["T18 D8", "S20 BULL"],
    68: ["T20 D4", "T16 D10"],
    66: ["T10 D18", "T14 D12"],
    64: ["T16 D8", "D16 D16"],
    62: ["T10 D16", "T12 D13"],
    60: ["20 D20", "S20 D20"],
    58: ["18 D20", "S18 D20"],
    56: ["16 D20", "S16 D20"],
    54: ["14 D20", "S14 D20"],
    52: ["20 D16", "S20 D16"],
    50: ["BULL", "10 D20"],
    48: ["16 D16", "S16 D16"],
    46: ["14 D16"],
    44: ["12 D16"],
    42: ["10 D16"],
    40: ["D20"],
    38: ["D19"],
    36: ["D18"],
    34: ["D17"],
    32: ["D16"],
    30: ["D15"],
    28: ["D14"],
    26: ["D13"],
    24: ["D12"],
    22: ["D11"],
    20: ["D10"],
    18: ["D9"],
    16: ["D8"],
    14: ["D7"],
    12: ["D6"],
    10: ["D5"],
    8: ["D4"],
    6: ["D3"],
    4: ["D2"],
    2: ["D1"],
  };
  if (hardcoded[remaining]) return hardcoded[remaining];
  // Greedy fallback: aim to leave favourite double if possible in two darts
  const target = prefsDoubleScore(favoriteDouble);
  const routes: string[] = [];
  // Try to hit a treble/big single that leaves the fav double
  for (const t of [60, 57, 54, 51, 48]) {
    // T20..T16
    const left = remaining - t;
    if (left === target) {
      routes.push(`T${t / 3} ${favoriteDouble}`);
      break;
    }
  }
  if (!routes.length) {
    for (const s of [20, 19, 18, 17, 16, 15]) {
      const left = remaining - s;
      if (left === target) {
        routes.push(`${s} ${favoriteDouble}`);
        break;
      }
    }
  }
  return routes;
}

export function sayScore(
  name: string,
  scored: number,
  remaining: number,
  voiceName?: string,
  opts?: { volume?: number; checkoutOnly?: boolean; style?: CallerStyle },
) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const msg = new SpeechSynthesisUtterance();
    // Clean username: keep only letters and numbers, remove all special characters
    const cleanName = name
      ?.toString()
      .replace(/[^a-zA-Z0-9\s]/g, "") // Remove all special chars
      .replace(/\s+/g, " ") // Normalize spaces
      .trim();
    const spokenName = cleanName || name || "Player";
    const isCheckout = remaining <= 170 && remaining > 0;
    const isOneEighty = scored === 180;
    const shouldAnnounce = !opts?.checkoutOnly || isCheckout || isOneEighty;
    if (!shouldAnnounce) return;

    const style: CallerStyle = opts?.style || "professional";
    const pick = <T>(arr: T[]): T =>
      arr[Math.floor(Math.random() * arr.length)];

    // Natural caller phrases with rich variation per style
    if (isOneEighty) {
      const phrases: Record<CallerStyle, string[]> = {
        professional: [
          `${spokenName}... One hundred... and eighty!`,
          `One hundred and eighty! ${spokenName}!`,
          `${spokenName}, with a maximum! One hundred and eighty!`,
          `It's a maximum! ${spokenName}, one hundred and eighty!`,
          `The maximum! One hundred and eighty for ${spokenName}!`,
        ],
        energetic: [
          `ONE HUNDRED AND EIGHTY! ${spokenName}!`,
          `${spokenName}! MAXIMUM! One hundred and eighty!`,
          `What a visit! ${spokenName} with a maximum! ONE EIGHTY!`,
          `BOOM! One hundred and eighty for ${spokenName}!`,
          `${spokenName} smashes in the maximum! One hundred and eighty!`,
        ],
        classic: [
          `${spokenName}. One hundred and eighty.`,
          `One hundred and eighty, ${spokenName}.`,
          `Maximum, ${spokenName}. One eighty.`,
          `${spokenName} throws the maximum.`,
        ],
      };
      msg.text = pick(phrases[style]);
      msg.rate = style === "energetic" ? 1.0 : 0.88;
      msg.pitch =
        style === "energetic" ? 1.15 : style === "classic" ? 1.0 : 1.08;
    } else if (remaining === 0) {
      const phrases: Record<CallerStyle, string[]> = {
        professional: [
          `Game shot! And the match, ${spokenName}!`,
          `${spokenName} takes it! Game shot!`,
          `And that's the checkout! ${spokenName} wins!`,
          `${spokenName} checks out! Game shot and the match!`,
          `Checkout! ${spokenName} finishes in style!`,
        ],
        energetic: [
          `GAME SHOT! ${spokenName} takes the match!`,
          `YES! ${spokenName} checks out! Game shot!`,
          `What a finish! ${spokenName} wins it!`,
          `Checkout! ${spokenName} takes the glory!`,
          `GAME SHOT AND THE MATCH! ${spokenName}!`,
        ],
        classic: [
          `Game shot, ${spokenName}.`,
          `${spokenName} checks out. Game shot.`,
          `And the match goes to ${spokenName}.`,
          `That's the game. Well played, ${spokenName}.`,
        ],
      };
      msg.text = pick(phrases[style]);
      msg.rate = style === "energetic" ? 0.95 : 0.85;
      msg.pitch = style === "energetic" ? 1.12 : 1.02;
    } else if (isCheckout) {
      // Checkout range - build tension
      if (remaining <= 40) {
        const phrases: Record<CallerStyle, string[]> = {
          professional: [
            `${spokenName}... requires ${remaining}.`,
            `${spokenName} needs ${remaining} to finish.`,
            `You require ${remaining}, ${spokenName}.`,
            `${spokenName}... ${remaining} for the match.`,
          ],
          energetic: [
            `${spokenName}! Just ${remaining} needed!`,
            `${remaining} to go for ${spokenName}!`,
            `${spokenName} is RIGHT there! ${remaining} remaining!`,
            `Can ${spokenName} finish on ${remaining}?`,
          ],
          classic: [
            `${spokenName}, ${remaining}.`,
            `${spokenName} requires ${remaining}.`,
            `${remaining}, ${spokenName}.`,
          ],
        };
        msg.text = pick(phrases[style]);
      } else if (remaining <= 100) {
        const phrases: Record<CallerStyle, string[]> = {
          professional: [
            `${spokenName}, you require ${remaining}.`,
            `${spokenName} needs ${remaining}.`,
            `${remaining} remaining for ${spokenName}.`,
            `${spokenName} has ${remaining} to go.`,
          ],
          energetic: [
            `${spokenName} is on a finish! ${remaining}!`,
            `${remaining} left for ${spokenName}!`,
            `In the zone! ${spokenName} needs ${remaining}!`,
          ],
          classic: [
            `${spokenName}, you require ${remaining}.`,
            `${remaining}, ${spokenName}.`,
          ],
        };
        msg.text = pick(phrases[style]);
      } else {
        const phrases: Record<CallerStyle, string[]> = {
          professional: [
            `${spokenName} leaves ${remaining}.`,
            `${spokenName} is on ${remaining}.`,
            `${remaining} for ${spokenName}.`,
          ],
          energetic: [
            `${spokenName} leaves ${remaining}! On a finish!`,
            `${remaining} for ${spokenName}! Game on!`,
          ],
          classic: [
            `${spokenName} leaves ${remaining}.`,
            `${remaining}, ${spokenName}.`,
          ],
        };
        msg.text = pick(phrases[style]);
      }
      msg.rate = style === "energetic" ? 0.95 : 0.88;
      msg.pitch = 1.0;
    } else if (scored === 0) {
      const phrases: Record<CallerStyle, string[]> = {
        professional: [
          `${spokenName}... no score.`,
          `No score there for ${spokenName}.`,
          `${spokenName}, unfortunately, no score.`,
          `${spokenName} blanks.`,
          `Nothing doing for ${spokenName}. No score.`,
        ],
        energetic: [
          `${spokenName}... no score!`,
          `Nothing there for ${spokenName}!`,
          `${spokenName} goes scoreless!`,
          `Oh no! No score for ${spokenName}!`,
        ],
        classic: [
          `${spokenName}, no score.`,
          `No score, ${spokenName}.`,
          `${spokenName}. No score.`,
        ],
      };
      msg.text = pick(phrases[style]);
      msg.rate = 0.88;
      msg.pitch = style === "energetic" ? 0.95 : 0.9;
    } else if (scored >= 140) {
      // Ton-plus scores get excitement
      const phrases: Record<CallerStyle, string[]> = {
        professional: [
          `${spokenName}! ${scored}!`,
          `Lovely darts! ${spokenName} with ${scored}!`,
          `${scored}! Great scoring from ${spokenName}!`,
          `Superb! ${spokenName} fires in ${scored}!`,
          `Big score! ${spokenName}, ${scored}!`,
        ],
        energetic: [
          `${spokenName} FIRES in ${scored}!`,
          `What a visit! ${scored} for ${spokenName}!`,
          `${scored}! Brilliant darts from ${spokenName}!`,
          `HUGE score! ${spokenName} with ${scored}!`,
          `${spokenName} smashes in ${scored}!`,
        ],
        classic: [
          `${spokenName}, ${scored}.`,
          `${scored}, ${spokenName}. Lovely darts.`,
          `${spokenName} scores ${scored}.`,
        ],
      };
      msg.text = pick(phrases[style]);
      msg.rate = style === "energetic" ? 1.0 : 0.9;
      msg.pitch = style === "energetic" ? 1.1 : 1.04;
    } else if (scored >= 100) {
      const phrases: Record<CallerStyle, string[]> = {
        professional: [
          `${spokenName}, ${scored}.`,
          `${scored} for ${spokenName}.`,
          `A ton${scored > 100 ? ` ${scored - 100}` : ""} for ${spokenName}.`,
          `${spokenName} scores ${scored}.`,
        ],
        energetic: [
          `Ton${scored > 100 ? ` ${scored - 100}` : ""}! ${spokenName}!`,
          `${scored} for ${spokenName}! Nice darts!`,
          `${spokenName} with a ton${scored > 100 ? ` ${scored - 100}` : ""}!`,
        ],
        classic: [`${spokenName}, ${scored}.`, `${scored}, ${spokenName}.`],
      };
      msg.text = pick(phrases[style]);
      msg.rate = 0.92;
      msg.pitch = 1.0;
    } else if (scored >= 60) {
      const phrases: Record<CallerStyle, string[]> = {
        professional: [
          `${spokenName}, ${scored}.`,
          `${scored} for ${spokenName}.`,
          `${spokenName} scores ${scored}.`,
        ],
        energetic: [
          `${spokenName}, ${scored}!`,
          `${scored} for ${spokenName}!`,
        ],
        classic: [`${spokenName}, ${scored}.`, `${scored}, ${spokenName}.`],
      };
      msg.text = pick(phrases[style]);
      msg.rate = 0.92;
      msg.pitch = 0.98;
    } else if (scored >= 26) {
      const phrases: Record<CallerStyle, string[]> = {
        professional: [
          `${spokenName}... ${scored}.`,
          `${scored}, ${spokenName}.`,
        ],
        energetic: [
          `${spokenName}, ${scored}.`,
          `${scored} for ${spokenName}.`,
        ],
        classic: [`${spokenName}, ${scored}.`],
      };
      msg.text = pick(phrases[style]);
      msg.rate = 0.92;
      msg.pitch = 0.96;
    } else {
      // Low scores
      const phrases: Record<CallerStyle, string[]> = {
        professional: [
          `${spokenName}... ${scored}.`,
          `${scored} for ${spokenName}.`,
        ],
        energetic: [
          `${spokenName}, just ${scored}.`,
          `Only ${scored} there for ${spokenName}.`,
        ],
        classic: [`${spokenName}, ${scored}.`],
      };
      msg.text = pick(phrases[style]);
      msg.rate = 0.9;
      msg.pitch = 0.94;
    }

    // Ensure consistent voice by waiting for voices to load
    const setVoiceAndSpeak = () => {
      if (voiceName) {
        const voices = synth.getVoices();
        const v = voices.find((v) => v.name === voiceName);
        if (v) {
          msg.voice = v;
        } else {
          // Fallback: try to find any English voice
          const englishVoice = voices.find((v) => v.lang.startsWith("en"));
          if (englishVoice) msg.voice = englishVoice;
        }
      }
      if (typeof opts?.volume === "number")
        msg.volume = Math.max(0, Math.min(1, opts.volume));
      else msg.volume = 1;
      try {
        synth.cancel();
      } catch {}
      synth.speak(msg);
    };

    // Chrome/Edge need voices to load first
    const voices = synth.getVoices();
    if (voices.length > 0) {
      setVoiceAndSpeak();
    } else {
      // Wait for voices to load
      synth.addEventListener(
        "voiceschanged",
        () => {
          setVoiceAndSpeak();
        },
        { once: true },
      );
      // Fallback timeout
      setTimeout(setVoiceAndSpeak, 100);
    }
  } catch {}
}

/**
 * Speak an individual dart hit as it is detected
 * e.g. "Triple 20", "Double 16", "Single 5", "Bull", "Bullseye"
 * Uses natural caller-style pronunciation
 */
export function sayDart(
  label: string,
  voiceName?: string,
  opts?: { volume?: number; style?: CallerStyle },
) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;

    const style: CallerStyle = opts?.style || "professional";
    const pick = <T>(arr: T[]): T =>
      arr[Math.floor(Math.random() * arr.length)];

    // Convert label to natural spoken form
    // Labels come in various formats:
    // Short: "T20", "D16", "S5", "BULL", "DBULL", "MISS 0"
    // Long: "TRIPLE 20", "DOUBLE 16", "SINGLE 5", "INNER_BULL 50", "MISS"
    let spoken = label;
    let isExciting = false;
    let isMiss = false;

    // Handle long format (from camera detection): "TRIPLE 20", "DOUBLE 16", etc.
    if (label.startsWith("TRIPLE ")) {
      const num = label.slice(7);
      const isBigTreble = num === "20" || num === "19" || num === "18";
      isExciting = isBigTreble;
      if (isBigTreble && style === "energetic") {
        spoken = pick([`Treble ${num}!`, `Big treble ${num}!`]);
      } else {
        spoken = num === "20" ? "Treble twenty" : `Treble ${num}`;
      }
    } else if (label.startsWith("DOUBLE ")) {
      const num = label.slice(7);
      spoken = `Double ${num}`;
    } else if (label.startsWith("SINGLE ")) {
      spoken = label.slice(7); // Just say the number for singles
    } else if (label.startsWith("INNER_BULL") || label === "DBULL") {
      spoken =
        style === "energetic" ? pick(["Bullseye!", "Inner bull!"]) : "Bullseye";
      isExciting = true;
    } else if (
      label.startsWith("BULL ") ||
      label === "BULL" ||
      label === "OUTER_BULL"
    ) {
      spoken = "Bull";
    }
    // Handle short format: "T20", "D16", "S5"
    else if (label.startsWith("T") && /^T\d+$/.test(label)) {
      const num = label.slice(1);
      const isBigTreble = num === "20" || num === "19" || num === "18";
      isExciting = isBigTreble;
      if (isBigTreble && style === "energetic") {
        spoken = pick([`Treble ${num}!`, `Big treble ${num}!`]);
      } else {
        spoken = num === "20" ? "Treble twenty" : `Treble ${num}`;
      }
    } else if (label.startsWith("D") && /^D\d+$/.test(label)) {
      spoken = `Double ${label.slice(1)}`;
    } else if (label.startsWith("S") && /^S\d+$/.test(label)) {
      spoken = label.slice(1); // Just say the number for singles
    } else if (label.includes("MISS") || label === "0") {
      const missPhrases: Record<CallerStyle, string[]> = {
        professional: ["Outside", "No score", "Just outside"],
        energetic: ["Outside!", "Miss!", "Just outside!", "Off the board!"],
        classic: ["Outside", "No score"],
      };
      spoken = pick(missPhrases[style]);
      isMiss = true;
    }

    const msg = new SpeechSynthesisUtterance();
    msg.text = spoken;

    // Natural speech patterns - style-aware rate and pitch
    if (isExciting) {
      msg.rate = style === "energetic" ? 0.95 : 0.88;
      msg.pitch = style === "energetic" ? 1.12 : 1.04;
    } else if (isMiss) {
      msg.rate = 0.85;
      msg.pitch = style === "energetic" ? 0.9 : 0.88;
    } else {
      msg.rate = style === "classic" ? 0.88 : 0.9;
      msg.pitch = 1.0;
    }

    // Ensure consistent voice by waiting for voices to load
    const setVoiceAndSpeak = () => {
      if (voiceName) {
        const voices = synth.getVoices();
        const v = voices.find((v) => v.name === voiceName);
        if (v) {
          msg.voice = v;
        } else {
          // Fallback: try to find any English voice
          const englishVoice = voices.find((v) => v.lang.startsWith("en"));
          if (englishVoice) msg.voice = englishVoice;
        }
      }
      if (typeof opts?.volume === "number")
        msg.volume = Math.max(0, Math.min(1, opts.volume));
      else msg.volume = 1;

      try {
        synth.cancel();
      } catch {}
      synth.speak(msg);
    };

    // Chrome/Edge need voices to load first
    const voices = synth.getVoices();
    if (voices.length > 0) {
      setVoiceAndSpeak();
    } else {
      // Wait for voices to load
      synth.addEventListener(
        "voiceschanged",
        () => {
          setVoiceAndSpeak();
        },
        { once: true },
      );
      // Fallback timeout
      setTimeout(setVoiceAndSpeak, 100);
    }
  } catch {}
}
