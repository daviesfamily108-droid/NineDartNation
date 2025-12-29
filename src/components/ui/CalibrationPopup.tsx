import React from "react";
import type { Player } from "../../store/match";
import { getCalibrationStatus } from "../../utils/gameCalibrationRequirements";

export default function CalibrationPopup({
  players,
  playerCalibrations,
  calibrationSkipped,
  onSkip,
  onOpenCalibrator,
  onClose,
}: {
  players: Player[];
  playerCalibrations: { [k: string]: any };
  calibrationSkipped: Record<string, boolean>;
  onSkip: (id: string) => void;
  onOpenCalibrator: (id: string) => void;
  onClose: () => void;
}) {
  const skippedPlayers = players.filter((p) => calibrationSkipped[p.id]);
  const remainingPlayers = players.filter((p) => !calibrationSkipped[p.id]);
  const canStartMatch = remainingPlayers.length === 0;

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-black/90 backdrop-blur-sm py-8 px-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl p-6 max-w-2xl w-full mx-auto shadow-2xl">
        <h3 className="text-xl font-bold mb-4 text-center">
          Calibration Check 🎯
        </h3>
        <p className="text-sm opacity-70 mb-6 text-center">
          Check your dartboard calibration before the match starts 🎯. Both
          players must skip or confirm to begin 🎯.
        </p>
        {skippedPlayers.length > 0 && remainingPlayers.length > 0 && (
          <div className="mb-4 p-3 bg-blue-900/50 border border-blue-600 rounded-lg">
            <p className="text-sm text-blue-200">
              {skippedPlayers.map((p) => p.name).join(", ")}{" "}
              {skippedPlayers.length === 1 ? "has" : "have"} chosen to skip 🎯.{" "}
              {remainingPlayers.map((p) => p.name).join(", ")}, would you like
              to skip as well 🎯?
            </p>
          </div>
        )}
        <div className="space-y-4">
          {players.map((player) => (
            <div
              key={player.id}
              className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-lg font-bold text-white">
                  {player.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div>
                  <div className="font-medium">{player.name}</div>
                  <div className="text-xs text-slate-400">
                    {(() => {
                      const c = playerCalibrations[player.name];
                      const status = getCalibrationStatus({
                        H: c?.H,
                        imageSize: c?.imageSize,
                        locked: c?.locked,
                        errorPx: c?.errorPx,
                      });
                      if (status === "verified") return "Calibrated ✅";
                      if (status === "unknown")
                        return "Calibration quality unknown";
                      return "Needs calibration";
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => onOpenCalibrator(player.id)}
                >
                  Bull Up 🎯
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onSkip(player.id)}
                  disabled={!!calibrationSkipped[player.id]}
                >
                  {calibrationSkipped[player.id] ? "Skipped ✓" : "Skip 🎯"}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-center gap-4">
          <button
            className={`btn ${canStartMatch ? "btn-primary" : "btn-ghost opacity-50 cursor-not-allowed"}`}
            disabled={!canStartMatch}
            onClick={onClose}
          >
            Start Match 🎯
          </button>
        </div>
      </div>
    </div>
  );
}
