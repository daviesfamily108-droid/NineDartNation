import React, { useEffect, useState } from "react";

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any | null>(null);

  useEffect(() => {
    try {
      const handler = (e: any) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };
      window.addEventListener("beforeinstallprompt", handler as EventListener);
      return () =>
        window.removeEventListener(
          "beforeinstallprompt",
          handler as EventListener,
        );
    } catch (e) {
      // ignore when running in SSR or test environment
    }
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) {
      // No PWA install available; instruct user to use native Add to Home Screen
      alert(
        'Open this site in your browser and use "Add to Home Screen" from the share menu (iOS) or use the browser install prompt (Android/Chrome).',
      );
      return;
    }
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome === "accepted") {
        setDeferredPrompt(null);
      }
    } catch (e) {
      console.warn("install failed", e);
    }
  }

  // Hide the button when not available
  if (!deferredPrompt) return null;
  return (
    <button
      className="rounded bg-violet-600 text-white px-2 py-1"
      onClick={() => handleInstall()}
    >
      Install App
    </button>
  );
}
