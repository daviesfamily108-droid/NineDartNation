export type KillerState = {
  number: number; // assigned sector 1..20
  lives: number; // start with 3
  isKiller: boolean; // became killer by hitting own double
  eliminated: boolean;
};

export function createKillerState(assigned: number, lives = 3): KillerState {
  return { number: assigned, lives, isKiller: false, eliminated: false };
}

// Assign unique random numbers (1..20) to each player id
export function assignKillerNumbers<T extends string>(
  playerIds: T[],
): Record<T, number> {
  const pool = Array.from({ length: 20 }, (_, i) => i + 1);
  const res: any = {};
  for (const id of playerIds) {
    // pick a random remaining number
    const idx = Math.floor(Math.random() * pool.length);
    const num = pool.splice(idx, 1)[0];
    res[id] = num;
  }
  return res;
}

// Apply a single dart in Killer context.
// Returns an object describing outcomes: becameKiller, victimId (if hit), livesRemoved
export function applyKillerDart(
  selfId: string,
  states: Record<string, KillerState>,
  ring?: "SINGLE" | "DOUBLE" | "TRIPLE" | "BULL" | "INNER_BULL",
  sector?: number | null,
): { becameKiller: boolean; victimId?: string; livesRemoved?: number } {
  const me = states[selfId];
  if (!me || !sector || !ring) return { becameKiller: false };
  // Becoming killer: hit your own DOUBLE only
  if (!me.isKiller && ring === "DOUBLE" && sector === me.number) {
    me.isKiller = true;
    return { becameKiller: true };
  }
  // If already killer, hitting opponents' doubles/triples removes lives
  if (me.isKiller && (ring === "DOUBLE" || ring === "TRIPLE")) {
    const victimId = Object.keys(states).find(
      (pid) =>
        pid !== selfId &&
        !states[pid].eliminated &&
        states[pid].number === sector,
    );
    if (victimId) {
      const victim = states[victimId];
      const delta = ring === "TRIPLE" ? 2 : 1;
      victim.lives = Math.max(0, victim.lives - delta);
      if (victim.lives === 0) victim.eliminated = true;
      return { becameKiller: false, victimId, livesRemoved: delta };
    }
  }
  return { becameKiller: false };
}

export function killerWinner(
  states: Record<string, KillerState>,
): string | null {
  const alive = Object.entries(states).filter(
    ([, st]) => !st.eliminated && st.lives > 0,
  );
  if (alive.length === 1) return alive[0][0];
  return null;
}
