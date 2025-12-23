import React, { useState, useEffect, useRef } from "react";

/**
 * Small header pill that allows installing the PWA or linking to app store pages.
 * - Tries to prompt the PWA install if available
 * - Shows links to Play Store / App Store if configured via environment variables
 */
export default function InstallPicker() {
  const [open, setOpen] = useState(false);
  const playStore = (import.meta as any).env?.VITE_PLAY_STORE_URL || "";
  const appStore = (import.meta as any).env?.VITE_APP_STORE_URL || "";
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    window.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
      window.removeEventListener("keydown", handler);
    };
  }, [open]);

  async function installPwa() {
    try {
      // Global promptInstallApp() is added to index.html and stores `beforeinstallprompt`
      if ((window as any).promptInstallApp) {
        const result = await (window as any).promptInstallApp();
        if (result) {
          // installed
        }
      } else if ((navigator as any)?.standalone || "onappinstalled" in window) {
        // Already installed or installed via other prompt
        alert(
          "App is already installed or your browser does not support programmatic install.",
        );
      } else {
        alert(
          "Install is not available for your browser. Try using the share menu (iOS) or the install prompt (Chrome/Edge on Android).",
        );
      }
    } catch (e) {
      // ignore
    }
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        className="px-2 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white flex items-center gap-2"
        onClick={() => setOpen((v) => !v)}
        title="Install or download app"
      >
        Install
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="absolute right-0 mt-2 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-3xl border border-white/15 bg-slate-900/95 p-5 text-white shadow-2xl"
        >
          <button
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white shadow hover:bg-rose-400"
            onClick={() => setOpen(false)}
            aria-label="Close install picker"
          >
            ×
          </button>
          <div className="pr-6">
            <div className="text-lg font-semibold">Install or Download</div>
            <p className="text-sm text-white/70">
              Install the Progressive Web App or jump to the native stores when
              available.
            </p>
          </div>
          <div className="mt-4 flex flex-col space-y-2">
            <button className="btn" onClick={() => installPwa()}>
              Install (PWA)
            </button>
            {playStore ? (
              <a
                className="btn"
                target="_blank"
                rel="noreferrer"
                href={playStore}
              >
                Android (Google Play)
              </a>
            ) : (
              <div className="text-xs opacity-80">
                Android native build not provided
              </div>
            )}
            {appStore ? (
              <a
                className="btn"
                target="_blank"
                rel="noreferrer"
                href={appStore}
              >
                iOS (App Store)
              </a>
            ) : (
              <div className="text-xs opacity-80">
                iOS native build not provided
              </div>
            )}
            <div className="text-xs opacity-70">
              iOS: Open Safari → Share → "Add to Home Screen" to pin this
              dashboard like a native app.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
