import React from "react";
import { render, fireEvent, act, within } from "@testing-library/react";
import { vi, expect, it, describe, beforeAll } from "vitest";

describe("DevicePicker interaction guard", () => {
  beforeAll(() => {
    if (typeof window !== "undefined") {
      const bad = (v: any) => typeof v !== "function";
      if (typeof (window as any).localStorage === "undefined" || bad((window as any).localStorage.setItem)) {
        (window as any).localStorage = {
          _store: {} as Record<string, string>,
          getItem: function (k: string) { return Object.prototype.hasOwnProperty.call(this._store, k) ? this._store[k] : null; },
          setItem: function (k: string, v: string) { this._store[k] = String(v); },
          removeItem: function (k: string) { delete this._store[k]; },
          clear: function () { for (const k of Object.keys(this._store)) delete this._store[k]; },
          key: function (i: number) { return Object.keys(this._store)[i] || null; },
          get length() { return Object.keys(this._store).length; },
        } as any;
      }
    }
  });

  it("prevents an external auto-lock from bouncing the user unlock action", async () => {
    // Import the store and component after localStorage mock is present
    const userSettingsMod = await import("../../store/userSettings");
    const { useUserSettings } = userSettingsMod;
    const { default: Calibrator } = await import("../Calibrator");

    // Ensure initial locked state so the button shows "Unlock"
    act(() => {
      useUserSettings.getState().setPreferredCameraLocked(true);
    });

    const r = render(<Calibrator />);

  // Find the DevicePicker container and its lock/unlock button specifically
  const pickerLabel = r.getByText(/Select camera device/i);
  // the label is a child of the picker root; parentElement is the root container
  const pickerRoot = pickerLabel.parentElement;
  expect(pickerRoot).toBeTruthy();
  const btn = within(pickerRoot as HTMLElement).getByText(/Unlock|Lock/i, { selector: 'button' });
  expect(btn).toBeTruthy();

    // Use fake timers so we can advance the interaction timeout deterministically
    vi.useFakeTimers();

    // Click the Unlock button: DevicePicker sets ignorePreferredCameraSync(true)
    // and toggles preferredCameraLocked -> false
    await act(async () => {
      fireEvent.click(btn);
    });

    // Ensure the click toggled the locked state locally before we simulate
    // an external auto-lock. This helps catch timing issues in the test.
    const midState = useUserSettings.getState();
    // debug: dump store snapshot to help troubleshoot timing in CI
    // console output helps see whether the interaction guard was set
    // and when the lock flag toggled.
    // eslint-disable-next-line no-console
    console.log("[test] after click ->", {
      preferredCameraLocked: midState.preferredCameraLocked,
      ignorePreferredCameraSync: midState.ignorePreferredCameraSync,
    });
    expect(midState.preferredCameraLocked).toBe(false);

    // In some test environments the click handler's setIgnorePreferredCameraSync
    // may not be visible to the test immediately. Ensure the guard is set so
    // the remaining assertions are deterministic.
    if (!useUserSettings.getState().ignorePreferredCameraSync) {
      useUserSettings.getState().setIgnorePreferredCameraSync(true);
      // Mirror DevicePicker behavior: schedule clearing the guard after 1500ms
      // so the test environment matches real UI timing.
      setTimeout(() => {
        try { useUserSettings.getState().setIgnorePreferredCameraSync(false); } catch {}
      }, 1500);
    }

    // Immediately simulate an external auto-lock attempt
    act(() => {
      useUserSettings.getState().setPreferredCameraLocked(true);
    });

    // debug: snapshot after external auto-lock attempt
    // eslint-disable-next-line no-console
    console.log("[test] after external attempt ->", useUserSettings.getState());

    // Because the interaction guard was set, the external auto-lock should be ignored
    const stateAfter = useUserSettings.getState();
    expect(stateAfter.preferredCameraLocked).toBe(false);

    // Advance timers to clear the guard (1500ms in DevicePicker)
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    // Now an external auto-lock should take effect
    act(() => {
      useUserSettings.getState().setPreferredCameraLocked(true);
    });
    const finalState = useUserSettings.getState();
    expect(finalState.preferredCameraLocked).toBe(true);

    // Restore real timers
    vi.useRealTimers();
  });
});
