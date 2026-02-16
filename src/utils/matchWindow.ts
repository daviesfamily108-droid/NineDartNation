import { writeMatchSnapshot } from "./matchSync.js";

function isMobileOrTablet(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
}

export function openMatchWindow() {
  if (typeof window === "undefined") return;
  // Skip popup window on mobile/tablet — they don't support window.open well
  // and the in-game UI renders inline via InGameShell instead.
  if (isMobileOrTablet()) return;
  try {
    writeMatchSnapshot();
  } catch {}
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("match", "1");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  } catch {}
}
