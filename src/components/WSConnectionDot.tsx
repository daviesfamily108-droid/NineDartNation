import React from "react";
import { useWS } from "./WSProvider";

type Props = {
  /** Optional extra classes for positioning. */
  className?: string;
  /** Tooltip text (defaults to Connected/Disconnected). */
  title?: string;
};

export default function WSConnectionDot({ className, title }: Props) {
  // If for some reason WSProvider isn't mounted, fail closed (show disconnected).
  let connected = false;
  try {
    connected = useWS().connected;
  } catch {
    connected = false;
  }

  const baseTitle = connected ? "Connected" : "Disconnected";

  return (
    <span
      aria-label={`Server connection: ${baseTitle}`}
      title={title || baseTitle}
      className={
        [
          "inline-flex items-center justify-center",
          "w-3 h-3 rounded-full",
          connected ? "bg-emerald-400" : "bg-red-500",
          "ring-2 ring-black/20",
          className || "",
        ].join(" ")
      }
    />
  );
}
