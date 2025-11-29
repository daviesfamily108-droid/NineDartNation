import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import ResetPassword from "./components/ResetPassword";
import { WSProvider } from "./components/WSProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import { installApiInterceptor } from "./utils/api";

// In some hosting setups, third-party or legacy code may expect a global React.
// This ensures `React` is available at runtime to prevent 'React is not defined' errors.
try {
  (window as any).React = (window as any).React || {};
} catch (e) {}

installApiInterceptor();

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

// Register service worker to enable PWA install & offline capability when available
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // eslint-disable-next-line no-console
        console.debug('[ServiceWorker] Registered', reg);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[ServiceWorker] Registration failed', err);
      });
  } catch (e) {
    // ignore
  }
}
