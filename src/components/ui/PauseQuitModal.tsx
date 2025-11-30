import React from "react";
import FocusLock from "react-focus-lock";

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
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close overlay"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <FocusLock returnFocus>
          <div className="card max-w-md w-full p-4 rounded-xl text-left" role="dialog" aria-modal="true" aria-labelledby="pause-quit-heading">
            <div className="flex justify-between items-center mb-3">
              <h3 id="pause-quit-heading" className="text-lg font-bold">Quit or Pause</h3>
              <button className="btn px-3 py-1" onClick={onClose} aria-label="Close dialog">✕</button>
            </div>
            <div className="mb-4">
              <p className="mb-2">You can either quit the match, or pause it for up to 5 minutes.</p>
              <p className="text-sm text-slate-400">If paused, the match will automatically resume when the timer expires or when a player resumes early.</p>
            </div>

            <div className="flex gap-2 flex-wrap mb-3">
              <button className="btn bg-rose-600 hover:bg-rose-700 px-3 py-1" onClick={() => onQuit()}>
                Quit match
              </button>
              <div className="flex items-center gap-2">
                <span className="opacity-80">Pause:</span>
                {[1, 2, 3, 4, 5].map((m) => (
                  <button key={m} className="btn btn--ghost px-3 py-1 text-sm" onClick={() => onPause(m)}>
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            <div className="text-right">
              <button className="btn btn--ghost px-3 py-1" onClick={onClose}>Cancel</button>
            </div>
          </div>
        </FocusLock>
      </div>
    </div>
  );
}
