import React from "react";

type Tab = { key: string; label: string };

export default function TabPills({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className || ""}`}>
      {/* subtle backdrop and border for contrast on mobile */}
      <div className="absolute inset-0 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 pointer-events-none" />
      <div className="relative overflow-x-auto no-scrollbar py-1 px-1">
        <div className="flex items-center gap-2 min-w-max">
          {tabs.map((t) => {
            const isActive = t.key === active;
            return (
              <button
                key={t.key}
                type="button"
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={() => onChange(t.key)}
                className={`transition-all select-none whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:scale-[0.98]
                  ${
                    isActive
                      ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white shadow-indigo-500/30"
                      : "bg-white/10 text-slate-100 hover:bg-white/15"
                  }
                `}
                aria-pressed={isActive}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <style>{`
        /* Hide scrollbars on WebKit/Firefox for a cleaner pill row */
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
