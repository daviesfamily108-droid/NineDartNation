import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
// Mobile-only overrides loaded after the main stylesheet to strongly
// restyle the app on small screens without touching desktop styles.
import "./styles/mobile-overrides.css";
import App from "./App";
import ResetPassword from "./components/ResetPassword";
import { WSProvider } from "./components/WSProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import { installApiInterceptor } from "./utils/api";
import { setupInstallPromptHooks } from "./utils/installPrompt";
import { installQuietConsole } from "./utils/quietConsole";

// In some hosting setups, third-party or legacy code may expect a global React.
// This ensures `React` is available at runtime to prevent 'React is not defined' errors.
try {
  (window as any).React = (window as any).React || {};
} catch (e) {}

installApiInterceptor();
setupInstallPromptHooks();
installQuietConsole();

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
  try {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  } catch {
    // ignore
  }
}
