import React, { useState } from 'react';

/**
 * Small header pill that allows installing the PWA or linking to app store pages.
 * - Tries to prompt the PWA install if available
 * - Shows links to Play Store / App Store if configured via environment variables
 */
export default function InstallPicker() {
  const [open, setOpen] = useState(false);
  const playStore = (import.meta as any).env?.VITE_PLAY_STORE_URL || '';
  const appStore = (import.meta as any).env?.VITE_APP_STORE_URL || '';

  async function installPwa() {
    try {
      // Global promptInstallApp() is added to index.html and stores `beforeinstallprompt`
      if ((window as any).promptInstallApp) {
        const result = await (window as any).promptInstallApp();
        if (result) {
          // installed
        }
      } else if (navigator?.standalone || 'onappinstalled' in window) {
        // Already installed or installed via other prompt
        alert('App is already installed or your browser does not support programmatic install.');
      } else {
        alert('Install is not available for your browser. Try using the share menu (iOS) or the install prompt (Chrome/Edge on Android).');
      }
    } catch (e) {
      // ignore
    }
  }

  return (
    <div className="relative inline-block">
      <button
        className="px-2 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white flex items-center gap-2"
        onClick={() => setOpen((v) => !v)}
        title="Install or download app"
      >
        Install
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white/5 text-black card p-3 z-50">
          <div className="font-semibold mb-2">Install or Download</div>
          <div className="text-sm mb-2">
            Install the app as a Progressive Web App or install a native version if available
          </div>
          <div className="flex flex-col space-y-2">
            <button className="btn" onClick={installPwa}>Install (PWA)</button>
            {playStore ? (
              <a className="btn" target="_blank" rel="noreferrer" href={playStore}>Android (Google Play)</a>
            ) : (
              <div className="text-xs opacity-80">Android native build not provided</div>
            )}
            {appStore ? (
              <a className="btn" target="_blank" rel="noreferrer" href={appStore}>iOS (App Store)</a>
            ) : (
              <div className="text-xs opacity-80">iOS native build not provided</div>
            )}
            <div className="text-xs opacity-70">iOS: Use Safari &rarr; Share &rarr; "Add to Home Screen" to add this site to your home screen.</div>
          </div>
        </div>
      )}
    </div>
  );
}
