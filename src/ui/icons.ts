// Centralized, simple, consistent symbols for the UI.
// Keep these ASCII/Unicode-simple to avoid emoji rendering and encoding/mojibake issues.

export const UI_SYMBOL = {
  // Basic punctuation/status
  dash: "—",
  bullet: "•",
  middot: "·",
  ellipsis: "…",

  // Status icons
  ok: "✓",
  no: "✗",
  warn: "!",
  info: "i",

  // Misc
  lock: "LOCK",
  refresh: "↻",
  camera: "CAM",
  target: "◎",
  spinner: "…",
} as const;

export type UiSymbolName = keyof typeof UI_SYMBOL;

export function sym(name: UiSymbolName): (typeof UI_SYMBOL)[UiSymbolName] {
  return UI_SYMBOL[name];
}
