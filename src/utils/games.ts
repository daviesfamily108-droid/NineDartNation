export const freeGames = ["X01", "Double Practice"] as const;
export type ModeKey =
  | "bestof"
  | "firstto"
  | "rounds"
  | "practice"
  | "none"
  | "innings"
  | "holes";
export interface GameConfig {
  startOptions: number[];
  modeOptions: ModeKey[];
  modeValueOptions?: Partial<Record<ModeKey, number[]>>;
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
  },
  "Bob's 27": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  "Count-Up": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  "High Score": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  "Low Score": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  "Checkout 170": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  "Checkout 121": {
    startOptions: [],
    modeOptions: ["bestof", "firstto"],
    modeValueOptions: { bestof: [1, 3, 5], firstto: [1, 2, 3, 4] },
  },
  "Treble Practice": {
    startOptions: [],
    modeOptions: ["practice"],
    modeValueOptions: { practice: [30, 60, 120] },
  },
  Baseball: {
    startOptions: [],
    modeOptions: ["bestof", "innings"],
    modeValueOptions: { bestof: [1, 3, 5], innings: [1, 3, 5, 9] },
  },
  Golf: {
    startOptions: [],
    modeOptions: ["holes", "bestof"],
    modeValueOptions: { holes: [9, 18], bestof: [1, 3, 5] },
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
