export const freeGames = ["X01", "Double Practice"] as const;
export type ModeKey =
  | "bestof"
  | "firstto"
  | "rounds"
  | "practice"
  | "none"
  | "innings"
  | "holes";
export interface GameExtraField {
  key: string;
  label: string;
  type: "select" | "number";
  options?: number[];
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}

export interface GameConfig {
  startOptions: number[];
  modeOptions: ModeKey[];
  modeValueOptions?: Partial<Record<ModeKey, number[]>>;
  /** Per-game specific configuration fields shown in setup UIs */
  extraFields?: GameExtraField[];
  /** Label override for the "Legs" / value input (e.g. "Innings", "Holes") */
  valueLabel?: string;
}
export const premiumGames = [
  "Around the Clock",
  "Cricket",
  "Halve It",
  "Shanghai",
  "High-Low",
  "Killer",
  "Bob's 27",
  "Count-Up",
  "High Score",
  "Low Score",
  "Checkout 170",
  "Checkout 121",
  "Treble Practice",
  "Baseball",
  "Golf",
  "Tic Tac Toe",
  "American Cricket",
  "Scam",
  "Fives",
  "Sevens",
] as const;
export type GameKey =
  | (typeof freeGames)[number]
  | (typeof premiumGames)[number];
export const allGames: GameKey[] = [...freeGames, ...premiumGames];

