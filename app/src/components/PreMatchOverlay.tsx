import { useEffect, useState } from 'react';

interface Player {
  id: string;
  name: string;
  ready: boolean;
  avatar?: string;
}

interface PreMatchOverlayProps {
  gameType: string;
  players: Player[];
  countdown?: number;
  onReady?: (playerId: string) => void;
  onStart?: () => void;
  onCancel?: () => void;
  isHost?: boolean;
  autoStart?: boolean;
}

export default function PreMatchOverlay({
  gameType,
  players,
  countdown = 3,
  onReady,
  onStart,
  onCancel,
  isHost = false,
  autoStart = false
}: PreMatchOverlayProps) {
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [allReady, setAllReady] = useState(false);

  useEffect(() => {
    const ready = players.every(p => p.ready);
    setAllReady(ready);

    if (ready && autoStart && countdown > 0) {
      setCountdownValue(countdown);
      const timer = setInterval(() => {
        setCountdownValue(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            onStart?.();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    } else if (!ready) {
      setCountdownValue(null);
    }
  }, [players, autoStart, countdown, onStart]);

  const handleReadyToggle = (playerId: string) => {
    onReady?.(playerId);
  };

  const canStart = isHost && allReady;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Match Starting</h2>
          <p className="text-slate-400 text-sm uppercase tracking-wide">{gameType}</p>
        </div>

        {/* Countdown */}
        {countdownValue !== null && (
          <div className="text-center mb-6">
            <div className="w-20 h-20 mx-auto bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl font-bold text-white">{countdownValue}</span>
            </div>
            <p className="text-slate-300 text-sm">Get ready...</p>
          </div>
        )}

        {/* Players List */}
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Players</h3>
          {players.map((player) => (
            <div key={player.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                {player.avatar ? (
                  <img
                    src={player.avatar}
                    alt={player.name}
                    className="w-8 h-8 rounded-full border-2 border-slate-600"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {player.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-white font-medium">{player.name}</span>
                {isHost && player.id === players[0]?.id && (
                  <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
                    Host
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {player.ready ? (
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 text-sm font-medium">Ready</span>
                    <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div>
                  </div>
                ) : (
                  <span className="text-slate-400 text-sm">Waiting</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Ready Button */}
        {!isHost && (
          <button
            onClick={() => handleReadyToggle(players.find(p => !p.ready)?.id || '')}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
              players.some(p => !p.ready)
                ? 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white'
                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
            }`}
            disabled={!players.some(p => !p.ready)}
          >
            {players.some(p => !p.ready) ? 'Mark as Ready' : 'Waiting for Others...'}
          </button>
        )}

        {/* Host Controls */}
        {isHost && (
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onStart}
              disabled={!canStart}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                canStart
                  ? 'bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              {canStart ? 'Start Match' : 'Waiting...'}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500">
            Make sure your camera is calibrated and you're ready to play!
          </p>
        </div>
      </div>
    </div>
  );
}
