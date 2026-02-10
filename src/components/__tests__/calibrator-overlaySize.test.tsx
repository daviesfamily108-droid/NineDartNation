import React from "react";
import { render, fireEvent } from "@testing-library/react";
// Note: Do not import `useCalibration` here because the store persists to localStorage
// which may not be available in the test environment.

describe("Calibrator overlay size preservation", () => {
  afterEach(async () => {
    // Reset calibration store after each test if available
    try {
      const mod = await import("../../store/calibration.js");
      mod.useCalibration.getState().reset();
    } catch {
      // ignore
    }
  });

  test("sets overlaySize in store when calling setCalibration", async () => {
    // Ensure a basic localStorage exists for the persist middleware
    if (typeof window !== "undefined") {
      // If localStorage is missing or doesn't look correct, replace with a safe stub
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
        } as Storage;
      }
    }
    // Dynamically import the store after ensuring localStorage exists, then call the setter
    const { useCalibration } = await import("../../store/calibration.js");
    // Directly call the calibration setter in the store and validate overlaySize is persisted
    useCalibration
      .getState()
      .setCalibration({ overlaySize: { w: 800, h: 600 }, locked: true });
    const s = useCalibration.getState();
    expect(s.overlaySize).not.toBeNull();
    expect(s.overlaySize).toEqual({ w: 800, h: 600 });
  });
});
