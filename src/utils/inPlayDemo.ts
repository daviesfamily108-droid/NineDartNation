import { useMatch } from "../store/match.js";
import { writeMatchSnapshot } from "./matchSync.js";

type DemoVisit = {
  score: number;
  darts?: number;
  visitTotal?: number;
};

type InPlayDemoOptions = {
  players: string[];
  startingScore?: number;
  roomId?: string;
  visits?: DemoVisit[];
  openWindow?: boolean;
};

export function launchInPlayDemo({
  players,
  startingScore = 501,
  roomId = "demo-room",
  visits,
  openWindow = true,
}: InPlayDemoOptions) {
  if (!players || players.length === 0) return;
  try {
    const match = useMatch.getState();
    match.newMatch(players, startingScore, roomId, "demo");

    const seededVisits: DemoVisit[] =
      visits && visits.length > 0
        ? visits
        : [{ score: 60 }, { score: 85 }, { score: 100 }];

    seededVisits.forEach((visit, index) => {
      match.addVisit(visit.score, visit.darts ?? 3, {
        visitTotal: visit.visitTotal ?? visit.score,
      });
      if (index < seededVisits.length - 1) {
        match.nextPlayer();
      }
    });

    writeMatchSnapshot();
  } catch {
    return;
  }

  // No-op: the in-game UI now renders inline via InGameShell,
  // so we no longer open a separate browser window.
}