// Per-game configuration for UI helpers and filtering
export const gameConfig: Record<GameKey, GameConfig> = {
  X01: {
    startOptions: [301, 501, 701],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5, 7], firstto: [1, 2, 3, 4, 5, 6] },
  },
  "Double Practice": {
    startOptions: [],
    modeOptions: ["practice"],
    modeValueOptions: { practice: [30, 60, 120] },
    extraFields: [
      {
        key: "dartLimit",
        label: "Max darts",
        type: "select",
        options: [30, 60, 120],
        defaultValue: 60,
        hint: "Stop after this many throws",
      },
    ],
  },
  "Around the Clock": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  Cricket: {
    startOptions: [],
    modeOptions: ["bestof", "firstto", "rounds"],
    modeValueOptions: {
      bestof: [1, 3, 5],
      firstto: [1, 2, 3, 4],
      rounds: [1, 3, 5],
    },
    valueLabel: "Legs",
  },
  "Halve It": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  Shanghai: {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
    extraFields: [
      {
        key: "rounds",
        label: "Rounds",
        type: "select",
        options: [7, 10, 20],
        defaultValue: 20,
        hint: "Rounds 1–N",
      },
    ],
  },
  "High-Low": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  Killer: {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
    extraFields: [
      {
        key: "lives",
        label: "Lives",
        type: "select",
        options: [3, 5, 7],
        defaultValue: 3,
        hint: "Lives per player",
      },
    ],
  },
  "Bob's 27": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  "Count-Up": {
    startOptions: [],
    modeOptions: ["rounds", "bestof", "firstto"],
    modeValueOptions: {
      rounds: [5, 8, 10],
      bestof: [1, 3, 5],
      firstto: [1, 2, 3, 4],
    },
    extraFields: [
      {
        key: "rounds",
        label: "Rounds",
        type: "select",
        options: [5, 8, 10, 15],
        defaultValue: 8,
        hint: "Number of rounds per game",
      },
    ],
    valueLabel: "Rounds",
  },
  "High Score": {
    startOptions: [],
    modeOptions: ["rounds", "bestof", "firstto"],
    modeValueOptions: {
      rounds: [5, 8, 10],
      bestof: [1, 3, 5],
      firstto: [1, 2, 3, 4],
    },
    extraFields: [
      {
        key: "rounds",
        label: "Rounds",
        type: "select",
        options: [5, 8, 10, 15],
        defaultValue: 8,
        hint: "Number of rounds",
      },
    ],
    valueLabel: "Rounds",
  },
  "Low Score": {
    startOptions: [],
    modeOptions: ["rounds", "bestof", "firstto"],
    modeValueOptions: {
      rounds: [5, 8, 10],
      bestof: [1, 3, 5],
      firstto: [1, 2, 3, 4],
    },
    extraFields: [
      {
        key: "rounds",
        label: "Rounds",
        type: "select",
        options: [5, 8, 10, 15],
        defaultValue: 8,
        hint: "Number of rounds",
      },
    ],
    valueLabel: "Rounds",
  },
  "Checkout 170": {
    startOptions: [170],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
    extraFields: [
      {
        key: "dartCount",
        label: "Darts per attempt",
        type: "select",
        options: [3, 6, 9],
        defaultValue: 3,
        hint: "Darts to check out",
      },
    ],
  },
  "Checkout 121": {
    startOptions: [121],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
    extraFields: [
      {
        key: "dartCount",
        label: "Darts per attempt",
        type: "select",
        options: [3, 6, 9],
        defaultValue: 3,
        hint: "Darts to check out",
      },
    ],
  },
  "Treble Practice": {
    startOptions: [],
    modeOptions: ["practice"],
    modeValueOptions: { practice: [30, 60, 120] },
    extraFields: [
      {
        key: "maxDarts",
        label: "Throws per game",
        type: "select",
        options: [15, 30, 45, 60, 90],
        defaultValue: 30,
        hint: "Target cycles T20→T19→T18 every 3 darts",
      },
    ],
  },
  Baseball: {
    startOptions: [],
    modeOptions: ["bestof", "innings"],
    modeValueOptions: { bestof: [1, 3, 5], innings: [1, 3, 5, 9] },
    extraFields: [
      {
        key: "innings",
        label: "Innings",
        type: "select",
        options: [3, 5, 7, 9],
        defaultValue: 9,
        hint: "Number of innings",
      },
    ],
    valueLabel: "Innings",
  },
  Golf: {
    startOptions: [],
    modeOptions: ["holes", "bestof"],
    modeValueOptions: { holes: [9, 18], bestof: [1, 3, 5] },
    extraFields: [
      {
        key: "holes",
        label: "Holes",
        type: "select",
        options: [9, 18],
        defaultValue: 18,
        hint: "Number of holes per round",
      },
    ],
    valueLabel: "Holes",
  },
  "Tic Tac Toe": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  "American Cricket": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  Scam: {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  Fives: {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  Sevens: {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
};

export function getStartOptionsForGame(g: "all" | GameKey): number[] {
  if (g === "all") return [301, 501, 701];
  const cfg = gameConfig[g];
  return cfg?.startOptions ?? [];
}

export function getModeOptionsForGame(g: "all" | GameKey): (ModeKey | "all")[] {
  if (g === "all") return ["all", "bestof", "firstto"];
  const cfg = gameConfig[g];
  if (!cfg) return ["all", "bestof", "firstto"];
  return ["all", ...cfg.modeOptions];
}

export function getModeValueOptionsForGame(
  g: "all" | GameKey,
  mode: ModeKey | "all",
): number[] {
  if (g === "all" || mode === "all") return [];
  const cfg = gameConfig[g];
  return cfg?.modeValueOptions?.[mode] ?? [];
}

export function getExtraFieldsForGame(g: "all" | GameKey): GameExtraField[] {
  if (g === "all") return [];
  const cfg = gameConfig[g as GameKey];
  return cfg?.extraFields ?? [];
}

export function getValueLabelForGame(
  g: "all" | GameKey,
  mode: ModeKey | "all",
): string {
  if (g === "all") return "Legs";
  const cfg = gameConfig[g as GameKey];
  if (cfg?.valueLabel) return cfg.valueLabel;
  switch (mode) {
    case "innings":
      return "Innings";
    case "holes":
      return "Holes";
    case "rounds":
      return "Rounds";
    case "practice":
      return "Throws";
    default:
      return "Legs";
  }
}

export function getDefaultExtraValues(g: GameKey): Record<string, number> {
  const fields = getExtraFieldsForGame(g);
  const out: Record<string, number> = {};
  for (const f of fields) out[f.key] = f.defaultValue;
  return out;
}

/** Display metadata for each game mode: emoji, short tagline, and accent color */
export interface GameDisplayInfo {
  emoji: string;
  tagline: string;
  /** CSS color value for accent (border, background tints) */
  color: string;
}

export const gameDisplayInfo: Record<GameKey, GameDisplayInfo> = {
  X01: { emoji: "🎯", tagline: "Count down to zero", color: "#818cf8" },
  "Double Practice": {
    emoji: "🔴",
    tagline: "Hit every double",
    color: "#fb7185",
  },
  "Around the Clock": {
    emoji: "🕐",
    tagline: "1 through 20 and Bull",
    color: "#38bdf8",
  },
  Cricket: { emoji: "🏏", tagline: "Close 20–15 and Bull", color: "#34d399" },
  "Halve It": {
    emoji: "✂️",
    tagline: "Hit targets or lose half",
    color: "#fbbf24",
  },
  Shanghai: {
    emoji: "🀄",
    tagline: "Single, Double, Triple in round",
    color: "#f87171",
  },
  "High-Low": {
    emoji: "📊",
    tagline: "Alternate high and low",
    color: "#a78bfa",
  },
  Killer: {
    emoji: "💀",
    tagline: "Eliminate your opponents",
    color: "#c084fc",
  },
  "Bob's 27": {
    emoji: "🎲",
    tagline: "Hit doubles or lose points",
    color: "#fb923c",
  },
  "Count-Up": {
    emoji: "📈",
    tagline: "Score as high as you can",
    color: "#2dd4bf",
  },
  "High Score": {
    emoji: "🏆",
    tagline: "Highest total wins",
    color: "#facc15",
  },
  "Low Score": { emoji: "⬇️", tagline: "Lowest total wins", color: "#22d3ee" },
  "Checkout 170": {
    emoji: "🔥",
    tagline: "Check out from 170",
    color: "#f87171",
  },
  "Checkout 121": {
    emoji: "⚡",
    tagline: "Check out from 121",
    color: "#fbbf24",
  },
  "Treble Practice": {
    emoji: "🟢",
    tagline: "Hit trebles consistently",
    color: "#a3e635",
  },
  Baseball: {
    emoji: "⚾",
    tagline: "Score runs each inning",
    color: "#60a5fa",
  },
  Golf: { emoji: "⛳", tagline: "Lowest strokes per hole", color: "#4ade80" },
  "Tic Tac Toe": {
    emoji: "❌",
    tagline: "Three in a row wins",
    color: "#e879f9",
  },
  "American Cricket": {
    emoji: "🦅",
    tagline: "Close 20–12 and Bull",
    color: "#94a3b8",
  },
  Scam: { emoji: "🃏", tagline: "Hit each target in order", color: "#f472b6" },
  Fives: { emoji: "5️⃣", tagline: "Score multiples of five", color: "#818cf8" },
  Sevens: {
    emoji: "7️⃣",
    tagline: "Score multiples of seven",
    color: "#a78bfa",
  },
};

export function getGameDisplay(mode: string): GameDisplayInfo {
  return (
    gameDisplayInfo[mode as GameKey] ?? {
      emoji: "🎯",
      tagline: "",
      color: "#818cf8",
    }
  );
}

export function labelForMode(opt: string | undefined | null) {
  if (!opt) return "";
  switch (opt) {
    case "all":
      return "All Modes";
    case "bestof":
      return "Best of";
    case "firstto":
      return "First to";
    case "innings":
      return "Innings";
    case "holes":
      return "Holes";
    case "rounds":
      return "Rounds";
    case "practice":
      return "Practice";
    case "none":
      return "Mode";
    default:
      return String(opt)
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (s) => s.toUpperCase());
  }
}
