import React, { useLayoutEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  allGames,
  type GameKey,
  getStartOptionsForGame,
} from "../../utils/games.js";
import { useUserSettings } from "../../store/userSettings.js";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: any) => void;
};

export default function CreateMatchModal({ open, onClose, onCreate }: Props) {
  const [portalEl] = useState(() => document.createElement("div"));
  const [game, setGame] = useState<GameKey>("X01");
  const [modeType, setModeType] = useState<"bestof" | "firstto">("bestof");
  const [legs, setLegs] = useState<number>(3);
  const legsRef = useRef<HTMLInputElement | null>(null);
  const [avgChoice, setAvgChoice] = useState<number>(0);
  const [startingScore, setStartingScore] = useState<number | undefined>(() => {
    const opts = getStartOptionsForGame(game);
    return opts?.[0];
  });
  const user = (useUserSettings() as any).username || "Anonymous";

  useLayoutEffect(() => {
    portalEl.className = "ndn-create-match-portal";
    document.body.appendChild(portalEl);
    return () => {
      try {
        portalEl && portalEl.remove();
      } catch {}
    };
  }, [portalEl]);

  // Close modal on Escape key
  useLayoutEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleCreate = () => {
    const payload = {
      createdBy: user,
      game,
      modeType,
      legs,
      avgChoice,
      startingScore,
    };
    onCreate(payload);
    onClose();
  };

  if (!open) return null;

  if (!portalEl) return null;

  return createPortal(
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-2 sm:p-6">
      {/* A dedicated, accessible button covers the backdrop to capture clicks and keyboard input */}
      <button
        aria-label="Close dialog"
        className="absolute inset-0 w-full h-full bg-transparent"
        onClick={onClose}
      />
      <div
        className="rounded-2xl p-5 sm:p-6 max-w-lg w-full relative text-white shadow-2xl border border-indigo-500/30 max-h-[85vh] overflow-y-auto"
        style={{ background: "var(--ndn-card-bg, #0f172a)" }}
        role="dialog"
      >
        <button
          aria-label="Close"
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-indigo-500/20 hover:bg-indigo-500/40 flex items-center justify-center text-xs transition-colors"
          onClick={onClose}
        >
          ✕
        </button>
        <h2 className="text-base sm:text-lg font-bold tracking-tight mb-3">
          🎯 Create Match
        </h2>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1">
              Created By
            </div>
            <div className="p-2 rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-sm text-white">
              {user}
            </div>
          </div>
          <div>
            <label
              className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1 block"
              htmlFor="match-game"
            >
              Game
            </label>
            <select
              id="match-game"
              className="w-full p-2 border border-indigo-500/20 bg-slate-900 rounded-lg text-sm text-white"
              value={game}
              onChange={(e) => {
                const v = e.target.value as GameKey;
                setGame(v);
                const opts = getStartOptionsForGame(v);
                setStartingScore(opts?.[0]);
              }}
              onPointerDown={(e) => {
                (e as any).stopPropagation();
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onTouchStart={(e) => {
                (e as any).stopPropagation?.();
              }}
            >
              {allGames.map((g) => (
                <option key={g} value={g} className="bg-slate-900 text-white">
                  {g}
                </option>
              ))}
            </select>
          </div>
          {getStartOptionsForGame(game).length > 0 ? (
            <div>
              <label
                className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1 block"
                htmlFor="match-start"
              >
                {`${game} Starting Score`}
              </label>
              <select
                id="match-start"
                className="p-2 border border-indigo-500/20 bg-slate-900 rounded-lg text-sm text-white w-full"
                value={startingScore}
                onChange={(e) => setStartingScore(Number(e.target.value))}
                onPointerDown={(e) => {
                  (e as any).stopPropagation();
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onTouchStart={(e) => {
                  (e as any).stopPropagation?.();
                }}
              >
                {getStartOptionsForGame(game).map((opt) => (
                  <option
                    key={opt}
                    value={opt}
                    className="bg-slate-900 text-white"
                  >
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1">
              Mode
            </div>
            <div className="flex gap-2 mt-1 justify-center">
              <label
                className={`btn ${modeType === "bestof" ? "btn-primary" : "btn-ghost"}`}
              >
                <input
                  type="radio"
                  name="mode"
                  value="bestof"
                  checked={modeType === "bestof"}
                  onChange={() => {
                    setModeType("bestof");
                    setLegs((prev) => {
                      const base = Math.max(1, prev || 3);
                      // Ensure odd for Best Of
                      return base % 2 === 1 ? base : base + 1;
                    });
                    setTimeout(() => legsRef.current?.focus(), 0);
                  }}
                  className="sr-only"
                />{" "}
                Best Of
              </label>
              <label
                className={`btn ${modeType === "firstto" ? "btn-primary" : "btn-ghost"}`}
              >
                <input
                  type="radio"
                  name="mode"
                  value="firstto"
                  checked={modeType === "firstto"}
                  onChange={() => {
                    setModeType("firstto");
                    setLegs((prev) => Math.max(1, prev || 3));
                    setTimeout(() => legsRef.current?.focus(), 0);
                  }}
                  className="sr-only"
                />{" "}
                First To
              </label>
            </div>
          </div>
          <div>
            <label
              className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1 block"
              htmlFor="match-legs"
            >
              {modeType === "bestof" ? "Best Of" : "First To"}
            </label>
            <input
              id="match-legs"
              type="number"
              min={1}
              value={legs}
              onChange={(e) =>
                setLegs(Math.max(1, Number(e.target.value || 1)))
              }
              ref={legsRef}
              className="w-full p-2 border border-indigo-500/20 bg-indigo-500/10 rounded-lg text-sm text-white"
            />
          </div>
          <div>
            <label
              className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1 block"
              htmlFor="match-avg"
            >
              Average Choice (±)
            </label>
            <input
              id="match-avg"
              type="number"
              value={avgChoice}
              onChange={(e) => setAvgChoice(Number(e.target.value || 0))}
              className="w-full p-2 border border-indigo-500/20 bg-indigo-500/10 rounded-lg text-sm text-white"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4 pt-3 border-t border-indigo-500/20">
          <button className="flex-1 btn btn-ghost text-xs" onClick={onClose}>
            Cancel
          </button>
          <button className="flex-1 btn text-xs" onClick={handleCreate}>
            Create Match
          </button>
        </div>
      </div>
    </div>,
    portalEl,
  );
}
