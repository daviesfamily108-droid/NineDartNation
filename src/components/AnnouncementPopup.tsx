import { useCallback, useEffect, useRef, useState } from "react";
import { useWS } from "./WSProvider.js";
import { useMatch } from "../store/match.js";

type AnnouncementData = {
  message: string;
  ts: number;
};

export default function AnnouncementPopup() {
  const [announcement, setAnnouncement] = useState<AnnouncementData | null>(
    null,
  );
  const [queued, setQueued] = useState<AnnouncementData | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  const ws = (() => {
    try {
      return useWS();
    } catch {
      return null;
    }
  })();

  const dismiss = useCallback(() => {
    setAnnouncement(null);
  }, []);

  // Listen for announcement messages from WS
  useEffect(() => {
    if (!ws) return;
    const unsub = ws.addListener((data: any) => {
      if (data?.type !== "announcement" || !data.message) return;
      const payload: AnnouncementData = {
        message: String(data.message),
        ts: Date.now(),
      };
      // If a match is in progress, queue it and show after the game ends
      if (useMatch.getState().inProgress) {
        setQueued(payload);
      } else {
        setAnnouncement(payload);
      }
    });
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [ws]);

  // When a match ends, show the queued announcement
  useEffect(() => {
    const unsub = useMatch.subscribe((state) => {
      if (!state.inProgress && queued) {
        setAnnouncement(queued);
        setQueued(null);
      }
    });
    return unsub;
  }, [queued]);

  // Escape key to dismiss
  useEffect(() => {
    if (!announcement) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [announcement, dismiss]);

  if (!announcement) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === backdropRef.current) dismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#13111C] p-6 md:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay" />
        {/* Decorative glow */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close button - red X top right */}
        <button
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/20 hover:bg-rose-500/40 text-rose-400 hover:text-rose-300 transition z-10"
          onClick={dismiss}
          aria-label="Close announcement"
        >
          ×
        </button>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 shadow-lg shadow-indigo-500/10 ring-1 ring-white/10">
              <span className="text-2xl">📢</span>
            </div>
            <div>
              <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/50 tracking-tight">
                Announcement
              </h2>
              <p className="text-xs text-white/40 font-medium">
                From Nine Dart Nation
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-base text-white/90 leading-relaxed whitespace-pre-wrap">
              {announcement.message}
            </p>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              className="btn px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition"
              onClick={dismiss}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
