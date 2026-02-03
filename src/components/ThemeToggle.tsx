import React from "react";
import { useTheme, ThemeName } from "../contexts/ThemeProvider";

const ALL_THEMES: ThemeName[] = [
  "default",
  "halloween",
  "easter",
  "summer",
  "christmas",
];

// Theme metadata: icon, label, gradient colors
const THEME_META: Record<
  ThemeName,
  { icon: string; label: string; gradient: string; ring: string }
> = {
  default: {
    icon: "🎯",
    label: "Default",
    gradient: "from-slate-600 to-slate-800",
    ring: "ring-slate-400",
  },
  christmas: {
    icon: "🎄",
    label: "Christmas",
    gradient: "from-red-600 to-green-700",
    ring: "ring-red-400",
  },
  easter: {
    icon: "🐣",
    label: "Easter",
    gradient: "from-pink-400 to-purple-400",
    ring: "ring-pink-300",
  },
  halloween: {
    icon: "🎃",
    label: "Halloween",
    gradient: "from-orange-500 to-purple-800",
    ring: "ring-orange-400",
  },
  summer: {
    icon: "☀️",
    label: "Summer",
    gradient: "from-yellow-400 to-sky-400",
    ring: "ring-yellow-300",
  },
};

export default function ThemeToggle() {
  const { theme, setTheme, auto, setAuto, colorMode, setColorMode } =
    useTheme();

  return (
    <div
      className="theme-toggle space-y-4"
      role="group"
      aria-label="Theme selector"
    >
      {/* Light / Dark selector */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Color mode</div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: "system" as const, label: "System" },
            { key: "dark" as const, label: "Dark" },
            { key: "light" as const, label: "Light" },
          ].map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={colorMode === m.key}
              onClick={() => setColorMode(m.key)}
              className={`btn btn--ghost px-3 py-1 text-sm ${
                colorMode === m.key
                  ? "ring-2 ring-indigo-400/70 bg-white/10"
                  : "bg-white/5"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Auto toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => setAuto(!auto)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            auto ? "bg-gradient-to-r from-cyan-500 to-blue-500" : "bg-white/20"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              auto ? "translate-x-5" : ""
            }`}
          />
        </div>
        <span className="text-sm font-medium">Auto seasonal theme 🎯</span>
      </label>

      {/* Theme pills */}
      <div className="flex flex-wrap gap-2">
        {ALL_THEMES.map((t) => {
          const meta = THEME_META[t];
          const selected = theme === t;
          return (
            <button
              key={t}
              onClick={() => setTheme(t)}
              disabled={auto}
              aria-pressed={selected}
              title={`Set ${meta.label} theme`}
              className={`
                relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold
                transition-all duration-200 shadow-md
                ${auto ? "opacity-50 cursor-not-allowed" : "hover:scale-105 active:scale-95"}
                ${selected ? `bg-gradient-to-r ${meta.gradient} text-white ring-2 ${meta.ring} ring-offset-2 ring-offset-black/50` : "bg-white/10 text-white/80 hover:bg-white/20"}
              `}
            >
              <span className="text-lg">{meta.icon}</span>
              <span>{meta.label} 🎯</span>
              {selected && (
                <span className="ml-1 w-2 h-2 rounded-full bg-white animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
