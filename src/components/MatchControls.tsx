import React, { useState } from "react";
import { Undo2 } from "lucide-react";
import ScoreNumberPad from "./ui/ScoreNumberPad";

interface MatchControlsProps {
  inProgress?: boolean;
  startingScore?: number;
  pendingEntries?: Array<any>;
  onAddVisit: (score: number, darts: number) => void;
  onUndo?: () => void;
  onEndLeg?: (score?: number, darts?: number, meta?: any) => void;
  onNextPlayer?: () => void;
  onEndGame?: () => void;
  showDartsSelect?: boolean;
  showCheckoutSelectors?: boolean;
  showActionButtons?: boolean;
  showQuickButtons?: boolean;
  showUndo?: boolean;
  showVisitInputRow?: boolean;
  showHelperText?: boolean;
  showNumberPadLabel?: boolean;
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
  showCheckoutSelectors = true,
  showActionButtons = true,
  showQuickButtons = true,
  showUndo = true,
  showVisitInputRow = true,
  showHelperText = true,
  showNumberPadLabel = true,
  quickButtons = [180, 140, 100, 60],
}: MatchControlsProps) {
  const [scoreInput, setScoreInput] = useState<string>("0");
  const [darts, setDarts] = useState<number>(3);
  const [checkoutDarts, setCheckoutDarts] = useState<number>(3);
  const [doubleDarts, setDoubleDarts] = useState<number>(1);
  const parsedScore = Number(scoreInput || 0);
  const safeScore = Number.isFinite(parsedScore) ? parsedScore : 0;
  const commitScore = () => {
    onAddVisit(Math.max(0, safeScore), darts);
    setScoreInput("0");
  };

  if (!inProgress) {
    return <p className="text-slate-600">No game in progress.</p>;
  }

  return (
    <div className="space-y-3">
      {showVisitInputRow && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-32"
            type="number"
            value={scoreInput}
            onChange={(e) => setScoreInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitScore();
              }
            }}
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
          <button className="btn" onClick={commitScore}>
            Add Visit ➕
          </button>
          {showUndo && (
            <button
              className="px-3 py-2 rounded-xl border border-slate-200"
              onClick={() => onUndo && onUndo()}
              title="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      {showQuickButtons && quickButtons && quickButtons.length > 0 && (
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
      <ScoreNumberPad
        value={scoreInput}
        onChange={setScoreInput}
        onSubmit={commitScore}
        label={showNumberPadLabel ? "Number pad" : undefined}
        helperText={
          showHelperText ? "Tap numbers then press Enter to submit." : undefined
        }
      />
      {showActionButtons && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn"
            onClick={() => {
              onEndLeg &&
                onEndLeg(Math.max(0, safeScore), checkoutDarts, {
                  doubleDarts,
                });
              setScoreInput("0");
            }}
          >
            End Leg (Checkout {safeScore || 0}) �
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
      )}
      {showCheckoutSelectors && (
        <div className="grid gap-3 text-sm">
          <div>
            <div className="text-xs text-white/60 mb-1">
              Darts used at double
            </div>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((n) => (
                <button
                  key={`double-${n}`}
                  className={`btn px-3 py-1 text-sm ${doubleDarts === n ? "bg-brand-600" : "btn--ghost"}`}
                  onClick={() => setDoubleDarts(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-white/60 mb-1">Darts at checkout</div>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((n) => (
                <button
                  key={`checkout-${n}`}
                  className={`btn px-3 py-1 text-sm ${checkoutDarts === n ? "bg-brand-600" : "btn--ghost"}`}
                  onClick={() => setCheckoutDarts(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
