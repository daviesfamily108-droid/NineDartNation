import React from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import ThemeProvider, { useTheme } from "../ThemeProvider";

function ReadHtmlAttr() {
  const { theme, auto } = useTheme();
  return <div data-testid="state">{`${theme}|${auto}`}</div>;
}

describe("ThemeProvider", () => {
  it("applies seasonal theme in auto mode", () => {
    // Set system time to Oct 28 -> Halloween
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-10-28T12:00:00Z"));

    render(
      <ThemeProvider>
        <ReadHtmlAttr />
      </ThemeProvider>,
    );

    // document.documentElement should have data-theme="halloween"
    expect(document.documentElement.getAttribute("data-theme")).toBe(
      "halloween",
    );

    vi.useRealTimers();
  });

  it("removes data-theme when default selected", () => {
    // Ensure localStorage is available in this test environment
    if (
      !globalThis.localStorage ||
      typeof globalThis.localStorage.setItem !== "function"
    ) {
      // minimal mock
      // @ts-ignore
      globalThis.localStorage = {
        _store: {} as Record<string, string>,
        getItem(k: string) {
          return this._store[k] ?? null;
        },
        setItem(k: string, v: string) {
          this._store[k] = String(v);
        },
        removeItem(k: string) {
          delete this._store[k];
        },
      } as any;
    }

    render(
      <ThemeProvider>
        <ReadHtmlAttr />
      </ThemeProvider>,
    );

    // Set theme to default via localStorage and ensure the provider doesn't auto-season
    localStorage.setItem("ndn:theme", "default");
    localStorage.setItem("ndn:theme:auto", "false");

    // Re-mount to pick up persisted value
    render(
      <ThemeProvider>
        <ReadHtmlAttr />
      </ThemeProvider>,
    );

    expect(document.documentElement.getAttribute("data-theme")).toBe(null);
  });
});
