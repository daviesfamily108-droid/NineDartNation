# Voice Scoring Feature

## Overview
Implemented a "Talk to Score" feature for offline play, allowing users to input scores using voice commands.

## Changes
1.  **New Utility**: `src/utils/voiceScoring.ts`
    *   Parses natural language (e.g., "Triple Twenty", "Double Top", "Bullseye") into game codes ("T20", "D20", "50").
    *   **New**: Supports full visit scores (e.g., "Seventy Five", "One Hundred and Eighty").
    *   Handles commands: "Undo", "Bust", "Next".

2.  **New Hook**: `src/hooks/useVoiceScoreInput.ts`
    *   Manages `SpeechRecognition` API lifecycle.
    *   Provides `isListening`, `toggleListening`, and `transcript` state.
    *   Handles browser support and errors.

3.  **UI Integration**: `src/components/OfflinePlay.tsx`
    *   Added microphone button to the "Manual Scoring" section.
    *   Integrated `useVoiceScoreInput` to capture and apply scores.
    *   Supports "Undo" command via voice.
    *   Displays toast notifications for recognized scores.

## Usage
1.  Start an Offline Match (X01).
2.  Locate the "Manual Scoring" panel (bottom left).
3.  Click the "🎤 Voice" button to start listening.
4.  Speak your score:
    *   **Dart Mode**: "Triple 20", "Double 16", "25".
    *   **Visit Mode**: "Seventy Five", "One Hundred", "45".
5.  Say "Undo" to remove the last dart.

## Supported Commands
*   **Scores**: "Single/Double/Triple [Number]", "Bull", "Outer Bull", "Double Top".
*   **Visit Totals**: Any number up to 180 (e.g., "Seventy Five").
*   **Actions**: "Undo".
