import { useState } from "react";
import { useMatch } from "../store/match";

export default function MatchSettings() {
  const [playersText, setPlayersText] = useState("Player 1, Player 2");
  const [start, setStart] = useState(501);
  const [room, setRoom] = useState("");

  const { newMatch } = useMatch();

  function startMatch() {
    const names = playersText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.length) return alert("Please enter at least one player");
    newMatch(names, start, room);
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold mb-4">Start New Match ⚔️</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="playersText"
            className="block text-sm text-slate-600 mb-1"
          >
            Players (comma separated)
          </label>
          <input
            id="playersText"
            className="input w-full"
            value={playersText}
            onChange={(e) => setPlayersText(e.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="startScore"
            className="block text-sm text-slate-600 mb-1"
          >
            Starting Score
          </label>
          <input
            id="startScore"
            className="input w-full"
            type="number"
            value={start}
            onChange={(e) => setStart(parseInt(e.target.value || "501"))}
          />
        </div>
        <div>
          <label htmlFor="roomId" className="block text-sm text-slate-600 mb-1">
            Room ID (optional)
          </label>
          <input
            id="roomId"
            className="input w-full"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="room-1"
          />
        </div>
      </div>
      <div className="mt-3">
        <button className="btn" onClick={startMatch}>
          Start Match 🚀
        </button>
      </div>
    </div>
  );
}
