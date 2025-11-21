import React from "react";

type Props = {
  status: "connecting" | "connected" | "disconnected";
  title?: string;
  size?: number; // pixels, defaults to 12
};

export default function StatusDot({ status, title, size = 12 }: Props) {
  const s = size;
  if (status === "connecting") {
    return (
      <span
        role="img"
        aria-label="Connecting"
        title={title || "Connecting…"}
        className="inline-flex items-center justify-center"
        style={{ width: s, height: s }}
      >
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          className="animate-spin"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="#A7F3D0"
            strokeWidth="3"
            fill="none"
            opacity="0.35"
          />
          <path
            d="M22 12a10 10 0 0 0-10-10"
            stroke="#34D399"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </span>
    );
  }
  if (status === "connected") {
    return (
      <span
        role="img"
        aria-label="Connected"
        title={title || "Connected"}
        className="inline-flex items-center justify-center"
        style={{ width: s, height: s }}
      >
        <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="#34D399" />
        </svg>
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label="Disconnected"
      title={title || "Not connected"}
      className="inline-flex items-center justify-center"
      style={{ width: s, height: s }}
    >
      <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#F87171" opacity="0.15" />
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="#F87171"
          strokeWidth="2"
          fill="none"
        />
        <rect x="6" y="11" width="12" height="2" rx="1" fill="#F87171" />
      </svg>
    </span>
  );
}
