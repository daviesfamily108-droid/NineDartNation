import React from "react";
import * as FocusLockModule from "react-focus-lock";

const FocusLock = (FocusLockModule as any).default ?? (FocusLockModule as any);

export default function PauseQuitModal({
  onClose,
  onQuit,
  onPause,
}: {
  onClose: () => void;
  onQuit: () => void;
  onPause: (minutes: number) => void;
}) {
  // Close on Escape for accessibility
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[1200]" role="presentation">
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close overlay"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <FocusLock returnFocus>
          <div
            className="relative max-w-md w-full rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl shadow-black/40 overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-quit-heading"
          >
            {/* Glass sheen */}
            <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-white/[0.04] to-transparent" />

            <div className="relative">
              {/* Header */}
              <div className="flex justify-between items-center mb-4">
                <h3 id="pause-quit-heading" className="text-lg font-bold text-white/90 tracking-wide flex items-center gap-2">
                  <span className="text-2xl">⏸</span> Quit or Pause
                </h3>
                <button
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all text-sm"
                  onClick={onClose}
                  aria-label="Close dialog"
                >
                  ✕
                </button>
              </div>

              {/* Description */}
              <p className="text-sm text-white/60 mb-5 leading-relaxed">
                Quit the match entirely, or pause for up to 5 minutes. The match resumes automatically when the timer expires, or you can resume early.
              </p>

              {/* Quit button */}
              <button
                className="w-full mb-4 px-4 py-3 rounded-2xl text-sm font-semibold bg-rose-600/90 hover:bg-rose-500 text-white border border-rose-400/30 shadow-lg shadow-rose-500/20 transition-all flex items-center justify-center gap-2"
                onClick={() => onQuit()}
              >
                <span className="text-base">✕</span> Quit Match
              </button>

              {/* Pause options */}
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-wider text-amber-300/60 font-semibold mb-2">Pause Duration</div>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((m) => (
                    <button
                      key={m}
                      className="group relative rounded-xl border border-amber-400/20 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-400/40 px-3 py-3 transition-all text-center"
                      onClick={() => onPause(m)}
                    >
                      <div className="text-lg font-bold text-amber-200 group-hover:text-amber-100">{m}</div>
                      <div className="text-[10px] text-amber-300/50 group-hover:text-amber-300/80">min</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cancel */}
              <button
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        </FocusLock>
      </div>
    </div>
  );
}
