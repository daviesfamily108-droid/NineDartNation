import { useState, useEffect } from 'react';
import { useWS } from './WSProvider';
import { useToast } from '../store/toast';
import { premiumGames, allGames, type GameKey } from '../utils/games';
import { getUserCurrency, formatPriceInCurrency } from '../utils/config';
import { getAllTimeAvg } from '../store/profileStats';
import { incOnlineUsage } from '../utils/quota';

interface Match {
  id: string;
  creatorName: string;
  creatorId: string;
  game: string;
  mode: 'bestof' | 'firstto';
  value: number;
  startingScore?: number;
  creatorAvg?: number;
  requireCalibration?: boolean;
}

interface LobbyPanelProps {
  user?: any;
  connected: boolean;
  onCreateMatch: () => void;
  onJoinMatch: (match: Match) => void;
  onRefresh: () => void;
}

export default function LobbyPanel({
  user,
  connected,
  onCreateMatch,
  onJoinMatch,
  onRefresh
}: LobbyPanelProps) {
  const wsGlobal = (() => { try { return useWS() } catch { return null } })();
  const toast = useToast();

  const [lobby, setLobby] = useState<Match[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'bestof' | 'firstto'>('all');
  const [filterGame, setFilterGame] = useState<GameKey | 'all'>('all');
  const [filterStart, setFilterStart] = useState<'all' | 301 | 501 | 701>('all');
  const [nearAvg, setNearAvg] = useState(false);
  const [avgTolerance, setAvgTolerance] = useState(10);
  const [loading, setLoading] = useState(false);

  const myAvg = user?.username ? getAllTimeAvg(user.username) : 0;
  const freeLeft = user?.username ? getFreeRemaining(user.username) : 0;
  const locked = !user?.fullAccess && freeLeft !== Infinity && freeLeft <= 0;

  // Filter matches based on current filters
  const filteredLobby = lobby.filter((m: Match) => {
    if (filterMode !== 'all' && m.mode !== filterMode) return false;
    if (filterGame !== 'all' && m.game !== filterGame) return false;
    if (filterStart !== 'all' && m.startingScore !== filterStart) return false;
    if (nearAvg && myAvg && m.creatorAvg) {
      const diff = Math.abs(m.creatorAvg - myAvg);
      if (diff > avgTolerance) return false;
    }
    return true;
  });

  const handleJoinMatch = async (match: Match) => {
    if (locked && premiumGames.includes(match.game as any)) {
      toast({ type: 'error', message: 'PREMIUM game - upgrade required' });
      return;
    }
    if (locked) {
      toast({ type: 'error', message: 'Weekly free games used - upgrade to PREMIUM' });
      return;
    }

    try {
      // Try to get board preview for calibration requirement
      let boardPreview: string | null = null;
      if (match.requireCalibration) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          const track = stream.getVideoTracks()?.[0];
          const video = document.createElement('video');
          video.srcObject = stream;
          await video.play().catch(() => {});
          await new Promise(r => setTimeout(r, 120));
          const w = Math.min(320, video.videoWidth || 320);
          const h = Math.max(1, Math.floor((video.videoHeight || 180) * (w / Math.max(1, video.videoWidth || 320))));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(video, 0, 0, w, h);
          boardPreview = canvas.toDataURL('image/jpeg', 0.7);
          try { if (track) track.stop() } catch {}
          try { (stream as any).getTracks?.().forEach((t: any) => t.stop()) } catch {}
        } catch {
          // Board preview failed, but continue anyway
        }
      }

      const calibrated = !!boardPreview || !match.requireCalibration;

      if (wsGlobal) {
        wsGlobal.send({
          type: 'join-match',
          matchId: match.id,
          calibrated,
          boardPreview
        });
      }

      onJoinMatch(match);

      // Consume free game for non-premium users
      if (user?.username && !user?.fullAccess) {
        incOnlineUsage(user.username);
      }
    } catch (error) {
      toast({ type: 'error', message: 'Failed to join match' });
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    onRefresh();
    setTimeout(() => setLoading(false), 1000);
  };

  const resetFilters = () => {
    setFilterMode('all');
    setFilterGame('all');
    setFilterStart('all');
    setNearAvg(false);
    setAvgTolerance(10);
  };

  if (!connected) {
    return (
      <div className="p-4 text-center text-slate-400">
        <div className="text-lg mb-2">Lobby unavailable</div>
        <div className="text-sm">Connect to the server to see available matches</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="font-semibold text-white">World Lobby</div>
        <div className="flex items-center gap-2">
          <div className="text-xs opacity-80">
            Matches: {filteredLobby.length}
          </div>
          <button
            className="btn px-3 py-1 text-sm"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? '...' : 'Refresh'}
          </button>
          <button
            className="btn px-3 py-1 text-sm"
            disabled={locked}
            onClick={onCreateMatch}
          >
            Create Match +
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs opacity-70 mb-1">Mode</label>
          <div className="flex gap-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'bestof', label: 'Best of' },
              { key: 'firstto', label: 'First to' }
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`px-3 py-1 text-xs rounded ${
                  filterMode === key
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-400/40'
                    : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'
                }`}
                onClick={() => setFilterMode(key as any)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="block text-xs opacity-70 mb-1">Game</label>
            <select
              className="input w-full text-sm"
              value={filterGame}
              onChange={e => setFilterGame(e.target.value as any)}
            >
              <option value="all">All</option>
              {allGames.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs opacity-70 mb-1">Starting Score</label>
            <select
              className="input w-full text-sm"
              value={filterStart}
              onChange={e => {
                const v = e.target.value;
                if (v === 'all') setFilterStart('all');
                else setFilterStart(Number(v) as any);
              }}
              disabled={filterGame !== 'all' && filterGame !== 'X01'}
            >
              <option value="all">All</option>
              <option value="301">301</option>
              <option value="501">501</option>
              <option value="701">701</option>
            </select>
          </div>
          <div>
            <label className="block text-xs opacity-70 mb-1">Opponent near my avg</label>
            <div className="flex items-center gap-2">
              <input
                id="nearavg"
                type="checkbox"
                className="accent-purple-500"
                checked={nearAvg}
                onChange={e => setNearAvg(e.target.checked)}
                disabled={!myAvg}
              />
              <input
                className="input w-24 text-sm"
                type="number"
                min={5}
                max={40}
                step={1}
                value={avgTolerance}
                onChange={e => setAvgTolerance(parseInt(e.target.value || '10'))}
                disabled={!nearAvg}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 max-w-sm">
            <label className={`block text-xs opacity-70 mb-1 ${!nearAvg ? 'opacity-40' : ''}`}>
              Avg tolerance (±)
            </label>
            <input
              className="w-full"
              type="range"
              min={1}
              max={50}
              value={avgTolerance}
              onChange={e => setAvgTolerance(parseInt(e.target.value || '10'))}
              disabled={!nearAvg}
            />
            <div className="text-xs opacity-70 mt-1">± {avgTolerance}</div>
          </div>
          <button
            className="btn px-3 py-1 text-sm"
            onClick={resetFilters}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Match List */}
      {filteredLobby.length === 0 ? (
        <div className="text-sm text-slate-300 text-center py-8">
          No games waiting. Create one!
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLobby.map((match) => (
            <div key={match.id} className="p-3 rounded-lg bg-black/20 flex items-center justify-between relative">
              <div className="text-sm">
                <div>
                  <span className="font-semibold">{match.creatorName}</span> — {match.game} —{' '}
                  {match.mode === 'bestof' ? `Best Of ${match.value}` : `First To ${match.value}`}
                  {match.game === 'X01' && match.startingScore && ` — ${match.startingScore}`}
                </div>
                {match.requireCalibration && (
                  <div className="text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-600/30 mt-1">
                    Calibration required
                  </div>
                )}
                {match.creatorAvg ? (
                  <div className="text-xs opacity-70">
                    Creator avg: {Number(match.creatorAvg).toFixed(1)}
                  </div>
                ) : null}
                <div className="text-xs opacity-70">ID: {match.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn px-3 py-1 text-sm bg-rose-600 hover:bg-rose-700"
                  disabled={locked || (!user?.fullAccess && premiumGames.includes(match.game as any)) || (!!match.requireCalibration && !true /* calibH not available */)}
                  title={
                    !user?.fullAccess && premiumGames.includes(match.game as any)
                      ? 'PREMIUM game'
                      : locked
                      ? 'Weekly free games used'
                      : !!match.requireCalibration
                      ? 'Calibration required'
                      : ''
                  }
                  onClick={() => handleJoinMatch(match)}
                >
                  Join Now!
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Free games notice */}
      {!user?.fullAccess && (
        <div className="text-xs text-slate-400 mt-4">
          Weekly free online games remaining: {freeLeft === Infinity ? '∞' : freeLeft}
        </div>
      )}
      {(!user?.fullAccess && freeLeft !== Infinity && freeLeft <= 0) && (
        <div className="mt-2 p-2 rounded-lg bg-rose-700/30 border border-rose-600/40 text-rose-200 text-sm">
          You've used your 3 free online games this week. Upgrade to PREMIUM to continue.
        </div>
      )}
    </div>
  );
}
