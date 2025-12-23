declare global {
  interface Window {
    deferredInstallPrompt: any;
    promptInstallApp?: () => Promise<boolean>;
  }
}

export function setupInstallPromptHooks() {
  if (typeof window === "undefined") return;
  try {
    window.deferredInstallPrompt = null;
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      window.deferredInstallPrompt = event;
    });
    window.promptInstallApp = async () => {
      try {
        const promptEvent = window.deferredInstallPrompt;
        if (!promptEvent) return false;
        promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        return !!choice && choice.outcome === "accepted";
      } catch {
        return false;
      }
    };
  } catch (err) {
    // Silently log when running in development but avoid crashing production builds
    if ((import.meta as any)?.env?.DEV) {
      console.warn("[PWA] Failed to install installPrompt hooks", err);
    }
  }
}

export {}; // ensure this file is treated as a module
