import React from "react";
import { Lock } from "lucide-react";
import { useUserSettings } from "../store/userSettings";

export type StatItem = {
  key: string;
  label: string;
  value: string;
  locked?: boolean;
};

export default function StatPills({
  items,
  onUnlock,
}: {
  items: StatItem[];
  onUnlock?: () => void;
}) {
  const { textSize, boxSize } = useUserSettings();

  // Text size classes
  const getTextSizeClasses = (size: string) => {
    switch (size) {
      case "small":
        return { label: "text-[10px]", value: "text-sm" };
      case "large":
        return { label: "text-sm", value: "text-xl" };
      default:
        return { label: "text-[12px]", value: "text-lg" };
    }
  };
  const textClasses = getTextSizeClasses(textSize);

  // Box size classes
  const getBoxSizeClasses = (size: string) => {
    switch (size) {
      case "small":
        return "p-2";
      case "large":
        return "p-4";
      default:
        return "p-3";
    }
  };
  const boxSizeClass = getBoxSizeClasses(boxSize);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it) => (
        <div
          key={it.key}
          className={`relative ${boxSizeClass} rounded-xl border ${it.locked ? "border-white/10 bg-white/5" : "border-indigo-500/40 bg-indigo-500/10"}`}
        >
          <div
            className={`${textClasses.label} mb-1 ${it.locked ? "opacity-50" : "opacity-80"}`}
          >
            {it.label}
          </div>
          <div
            className={`${textClasses.value} font-semibold ${it.locked ? "opacity-50 blur-[1px]" : ""}`}
          >
            {it.value}
          </div>
          {it.locked && (
            <button
              className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/40 backdrop-blur-[1.5px] hover:bg-slate-900/50 transition"
              onClick={(e) => {
                e.stopPropagation();
                onUnlock?.();
              }}
              title="Unlock with PREMIUM"
            >
              <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-100">
                <Lock className="w-4 h-4" /> PREMIUM
              </div>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
