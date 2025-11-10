# AI Help Desk - Quick Visual Guide

## Chat Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER ASKS QUESTION                           │
│              "How does calibration work?"                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│              AI ANALYZES QUESTION                               │
│         (Detects "calibration" keyword)                         │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│          AI PROVIDES SMART RESPONSE                             │
│   ⚡ AI Assistant (2:15 PM)                                     │
│   ├─ Title: "How Calibration Works"                            │
│   ├─ Explanation: [Detailed text]                              │
│   └─ Actions: [Interactive buttons]                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│         USER CLICKS CALIBRATION BUTTONS                         │
│   [📍 D20] [📍 D6] [📍 D3] [📍 D11] [🎯 Bullseye]            │
│          Each click is recorded & sent to admin                │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│      AI ASKS: "Need further assistance?"                        │
│            [✅ Yes, connect me]  [❌ No thanks]                 │
└──────────────────────┬──────────────────────────────────────────┘
                    ┌──┴───┐
                    │      │
         ┌──────────▼┐  ┌──▼──────────┐
         │  YES      │  │  NO         │
         └──────────┬┘  └──┬──────────┘
                    │      │
         ┌──────────▼──┐   │
         │  ESCALATE   │   │
         │  TO ADMIN   │   │
         └──────────┬──┘   │
                    │      │
         ┌──────────▼──────▼─────────────────────┐
         │                                        │
         │  ⏳ Connecting you with an admin...   │
         │  📊 Est. wait: 5-10 minutes           │
         │  👤 Admin will join shortly           │
         │                                        │
         │       ✅ Great! Enjoy your game!      │
         └────────────────────────────────────────┘
```

---

## Message Types

### AI Response
```
┌─────────────────────────────────┐
│ ⚡ AI Assistant         2:15 PM │
├─────────────────────────────────┤
│ How Calibration Works           │
│                                 │
│ Calibration helps our AI...     │
│ [Detailed explanation]          │
│                                 │
│ [Calibration Buttons]           │
│ [Yes/No Follow-up]              │
└─────────────────────────────────┘
```

### User Message
```
┌─────────────────────────────────┐
│ 👤 You                  2:16 PM │
├─────────────────────────────────┤
│ Clicked: 📍 D20                 │
└─────────────────────────────────┘
```

### System Message
```
┌─────────────────────────────────┐
│ 🔔 System                2:17 PM│
├─────────────────────────────────┤
│ ⏳ Connecting...                │
│ 📊 Est. wait: 5-10 minutes      │
└─────────────────────────────────┘
```

### Admin Message
```
┌─────────────────────────────────┐
│ ⚡ Admin Dave           2:18 PM │
├─────────────────────────────────┤
│ Hi! I see you need help with... │
│ (Your previous actions tracked) │
└─────────────────────────────────┘
```

---

## Calibration Buttons

Each button represents a dartboard calibration point:

```
🎯 CALIBRATION POINTS

[📍 D20]      → Click 20 segment (Blue)
[📍 D6]       → Click 6 segment (Purple)  
[📍 D3]       → Click 3 segment (Pink)
[📍 D11]      → Click 11 segment (Cyan)
[🎯 Bullseye] → Click center (Yellow)

Each click teaches the system about your board's position
```

---

## AI Topics Supported

```
Topic              | Keywords                  | Response Type
─────────────────────────────────────────────────────────────────
Calibration        | calibration, camera,      | Explanation +
                   | score, accuracy           | Buttons
─────────────────────────────────────────────────────────────────
Scoring            | score, points, counting   | Explanation
─────────────────────────────────────────────────────────────────
Gameplay           | game, rules, x01,         | Explanation
                   | cricket, match            | 
─────────────────────────────────────────────────────────────────
Premium            | premium, subscription,    | Explanation
                   | features, upgrade         |
─────────────────────────────────────────────────────────────────
Connection         | connection, lag, error,   | Explanation +
                   | offline, disconnect       | Troubleshooting
