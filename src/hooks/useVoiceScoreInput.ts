import { useState, useEffect, useCallback, useRef } from "react";
import { parseVoiceInput, VoiceResult } from "../utils/voiceScoring";

export function useVoiceScoreInput(onResult: (result: VoiceResult) => void) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onstart = () => {
          setIsListening(true);
          setError(null);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          if (event.error === "not-allowed") {
            setError("Microphone access denied");
          } else if (event.error === "no-speech") {
            // Ignore no-speech errors, just stop listening
          } else {
            setError(`Error: ${event.error}`);
          }
          setIsListening(false);
        };

        recognition.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          setTranscript(text);
          const result = parseVoiceInput(text);
          onResult(result);
        };

        recognitionRef.current = recognition;
      } else {
        setError("Voice not supported in this browser");
      }
    }
  }, [onResult]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError("Browser not supported");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setError(null);
      setTranscript("");
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error("Failed to start recognition", e);
      }
    }
  }, [isListening]);

  return {
    isListening,
    toggleListening,
    error,
    transcript,
    supported: !!recognitionRef.current,
  };
}
