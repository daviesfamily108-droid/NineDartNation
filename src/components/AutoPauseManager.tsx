import { useEffect } from "react";
import { useMatchControl } from "../store/matchControl.js";

// Watches pauseEndsAt and automatically clears pause when time elapses.
export default function AutoPauseManager() {
  const paused = useMatchControl((s: any) => s.paused);
  const pauseEndsAt = useMatchControl((s: any) => s.pauseEndsAt);
  const setPaused = useMatchControl((s: any) => s.setPaused);

  useEffect(() => {
    if (!paused || !pauseEndsAt) return;
    const now = Date.now();
    if (pauseEndsAt <= now) {
      setPaused(false, null);
      return;
    }
    const ms = pauseEndsAt - now;
    const t = setTimeout(() => setPaused(false, null), ms);
    return () => clearTimeout(t);
  }, [paused, pauseEndsAt, setPaused]);

  return null;
}
