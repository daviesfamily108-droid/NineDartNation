import React, { useState } from "react";
import { Undo2 } from "lucide-react";

interface MatchControlsProps {
  inProgress?: boolean;
  startingScore?: number;
  pendingEntries?: Array<any>;
  onAddVisit: (score: number, darts: number) => void;
  onUndo?: () => void;
  onEndLeg?: (score?: number) => void;
  onNextPlayer?: () => void;
  onEndGame?: () => void;
  showDartsSelect?: boolean;
  quickButtons?: number[];
}

export default function MatchControls({
  inProgress = true,
  startingScore: _startingScore = 501,
  pendingEntries: _pendingEntries = [],
  onAddVisit,
  onUndo,
  onEndLeg,
  onNextPlayer,
  onEndGame,
  showDartsSelect = true,
  quickButtons = [180, 140, 100, 60],
}: MatchControlsProps) {
  const [score, setScore] = useState<number>(0);
  const [darts, setDarts] = useState<number>(3);

  if (!inProgress) {
    return <p className="text-slate-600">No game in progress.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input w-32"
          type="number"
          value={score}
          onChange={(e) => setScore(parseInt(e.target.value || "0"))}
          placeholder="Score"
        />
        {showDartsSelect && (
          <select
            className="input"
            value={darts}
            onChange={(e) => setDarts(parseInt(e.target.value))}
          >
            <option value={1}>1 dart</option>
            <option value={2}>2 darts</option>
            <option value={3}>3 darts</option>
          </select>
        )}
        <button
          className="btn"
          onClick={() => {
            onAddVisit(Math.max(0, Number.isFinite(score) ? score : 0), darts);
            setScore(0);
          }}
        >
          Add Visit ➕
        </button>
        <button
          className="px-3 py-2 rounded-xl border border-slate-200"
          onClick={() => onUndo && onUndo()}
          title="Undo"
        >
          <Undo2 className="w-4 h-4" />
        </button>
      </div>
      {quickButtons && quickButtons.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
          <span className="opacity-70">Quick:</span>
          {quickButtons.map((v) => (
            <button
              key={String(v)}
              className="btn px-2 py-0.5 text-xs"
              onClick={() => onAddVisit(v, 3)}
            >
              {v}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn"
          onClick={() => {
            onEndLeg && onEndLeg(score);
            setScore(0);
          }}
        >
          End Leg (Checkout {score || 0}) �
        </button>
        <button
          className="btn bg-slate-700 hover:bg-slate-800"
          onClick={() => onNextPlayer && onNextPlayer()}
        >
          Next Player 👤
        </button>
        <button
          className="btn bg-emerald-600 hover:bg-emerald-700"
          onClick={() => {
            onEndGame && onEndGame();
          }}
        >
          End Game �
        </button>
      </div>
    </div>
  );
}
