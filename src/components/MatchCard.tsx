import React from "react";
import { labelForMode, type ModeKey } from "../utils/games.js";

type Tournament = {
  id: string;
  title: string;
  game: string;
  mode: ModeKey;
  value: number;
  startAt: number;
  capacity: number;
  participants: { email: string; username: string }[];
  creatorName?: string;
  creatorEmail?: string;
  official?: boolean;
};

export default function MatchCard({
  t,
  onJoin,
  onLeave,
  joined,
  disabled,
}: {
  t: Tournament;
  onJoin?: (t: any) => void;
  onLeave?: (t: any) => void;
  joined?: boolean;
  disabled?: boolean;
}) {
  return (
    <li
      className="p-3 rounded-xl border flex items-center justify-between relative"
      style={{ background: "rgba(49,46,129,0.18)", borderColor: "#8F43EE44" }}
    >
      <div className="space-y-0.5">
        <div className="font-semibold">
          {t.title}
          {t.official && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded bg-amber-500 text-black text-xs">
              Official
            </span>
          )}
        </div>
        <div className="text-sm opacity-80">
          {t.game}
          {t.game === "X01" ? `/501` : ""} · {labelForMode(t.mode)} {t.value} ·{" "}
          {new Date(t.startAt).toLocaleString()} · Cap {t.capacity} · Joined{" "}
          {t.participants?.length || 0}
        </div>
        <div className="text-xs opacity-60 mt-1">
          Created by: {t.creatorName || t.creatorEmail || "Unknown"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          className={`btn ${joined ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
          disabled={disabled}
          onClick={() => (joined ? onLeave && onLeave(t) : onJoin && onJoin(t))}
        >
          {joined ? "Already Joined! ✅" : "Join Now ⚔️"}
        </button>
      </div>
    </li>
  );
}
