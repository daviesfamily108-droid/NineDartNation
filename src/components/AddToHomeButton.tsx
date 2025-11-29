import React, { useState, useEffect } from 'react';

export default function AddToHomeButton() {
  const [available, setAvailable] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    try {
      const handler = (e: any) => {
        e.preventDefault();
        (window as any).deferredInstallPrompt = e;
        setAvailable(true);
      };
      window.addEventListener('beforeinstallprompt', handler as any);
      // if there is an existing prompt saved by global handler in index.html
      if ((window as any).deferredInstallPrompt) setAvailable(true);
      return () => window.removeEventListener('beforeinstallprompt', handler as any);
    } catch (e) {
      // nothing
    }
  }, []);

  async function handleClick() {
    try {
      if ((window as any).promptInstallApp) {
        const ok = await (window as any).promptInstallApp();
        if (!ok) setShowInstructions(true);
      } else if ((window as any).deferredInstallPrompt) {
        // fallback (should call promptInstallApp already, but just in case)
        const p = (window as any).deferredInstallPrompt;
        p.prompt();
        const choice = await p.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setAvailable(false);
        } else setShowInstructions(true);
      } else {
        setShowInstructions(true);
      }
    } catch (e) {
      setShowInstructions(true);
    }
  }

  function iosInstructions(): string {
    return 'Open Safari &rarr; Tap the share button &rarr; "Add to Home Screen".';
  }

  if (showInstructions) {
    return (
      <div className="relative inline-block">
        <button onClick={() => setShowInstructions(false)} className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-sm">
          Close
        </button>
        <div className="text-sm p-2 mt-1 text-black card">{isIos() ? iosInstructions() : 'Use your browser "Install" menu or the share button (iOS) to add to home screen.'}</div>
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="px-2 py-1 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
      title="Add to Home Screen"
    >
      Add to Home Screen
    </button>
  );
}

function isIos() {
  try {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  } catch (e) {
    return false;
  }
}
