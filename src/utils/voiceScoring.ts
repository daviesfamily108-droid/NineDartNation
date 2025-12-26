export const VOICE_COMMANDS = {
  UNDO: ["undo", "back", "correction", "oops", "mistake"],
  BUST: ["bust", "busted", "no score"],
  NEXT: ["next", "switch", "done", "finish"],
};

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60,
  bull: 50, bullseye: 50, "double bull": 50, "inner bull": 50, "red bit": 50,
  "outer bull": 25, "twenty five": 25, "twenty-five": 25, "green bit": 25,
  top: 20, // "double top"
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, 
  seventy: 70, eighty: 80, ninety: 90
};

const MULTIPLIERS: Record<string, string> = {
  single: "S",
  double: "D",
  triple: "T",
  treble: "T",
};

export type VoiceResult = 
  | { type: 'dart'; value: string; confidence?: number }
  | { type: 'visit_score'; value: number; confidence?: number }
  | { type: 'command'; value: 'undo' | 'bust' | 'next'; confidence?: number }
  | { type: 'unknown'; value: string };

function parseSpokenNumber(text: string): number | null {
  const clean = text.replace(/-/g, ' ').replace(/\band\b/g, ' ').trim();
  
  // Try direct match first
  if (NUMBER_WORDS[clean] !== undefined) return NUMBER_WORDS[clean];
  
  // Try parsing digits
  const digitParse = parseInt(clean, 10);
  if (!isNaN(digitParse)) return digitParse;

  // Parse composite words like "seventy five", "one hundred eighty"
  const words = clean.split(/\s+/);
  let total = 0;
  let current = 0;
  
  for (const word of words) {
    if (word === 'hundred') {
      current = (current || 1) * 100;
    } else if (TENS[word]) {
      total += current;
      current = TENS[word];
    } else if (NUMBER_WORDS[word]) {
      current += NUMBER_WORDS[word];
    } else {
      // Unknown word, abort
      return null;
    }
  }
  return total + current;
}

export function parseVoiceInput(transcript: string): VoiceResult {
  const clean = transcript.toLowerCase().trim();

  // Check commands
  if (VOICE_COMMANDS.UNDO.some(cmd => clean.includes(cmd))) return { type: 'command', value: 'undo' };
  if (VOICE_COMMANDS.BUST.some(cmd => clean.includes(cmd))) return { type: 'command', value: 'bust' };
  if (VOICE_COMMANDS.NEXT.some(cmd => clean.includes(cmd))) return { type: 'command', value: 'next' };

  // Parse dart
  // Look for multiplier
  let multiplier = "S"; 
  let textToParse = clean;

  // Check for multiplier words at start
  for (const [word, code] of Object.entries(MULTIPLIERS)) {
    if (textToParse.startsWith(word)) {
      multiplier = code;
      textToParse = textToParse.replace(word, "").trim();
      break;
    }
  }

  // Parse number
  const numVal = parseSpokenNumber(textToParse);

  if (numVal !== null) {
    // Special handling for "Double Top" -> D20
    if (clean.includes("top") && multiplier === "D") {
        return { type: 'dart', value: "D20" };
    }
    
    // Handle Bull
    if (numVal === 50 || numVal === 25) {
        return { type: 'dart', value: numVal.toString() };
    }

    // If explicit multiplier was used, it's a dart
    if (multiplier !== "S") {
       if (numVal >= 1 && numVal <= 20) {
          return { type: 'dart', value: `${multiplier}${numVal}` };
       }
    }

    // If no explicit multiplier...
    if (multiplier === "S") {
        // If it's a valid single dart score (1-20), treat as dart
        if (numVal >= 1 && numVal <= 20) {
            return { type: 'dart', value: `S${numVal}` };
        }
        // If it's NOT a valid single dart score (e.g. 21, 22, 45, 75, 180), treat as visit score
        // Note: 25 and 50 are handled above as Bull
        return { type: 'visit_score', value: numVal };
    }
  }
  
  return { type: 'unknown', value: transcript };
}
