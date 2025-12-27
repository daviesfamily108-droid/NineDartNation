// Lightweight app-wide event helpers
// Keep these names stable since multiple components dispatch/listen.

export const NDN_OPEN_NOTIFICATIONS_EVENT = "ndn:open-notifications" as const;

export function dispatchOpenNotifications() {
  try {
    window.dispatchEvent(new CustomEvent(NDN_OPEN_NOTIFICATIONS_EVENT));
  } catch {
    // ignore
  }
}
