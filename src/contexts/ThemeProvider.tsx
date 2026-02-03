import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemeName =
  | "default"
  | "halloween"
  | "easter"
  | "summer"
  | "christmas";

export type ColorMode = "system" | "dark" | "light";

type ThemeContextShape = {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  auto: boolean;
  setAuto: (v: boolean) => void;
  colorMode: ColorMode;
  setColorMode: (m: ColorMode) => void;
};

const ThemeContext = createContext<ThemeContextShape | null>(null);

const STORAGE_KEY = "ndn:theme";
const COLOR_MODE_KEY = "ndn:colorMode";

function detectSeasonalTheme(date = new Date()): ThemeName {
  const m = date.getMonth(); // 0-based
  const d = date.getDate();
  // Halloween: Oct 20 - Nov 5
  if (m === 9 || (m === 10 && d <= 5)) return "halloween";
  // Christmas / Winter: Dec 15 - Feb 14
  if (m === 11 || m === 0 || (m === 1 && d <= 14)) return "christmas";
  // Easter: approximate: March-April
  if (m === 2 || m === 3) return "easter";
  // Summer: Jun-Aug
  if (m >= 5 && m <= 7) return "summer";
  return "default";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [auto, setAuto] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}:auto`);
      return raw ? JSON.parse(raw) : true;
    } catch {
      return true;
    }
  });

  const [theme, setThemeState] = useState<ThemeName>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return raw as ThemeName;
    } catch {
      /* ignore */
    }
    return detectSeasonalTheme();
  });

  const [colorMode, setColorModeState] = useState<ColorMode>(() => {
    try {
      const raw = localStorage.getItem(COLOR_MODE_KEY);
      if (raw === "dark" || raw === "light" || raw === "system") return raw;
    } catch {
      /* ignore */
    }
    return "system";
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLOR_MODE_KEY, colorMode);
    } catch {}
  }, [colorMode]);

  useEffect(() => {
    const applyAttr = (m: Exclude<ColorMode, "system">) => {
      try {
        document.documentElement.setAttribute("data-color-mode", m);
      } catch {}
    };

    if (colorMode === "dark") {
      applyAttr("dark");
      return;
    }
    if (colorMode === "light") {
      applyAttr("light");
      return;
    }

    // system
    const mq =
      typeof window !== "undefined"
        ? window.matchMedia?.("(prefers-color-scheme: dark)")
        : null;
    const sync = () => applyAttr(mq?.matches ? "dark" : "light");
    sync();
    try {
      mq?.addEventListener?.("change", sync);
    } catch {}
    return () => {
      try {
        mq?.removeEventListener?.("change", sync);
      } catch {}
    };
  }, [colorMode]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}:auto`, JSON.stringify(auto));
    } catch {}
  }, [auto]);

  useEffect(() => {
    const applied = auto ? detectSeasonalTheme() : theme;
    // set a data attr on <html> to allow CSS scoping via [data-theme="x"]
    try {
      if (applied === "default")
        document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", applied);
    } catch {}
  }, [theme, auto]);

  const setTheme = (t: ThemeName) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
    setThemeState(t);
  };

  const setColorMode = (m: ColorMode) => {
    try {
      localStorage.setItem(COLOR_MODE_KEY, m);
    } catch {}
    setColorModeState(m);
  };

  const value = useMemo(
    () => ({ theme, setTheme, auto, setAuto, colorMode, setColorMode }),
    [theme, auto, colorMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

export default ThemeProvider;