─────────────────────────────────────────────────────────────────
Camera             | camera, phone, mobile,    | Explanation
                   | video, pairing            |
─────────────────────────────────────────────────────────────────
Tournament         | tournament, compete,      | Explanation
                   | bracket, prize            |
─────────────────────────────────────────────────────────────────
Unknown            | [any other topic]         | Suggest escalation
                   |                           |
```

---

## Wait Time Logic

```
Time Range        | Status    | Wait Time
─────────────────────────────────────────────────────
20:00 - 07:00     | Off-peak  | 20-30 min
07:00 - 12:00     | Quiet     | 5-10 min
12:00 - 14:00     | Lunch     | 10-15 min
14:00 - 18:00     | Business  | 5-10 min
18:00 - 20:00     | Peak      | 15-20 min
```

---

## Key Features

### ✨ For Users

✅ Get instant AI answers to common questions  
✅ Interactive calibration guidance with clickable buttons  
✅ Smooth escalation to real admins if needed  
✅ Estimated wait times so you know how long  
✅ Full chat history preserved  
✅ Can ask follow-up questions anytime  

### ✨ For Admins

✅ See which AI topic user already tried  
✅ View calibration buttons user clicked  
✅ Understand user's context before responding  
✅ Only escalated requests (saves time)  
✅ User satisfaction tracking via escalations  

### ✨ For Platform

✅ Reduces admin workload (self-service topics)  
✅ Faster response times (AI is instant)  
✅ 24/7 availability (AI runs 24/7)  
✅ Better user satisfaction (get help faster)  
✅ Analytics on most common issues  

---

## Example Conversations

### Example 1: Calibration Help

```
User: How do I calibrate my phone camera?

⚡ AI Assistant: How Camera Setup Works

To use our phone camera feature:
1. Open Nine Dart Nation on your phone
2. Go to Settings > Camera Pairing
3. Scan the QR code or enter pairing code
4. Position your phone to capture dartboard
5. Run calibration (see below)

🎯 Try these calibration points:
[📍 D20] [📍 D6] [📍 D3] [📍 D11] [🎯 Bullseye]

Do you need further assistance?
[✅ Yes] [❌ No]

User: Clicked D20, D6, D3, D11, Bullseye
User: Yes, still having issues

System: ⏳ Connecting with an admin...
         Est. wait: 5-10 minutes

⚡ Admin Dave: Hi! I see you completed calibration
              Let me help debug the camera issue...
```

### Example 2: Scoring Question

```
User: How many points is triple 20?

⚡ AI Assistant: Dart Scoring

Triple 20 = 3 × 20 = 60 points

In darts:
- Single areas: Face value (1-20)
- Double ring: 2× the number
- Triple ring: 3× the number
- Bullseye: 50 points

Do you need further help?
[✅ Yes] [❌ No]

User: No thanks
⚡ AI Assistant: ✅ Great! Enjoy your game!
```

### Example 3: Unknown Question

```
User: Can I play with my friend in real-time?

⚡ AI Assistant: Need More Help?

I couldn't find a specific answer. Common topics:
• How Calibration Works
• Dart Scoring
• How to Play
• Premium Features
• Connection Issues
• Camera Setup
• Tournaments

Would you like to speak with an admin?
[✅ Yes] [❌ No]

User: Yes
System: Escalating to admin...
```

---

## Mobile Experience

```
┌─────────────────────┐
│ ⚡ Help Desk        │
│ Admin Connected: No │
├─────────────────────┤
│ How does...         │
│ calibration work?   │
│          ⏱ 2:15 PM │
│                     │
│ ⚡ AI: How Calib... │
│ [Full explanation]  │
│ [D20][D6][D3][D11]  │
│ [Bullseye]          │
│ [Yes][No]           │
├─────────────────────┤
│ Ask a question...   │
│ [📨]                │
└─────────────────────┘
```

---

**Status**: ✅ Production Ready  
**Compilation**: ✅ 0 Errors  
**Test Coverage**: ✅ All flows covered
