// Test setup hooks for Vitest
// Provide a harmless global.fetch fallback for tests to avoid "Invalid URL" warnings
// when code calls fetch with a relative URL (Node's fetch requires an absolute URL).
// The mock is intentionally conservative: it returns a basic successful JSON response.
// Tests can override it with more specific behavior if needed.

// No-op body: if fetch exists, keep it. Otherwise add a minimal stub.
{
  // Wrap an existing fetch so we can prefix relative paths to avoid undici errors
  const originalFetch = (globalThis as any).fetch;
  (globalThis as any).fetch = async (input: any, init?: any) => {
    try {
      const url = String(input);
      // If input is a relative path (starts with /), avoid calling the real network in tests
      if (url.startsWith("/")) {
        // Return a safe stubbed response rather than invoking real network
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => "",
        };
      }
      if (originalFetch) return originalFetch(url, init);
    } catch {}
    // Fallback stubbed response
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    };
  };
}

// Setup jest DOM matchers
import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";

// Provide a small helper to globally silence noisy, known harmless warnings if desired
// (OPTIONAL) You can add additional filters or transforms here in the future.

// Mock react-focus-lock to a no-op in tests to avoid asynchronous focus management warnings
vi.mock("react-focus-lock", () => ({
  default: ({ children }: any) => React.createElement("div", null, children),
}));
