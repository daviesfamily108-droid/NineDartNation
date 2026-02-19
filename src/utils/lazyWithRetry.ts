import React from "react";

/**
 * Wraps React.lazy with automatic retry + page reload on chunk load failure.
 *
 * After a deployment the old hashed JS chunks are replaced. Users whose
 * browser cached the previous index.html will try to fetch stale chunk
 * URLs that now 404, causing "Failed to fetch dynamically imported module".
 *
 * This helper retries the import once, and if it still fails it forces a
 * full page reload (which fetches the new index.html with correct hashes).
 * A sessionStorage flag prevents infinite reload loops.
 */
export default function lazyWithRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    importFn().catch((err: unknown) => {
      // Retry once — the network hiccup may have been transient
      return importFn().catch(() => {
        // Still failing — likely a stale chunk hash after deployment.
        // Force a full reload unless we already tried (prevent infinite loop).
        const key = "ndn_chunk_reload";
        const alreadyReloaded = sessionStorage.getItem(key);
        if (!alreadyReloaded) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
        }
        // If we already reloaded and it still fails, surface the original error
        throw err;
      });
    }),
  );
}
