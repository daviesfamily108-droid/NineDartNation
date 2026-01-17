import React, { useState, useEffect, useRef } from "react";

export default function AddToHomeButton() {
  const [available, setAvailable] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      (window as any).__NDN_DEFER_INSTALL_PROMPT__ = true;
      const handler = (e: any) => {
        e.preventDefault();
        (window as any).deferredInstallPrompt = e;
        setAvailable(true);
      };
      window.addEventListener("beforeinstallprompt", handler as any);
      // if there is an existing prompt saved by global handler in index.html
      if ((window as any).deferredInstallPrompt) setAvailable(true);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler as any);
        try {
          (window as any).__NDN_DEFER_INSTALL_PROMPT__ = false;
        } catch {}
      };
    } catch (e) {
      // nothing
    }
  }, []);

  async function handleClick() {
    try {
      if ((window as any).promptInstallApp) {
        const ok = await (window as any).promptInstallApp();
        if (!ok) setShowInstructions(true);
      } else if ((window as any).deferredInstallPrompt) {
        // fallback (should call promptInstallApp already, but just in case)
        const p = (window as any).deferredInstallPrompt;
        p.prompt();
        const choice = await p.userChoice;
        if (choice && choice.outcome === "accepted") {
          setAvailable(false);
        } else setShowInstructions(true);
      } else {
        setShowInstructions(true);
      }
    } catch (e) {
      setShowInstructions(true);
    }
  }

  useEffect(() => {
    if (!showInstructions) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowInstructions(false);
    };
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      setShowInstructions(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [showInstructions]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        onClick={handleClick}
        className="px-2 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
        title="Add to Home Screen"
        data-available={available ? "true" : "false"}
      >
        Add to Home Screen
      </button>
      {showInstructions && (
        <div className="absolute right-0 mt-2 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-3xl border border-white/15 bg-slate-900/95 p-5 text-white shadow-2xl">
          <button
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white shadow hover:bg-rose-400"
            onClick={() => setShowInstructions(false)}
            aria-label="Close add-to-home instructions"
          >
            ×
          </button>
          <h3 className="text-lg font-semibold pr-6">
            Add Nine Dart Nation to Home
          </h3>
          <p className="mt-3 text-sm text-white/80 pr-4">
            {isIos()
              ? 'Open Safari, tap the share icon, then choose "Add to Home Screen".'
              : 'Open your browser menu (⋮ or ⋯) and choose "Install app" or "Add to Home Screen".'}
          </p>
          <p className="mt-2 text-xs text-white/60 pr-4">
            Installing the PWA keeps alerts, matches, and calibration controls a
            tap away.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              className="btn btn--ghost px-3 py-1 text-sm"
              onClick={() => setShowInstructions(false)}
            >
              Close
            </button>
            <button
              className="btn px-3 py-1 text-sm"
              onClick={() => setShowInstructions(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function isIos() {
  try {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  } catch (e) {
    return false;
  }
}
