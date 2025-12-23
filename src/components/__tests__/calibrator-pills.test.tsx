import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { expect, it, describe, beforeAll } from "vitest";

beforeAll(() => {
  if (typeof window !== "undefined") {
    const bad = (v: any) => typeof v !== "function";
    if (
      typeof (window as any).localStorage === "undefined" ||
      bad((window as any).localStorage.setItem)
    ) {
      (window as any).localStorage = {
        _store: {} as Record<string, string>,
        getItem: function (k: string) {
          return Object.prototype.hasOwnProperty.call(this._store, k)
            ? this._store[k]
            : null;
        },
        setItem: function (k: string, v: string) {
          this._store[k] = String(v);
        },
        removeItem: function (k: string) {
          delete this._store[k];
        },
        clear: function () {
          for (const k of Object.keys(this._store)) delete this._store[k];
        },
        key: function (i: number) {
          return Object.keys(this._store)[i] || null;
        },
        get length() {
          return Object.keys(this._store).length;
        },
      } as any;
    }
  }
});

describe("Calibrator mode pills", () => {
  it("clicking the mode pills updates mode and localStorage", async () => {
    const { default: Calibrator } = await import("../Calibrator");
    const r = render(<Calibrator />);
    const localBtn = r.getByTestId("mode-local");
    const phoneBtn = r.getByTestId("mode-phone");
    const wifiBtn = r.getByTestId("mode-wifi");
    expect(localBtn).toBeTruthy();
    expect(phoneBtn).toBeTruthy();
    expect(wifiBtn).toBeTruthy();

    // Start with local
    fireEvent.click(localBtn);
    expect(localStorage.getItem("ndn:cal:mode")).toBe("local");

    fireEvent.click(phoneBtn);
    expect(localStorage.getItem("ndn:cal:mode")).toBe("phone");

    fireEvent.click(wifiBtn);
    expect(localStorage.getItem("ndn:cal:mode")).toBe("wifi");
  });
});
