import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
// Mobile-only overrides loaded after the main stylesheet to strongly
// restyle the app on small screens without touching desktop styles.
import "./styles/mobile-overrides.css";
import App from "./App.js";
import ResetPassword from "./components/ResetPassword.js";
import { WSProvider } from "./components/WSProvider.js";
import ErrorBoundary from "./components/ErrorBoundary.js";
import { installApiInterceptor } from "./utils/api.js";
import { setupInstallPromptHooks } from "./utils/installPrompt.js";
import { installQuietConsole } from "./utils/quietConsole.js";

// In some hosting setups, third-party or legacy code may expect a global React.
// This ensures `React` is available at runtime to prevent 'React is not defined' errors.
try {
  (window as any).React = (window as any).React || {};
} catch (e) {}

installApiInterceptor();
setupInstallPromptHooks();
installQuietConsole();

// Clear stale-chunk reload flag on successful startup so future deploys
// can trigger a fresh reload if needed.
try {
  sessionStorage.removeItem("ndn_chunk_reload");
} catch {}

// Temporary global error collector (diagnostic only).
// Purpose: capture initialization/runtime errors (like the reported "Cannot access 'Ns' before initialization")
// and make it easy for a developer or QA to copy the full stack to clipboard.
// Remove this block once diagnostics are complete.
try {
  let __ndn_last_error: any = null;

  const __ndn_capture_and_clip = (errInfo: any) => {
    try {
      __ndn_last_error = errInfo;
      // Log clearly so it's easy to find in console output
      console.error("[NDN ErrorCollector] Captured error:", errInfo);
      // Try to copy to clipboard for fast paste into issues. Not guaranteed
      // to succeed (clipboard permissions), but we attempt it.
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        try {
          const text =
            typeof errInfo === "string"
              ? errInfo
              : JSON.stringify(errInfo, null, 2);
          navigator.clipboard.writeText(text).then(
            () =>
              console.info("[NDN ErrorCollector] Error copied to clipboard"),
            () =>
              console.info("[NDN ErrorCollector] Could not copy to clipboard"),
          );
        } catch {
          // ignore clipboard errors
        }
      }
    } catch (e) {
      try {
        console.error("[NDN ErrorCollector] capture failed", e);
      } catch {}
    }
  };

  window.addEventListener(
    "error",
    (ev: any) => {
      try {
        const info = {
          message: ev?.message || (ev?.error && ev.error.message) || String(ev),
          filename: ev?.filename || null,
          lineno: ev?.lineno || null,
          colno: ev?.colno || null,
          stack: ev?.error?.stack || (ev?.error && String(ev.error)) || null,
          type: "error",
        };
        __ndn_capture_and_clip(info);
      } catch (e) {
        try {
          console.error("[NDN ErrorCollector] error handler failed", e);
        } catch {}
      }
    },
    true,
  );

  window.addEventListener("unhandledrejection", (ev: any) => {
    try {
      const reason = ev?.reason;
      const info = {
        message: reason?.message || String(reason) || "UnhandledRejection",
        stack: reason?.stack || null,
        type: "unhandledrejection",
      };
      __ndn_capture_and_clip(info);
    } catch (e) {
      try {
        console.error(
          "[NDN ErrorCollector] unhandledrejection handler failed",
          e,
        );
      } catch {}
    }
  });

  // Expose a helper to collect the last error programmatically from the console
  (window as any).__ndn_error_collector = {
    collect: async () => {
      try {
        if (!__ndn_last_error) return null;
        // Try to copy the last error again on demand
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          try {
            await navigator.clipboard.writeText(
              JSON.stringify(__ndn_last_error, null, 2),
            );
            console.info("[NDN ErrorCollector] Last error copied to clipboard");
          } catch {
            console.info(
              "[NDN ErrorCollector] Could not copy last error to clipboard",
            );
          }
        }
        return __ndn_last_error;
      } catch (e) {
        try {
          console.error("[NDN ErrorCollector] collect failed", e);
        } catch {}
        return null;
      }
    },
    last: () => __ndn_last_error,
  };
} catch (e) {
  // best-effort; do not break app startup if this diagnostic install fails
  try {
    console.warn("[NDN ErrorCollector] install failed", e);
  } catch {}
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <WSProvider>
        <Root />
      </WSProvider>
    </ErrorBoundary>
  </StrictMode>,
);

function Root() {
  const path = window.location.pathname;
  if (path === "/reset") return <ResetPassword />;
  return <App />;
}

/**
 * Service worker note
 *
 * A service worker can easily cause "Netlify isn't responding / new code not showing" symptoms
 * if an old worker is still controlling the page and serving cached HTML/JS.
 *
 * For now we keep SW *opt-in only* (debug/pwa testing) and disable it by default.
 *
 * Opt-in options:
 *  - add ?pwa=1 to the URL, or
 *  - set localStorage.NDN_ENABLE_PWA = "1"
 */
const enablePwaSw =
  new URLSearchParams(window.location.search).get("pwa") === "1" ||
  (typeof localStorage !== "undefined" &&
    localStorage.getItem("NDN_ENABLE_PWA") === "1");

if (
  enablePwaSw &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator
) {
  try {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.debug("[ServiceWorker] Registered", reg);
      })
      .catch((err) => {
        console.warn("[ServiceWorker] Registration failed", err);
      });
  } catch (e) {
    // ignore
  }
} else if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  // Safety: if a previous deployment had registered a SW, unregister it so updates always flow.
  // This prevents stale SW caches from masking new UI behavior.
  // We also provide a one-time opt-in force-reload mechanism via localStorage key
  // `NDN_FORCE_SW_RELOAD = "1"` for situations where a stale worker still controls the page.
  try {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      if (!regs || regs.length === 0) return;
      try {
        console.info(
          "[ServiceWorker] Found",
          regs.length,
          "registrations — unregistering to avoid stale caches",
        );
      } catch {}
      let anyActive = false;
      regs.forEach((r) => {
        try {
          if (r.active) anyActive = true;
        } catch {}
        try {
          r.unregister();
        } catch (e) {
          try {
            console.warn("[ServiceWorker] unregister failed:", e);
          } catch {}
        }
      });

      // If an active worker was present and the developer/user has set the force-reload flag,
      // reload once to ensure the browser requests the fresh HTML/JS from the server.
      try {
        const forceReload =
          typeof localStorage !== "undefined" &&
          localStorage.getItem("NDN_FORCE_SW_RELOAD") === "1";
        if (anyActive && forceReload) {
          try {
            console.info(
              "[ServiceWorker] Active worker removed; forcing page reload to fetch latest assets",
            );
            // Clear the flag so this only happens once
            localStorage.removeItem("NDN_FORCE_SW_RELOAD");
            // reload immediately — modern browsers will fetch fresh assets
            window.location.reload();
          } catch (e) {
            /* ignore reload errors */
          }
        }
      } catch (e) {
        /* ignore */
      }
    });
  } catch {
    // ignore
  }
}
