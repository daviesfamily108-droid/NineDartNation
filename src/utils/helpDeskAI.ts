// Help Desk AI - Provides intelligent responses to common questions
export const HELP_TOPICS = {
  calibration: {
    keywords: [
      "calibration",
      "calibrate",
      "camera",
      "score",
      "accuracy",
      "aim",
      "setup",
    ],
    title: "How Calibration Works",
    explanation: `Calibration helps our AI precisely detect where your darts land on the board. Here's how it works:

1. **D20**: Click on the 20 segment to calibrate that area
2. **D6**: Click on the 6 segment to calibrate that area
3. **D3**: Click on the 3 segment to calibrate that area
4. **D11**: Click on the 11 segment to calibrate that area
5. **Bullseye**: Click on the bullseye to calibrate the center

Each click teaches the system about your board's position and angle. After calibrating all areas, your scoring will be much more accurate!`,
    actions: [
      { id: "D20", label: "📍 Click D20", color: "bg-blue-600" },
      { id: "D6", label: "📍 Click D6", color: "bg-purple-600" },
      { id: "D3", label: "📍 Click D3", color: "bg-pink-600" },
      { id: "D11", label: "📍 Click D11", color: "bg-cyan-600" },
      { id: "Bullseye", label: "🎯 Click Bullseye", color: "bg-yellow-600" },
    ],
  },
  scoring: {
    keywords: [
      "score",
      "points",
      "counting",
      "how do i score",
      "scoring system",
    ],
    title: "Dart Scoring",
    explanation: `In darts, each segment on the board has a value:
- Single areas: Face value (1-20)
- Double ring (outer): 2× the segment number
- Triple ring (inner): 3× the segment number
- Bullseye: 50 points
- Bull (outer bull): 25 points

For example: hitting Triple 20 = 60 points, Double 10 = 20 points`,
  },
  gameplay: {
    keywords: [
      "game",
      "how to play",
      "rules",
      "x01",
      "cricket",
      "match",
      "round",
    ],
    title: "How to Play",
    explanation: `Nine Dart Nation supports multiple game modes:

**X01** (501, 301, 701): Start from the set score and count down to exactly 0. Final dart must be on a double.

**Cricket**: Players try to "close" numbers 15-20 and bullseye by hitting them. First to close all and have the highest score wins.

**Killer**: Players mark their "number" and try to knock out other players' lives.

Select your game mode when creating a match, and follow the on-screen instructions!`,
  },
  premium: {
    keywords: [
      "premium",
      "subscription",
      "features",
      "upgrade",
      "cost",
      "paid",
    ],
    title: "Premium Features",
    explanation: `Our Premium subscription gives you:
- Tournament creation and entry
- Advanced statistics and replays
- Priority matchmaking
- Custom profiles and themes
- Ad-free experience

Premium grants are often awarded as tournament prizes!`,
  },
  connection: {
    keywords: [
      "connection",
      "disconnect",
      "lag",
      "latency",
      "websocket",
      "error",
      "offline",
    ],
    title: "Connection Issues",
    explanation: `If you're experiencing connection issues:
1. Check your internet connection
2. Refresh the page (Ctrl+R or Cmd+R)
3. Clear browser cache
4. Try a different browser
5. Check if the site status page shows any issues

Most connection issues resolve in seconds. Contact admin if problems persist.`,
  },
  camera: {
    keywords: [
      "camera",
      "phone camera",
      "mobile",
      "video",
      "pairing",
      "connect",
    ],
    title: "Camera Setup",
    explanation: `To use our phone camera feature:
1. Open Nine Dart Nation on your phone
2. Go to Settings > Camera Pairing
3. Scan the QR code or enter the pairing code
4. Position your phone to capture the dartboard
5. Run calibration (see calibration help for details)

Your phone will now act as a live dartboard camera!`,
  },
  tournament: {
    keywords: [
      "tournament",
      "compete",
      "bracket",
      "prize",
      "winner",
      "playoffs",
    ],
    title: "Tournaments",
    explanation: `Tournaments are competitive events where you can:
- Play against other skilled players
- Win prizes (Premium subscriptions)
- Climb leaderboards
- Compete in structured brackets

Check the Tournaments tab to see upcoming events. Registration typically opens 30 minutes before start time.`,
  },
};

export interface AIResponse {
  type: "explanation" | "suggestion" | "escalate";
  title: string;
  message: string;
  actions?: Array<{ id: string; label: string; color: string }>;
  followUp?: string;
}

export function analyzeUserQuestion(question: string): AIResponse | null {
  const lowerQ = question.toLowerCase();

  // Find matching topic
  for (const [, topic] of Object.entries(HELP_TOPICS)) {
    for (const keyword of topic.keywords) {
      if (lowerQ.includes(keyword)) {
        return {
          type: "explanation",
          title: topic.title,
          message: topic.explanation,
          actions: (topic as any).actions,
          followUp:
            "Do you need further assistance? I can connect you with an admin if needed.",
        };
      }
    }
  }

  // No match found - suggest escalation
  return {
    type: "suggestion",
    title: "Need More Help?",
    message: `I couldn't find a specific answer to your question. Common topics I can help with:\n\n${Object.values(
      HELP_TOPICS,
    )
      .map((t) => `· ${t.title}`)
      .join("\n")}\n\nOr I can connect you with an admin who can help further.`,
    followUp: "Would you like to speak with an admin?",
  };
}

export function getEstimatedWaitTime(): string {
  const hour = new Date().getHours();

  if (hour >= 20 || hour < 7) {
    return "20-30 minutes (off-peak hours)";
  } else if (hour >= 12 && hour < 14) {
    return "10-15 minutes (moderate traffic)";
  } else if (hour >= 18 && hour < 20) {
    return "15-20 minutes (peak hours)";
  } else {
    return "5-10 minutes";
  }
}
