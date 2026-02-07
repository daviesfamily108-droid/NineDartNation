import { useMatch } from "../store/match";
import { writeMatchSnapshot } from "./matchSync";

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
    match.newMatch(players, startingScore, roomId);

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

  if (!openWindow || typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("match", "1");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  } catch {}
}
