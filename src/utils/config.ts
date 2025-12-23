// Demo pricing: base is £5 GBP. Convert to user currency for display.
export const BASE_PRICE_GBP = 5;

// Simple static FX rates for display (not for real billing). Updated rarely.
const FX: Record<string, number> = {
  GBP: 1,
  EUR: 1.16, // € per £
  USD: 1.26, // $ per £
  AUD: 1.92,
  NZD: 2.08,
  CAD: 1.73,
};

export function formatPriceInCurrency(
  currency: string,
  gbpAmount = BASE_PRICE_GBP,
) {
  const cur = (currency || "GBP").toUpperCase();
  const rate = FX[cur] ?? 1;
  const val = gbpAmount * rate;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(val);
  } catch {
    // Fallback
    return `${cur} ${val.toFixed(2)}`;
  }
}

export function getUserCurrency(): string {
  try {
    // Heuristic: infer from locale
    const parts = new Intl.NumberFormat().resolvedOptions();
    // Example: en-GB -> GBP, en-US -> USD, en-AU -> AUD, etc. Not 100% accurate.
    const m = String(parts.locale).toLowerCase();
    if (m.includes("-gb")) return "GBP";
    if (
      m.includes("-ie") ||
      m.includes("-de") ||
      m.includes("-fr") ||
      m.includes("-es") ||
      m.includes("-it") ||
      m.includes("-nl")
    )
      return "EUR";
    if (m.includes("-us")) return "USD";
    if (m.includes("-au")) return "AUD";
    if (m.includes("-nz")) return "NZD";
    if (m.includes("-ca")) return "CAD";
    return "GBP";
  } catch {
    return "GBP";
  }
}

// Centralized Discord invite; override via VITE_DISCORD_INVITE_URL in Render/Netlify
export const DISCORD_INVITE_URL: string =
  (import.meta as any).env?.VITE_DISCORD_INVITE_URL ||
  "https://discord.gg/nCfT4hJz";
