import { useState, useEffect } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

const MOBILE_MAX = 768;
const TABLET_MAX = 1024;

function getBreakpoint(width: number): Breakpoint {
  if (width <= MOBILE_MAX) return "mobile";
  if (width <= TABLET_MAX) return "tablet";
  return "desktop";
}

/**
 * Reactive viewport breakpoint hook.
 * Returns "mobile" (≤768), "tablet" (769-1024), or "desktop" (>1024).
 */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window !== "undefined"
      ? getBreakpoint(window.innerWidth)
      : "desktop",
  );

  useEffect(() => {
    const update = () => setBp(getBreakpoint(window.innerWidth));
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return bp;
}

/** Convenience booleans */
export function useIsMobile(): boolean {
  return useBreakpoint() === "mobile";
}

export function useIsTablet(): boolean {
  return useBreakpoint() === "tablet";
}

export function useIsDesktop(): boolean {
  return useBreakpoint() === "desktop";
}
