import { writeMatchSnapshot } from "./matchSync";

export function openMatchWindow() {
  if (typeof window === "undefined") return;
  try {
    writeMatchSnapshot();
  } catch {}
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("match", "1");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  } catch {}
}
