import React, { useState, useEffect } from "react";

interface DartLoaderProps {
  calibrationComplete: boolean;
}

const DartLoader: React.FC<DartLoaderProps> = ({ calibrationComplete }) => {
  const [showTick, setShowTick] = useState(false);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    if (calibrationComplete) {
      setShowTick(true);
      setTimeout(() => setFade(true), 1200);
    } else {
      setShowTick(false);
      setFade(false);
    }
  }, [calibrationComplete]);

  return (
    <div
      className={`flex flex-col items-center justify-center w-full h-full transition-opacity duration-700 ${fade ? "opacity-0" : "opacity-100"}`}
      style={{
        pointerEvents: "none",
        position: "absolute",
        inset: 0,
        zIndex: 10,
      }}
    >
      <div className="flex items-center justify-center">
        <svg
          width="80"
          height="80"
          viewBox="0 0 80 80"
          className={`animate-spin-slow ${showTick ? "opacity-0" : "opacity-100"} transition-opacity duration-500`}
          style={{ transition: "opacity 0.5s" }}
        >
          {/* Dart graphic */}
          <g>
            <rect x="36" y="10" width="8" height="40" rx="3" fill="#a78bfa" />
            <polygon points="40,10 44,22 36,22" fill="#f472b6" />
            <rect x="36" y="50" width="8" height="18" rx="2" fill="#22d3ee" />
            <polygon points="36,68 44,68 40,78" fill="#10b981" />
          </g>
        </svg>
        {showTick && (
          <svg
            width="80"
            height="80"
            viewBox="0 0 80 80"
            className="absolute"
            style={{ left: 0, top: 0 }}
          >
            <circle
              cx="40"
              cy="40"
              r="32"
              fill="none"
              stroke="#10b981"
              strokeWidth="6"
            />
            <polyline
              points="28,44 38,54 54,30"
              fill="none"
              stroke="#10b981"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <div className="mt-4 text-lg font-semibold text-indigo-200">
        {showTick ? "Calibration Complete!" : "Initializing Camera..."}
      </div>
    </div>
  );
};

export default DartLoader;
