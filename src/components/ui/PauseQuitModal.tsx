import React from "react";
import FocusLock from "react-focus-lock";

export default function PauseQuitModal({
  onClose,
  onQuit,
  onPause,
}: {
  onClose: () => void;
  onQuit: () => void;
  onPause: (() => void) | ((minutes: number) => void);
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
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close overlay"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <FocusLock returnFocus>
          <div
            className="card max-w-md w-full p-4 rounded-xl text-left"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pause-quit-heading"
          >
            <div className="flex justify-between items-center mb-3">
              <h3 id="pause-quit-heading" className="text-lg font-bold">
                Quit or Pause 🎯
              </h3>
              <button
                className="btn px-3 py-1"
                onClick={onClose}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>
            <div className="mb-4">
              <p className="mb-2">
                You can either quit the match, or pause it 🎯.
              </p>
              <p className="text-sm text-slate-400">
                When paused, you'll choose a timer (1, 3, or 5 minutes). The
                match will automatically resume when the timer expires or when
                a player resumes early 🎯.
              </p>
            </div>

            <div className="flex gap-2 flex-wrap mb-3">
              <button
                className="btn bg-rose-600 hover:bg-rose-700 px-3 py-1"
                onClick={() => onQuit()}
              >
                Quit match 🎯
              </button>
              <button
                className="btn bg-amber-600 hover:bg-amber-700 px-3 py-1"
                onClick={() => (onPause as () => void)()}
              >
                Pause match ⏸️
              </button>
            </div>

            <div className="text-right">
              <button className="btn btn--ghost px-3 py-1" onClick={onClose}>
                Cancel 🎯
              </button>
            </div>
          </div>
        </FocusLock>
      </div>
    </div>
  );
}
