import React from "react";

export default function OnlinePlayClean({ user }: { user?: any }) {
  return (
    <div className="flex-1 min-h-0" style={{ position: "relative", marginTop: 0 }}>
      <div className="card ndn-game-shell relative overflow-hidden">
      <h2 className="text-3xl font-bold text-brand-700 mb-4">Online Play</h2>
      <div className="ndn-shell-body">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4 min-h-[320px]">
          <div className="text-sm opacity-70">
            This is a blank Online Play layout. Remove everything here and
            start adding cards, controls and camera preview components as
            required.
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
