import React, { useLayoutEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  allGames,
  type GameKey,
  gameConfig,
  getStartOptionsForGame,
  getExtraFieldsForGame,
  getValueLabelForGame,
  getDefaultExtraValues,
  getGameDisplay,
  type ModeKey,
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
  const [extraValues, setExtraValues] = useState<Record<string, number>>(() =>
    getDefaultExtraValues(game),
  );
  const user = (useUserSettings() as any).username || "Anonymous";

  // When game changes, reset mode/start/extras to match the selected game's config
  function onGameChange(g: GameKey) {
    setGame(g);
    const opts = getStartOptionsForGame(g);
    setStartingScore(opts?.[0]);
    setExtraValues(getDefaultExtraValues(g));
    const cfg = gameConfig[g];
    if (cfg?.modeOptions?.length) {
      const validMode = cfg.modeOptions.includes(modeType as ModeKey)
        ? modeType
        : cfg.modeOptions[0];
      setModeType(validMode as any);
    }
  }

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

  const extraFields = getExtraFieldsForGame(game);
  const valueLabel = getValueLabelForGame(game, modeType as ModeKey);
  const display = getGameDisplay(game);

  const handleCreate = () => {
    const payload = {
      createdBy: user,
      game,
      modeType,
      legs,
      avgChoice,
      startingScore,
      ...extraValues,
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
          {display.emoji} Create Match
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
              onChange={(e) => onGameChange(e.target.value as GameKey)}
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
              {allGames.map((g) => {
                const d = getGameDisplay(g);
                return (
                  <option key={g} value={g} className="bg-slate-900 text-white">
                    {d.emoji} {g}
                  </option>
                );
              })}
            </select>
            {display.tagline && (
              <div
                className="text-[10px] mt-0.5 px-0.5"
                style={{ color: display.color }}
              >
                {display.tagline}
              </div>
            )}
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
          {/* Per-game extra config fields */}
          {extraFields.length > 0 && (
            <div className="space-y-2">
              {extraFields.map((f) => (
                <div key={f.key}>
                  <label
                    className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1 block"
                    htmlFor={`match-extra-${f.key}`}
                  >
                    {f.label}
                  </label>
                  {f.type === "select" && f.options ? (
                    <select
                      id={`match-extra-${f.key}`}
                      className="w-full p-2 border border-indigo-500/20 bg-slate-900 rounded-lg text-sm text-white"
                      value={extraValues[f.key] ?? f.defaultValue}
                      onChange={(e) =>
                        setExtraValues((prev) => ({
                          ...prev,
                          [f.key]: Number(e.target.value),
                        }))
                      }
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
                      {f.options.map((o) => (
                        <option
                          key={o}
                          value={o}
                          className="bg-slate-900 text-white"
                        >
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`match-extra-${f.key}`}
                      type="number"
                      min={f.min ?? 1}
                      max={f.max}
                      step={f.step ?? 1}
                      value={extraValues[f.key] ?? f.defaultValue}
                      onChange={(e) =>
                        setExtraValues((prev) => ({
                          ...prev,
                          [f.key]: Number(e.target.value),
                        }))
                      }
                      className="w-full p-2 border border-indigo-500/20 bg-indigo-500/10 rounded-lg text-sm text-white"
                    />
                  )}
                  {f.hint && (
                    <div className="text-[10px] text-slate-400 mt-0.5 px-0.5">
                      {f.hint}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1">
              Mode
            </div>
            <div className="flex gap-2 mt-1 justify-center flex-wrap">
              {(gameConfig[game]?.modeOptions ?? ["bestof", "firstto"]).map(
                (m) => (
                  <label
                    key={m}
                    className={`btn ${modeType === m ? "btn-primary" : "btn-ghost"}`}
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={m}
                      checked={modeType === m}
                      onChange={() => {
                        setModeType(m as any);
                        if (m === "bestof") {
                          setLegs((prev) => {
                            const base = Math.max(1, prev || 3);
                            return base % 2 === 1 ? base : base + 1;
                          });
                        } else {
                          setLegs((prev) => Math.max(1, prev || 3));
                        }
                        setTimeout(() => legsRef.current?.focus(), 0);
                      }}
                      className="sr-only"
                    />{" "}
                    {m === "bestof"
                      ? "Best Of"
                      : m === "firstto"
                        ? "First To"
                        : m === "innings"
                          ? "Innings"
                          : m === "holes"
                            ? "Holes"
                            : m === "rounds"
                              ? "Rounds"
                              : m === "practice"
                                ? "Practice"
                                : m}
                  </label>
                ),
              )}
            </div>
          </div>
          <div>
            <label
              className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/70 mb-1 block"
              htmlFor="match-legs"
            >
              {valueLabel}
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
