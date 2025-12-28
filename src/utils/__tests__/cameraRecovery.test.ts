import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../store/cameraSession", () => {
  const session: any = { mode: "local" };
  return {
    useCameraSession: { getState: () => session },
    __session: session,
  };
});

vi.mock("../../store/userSettings", () => {
  const settings: any = { preferredCameraLabel: undefined };
  return {
    useUserSettings: { getState: () => settings },
    __settings: settings,
  };
});

describe("dispatchCameraRecovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches ndn:camera-reset for local mode", async () => {
    const mod = await import("../cameraRecovery");
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    mod.dispatchCameraRecovery("user-click");

    expect(
      dispatchSpy.mock.calls.some((c) => (c[0] as any)?.type === "ndn:camera-reset"),
    ).toBe(true);
  });

  it("dispatches ndn:phone-camera-reconnect when phone selected", async () => {
    const mod = await import("../cameraRecovery");
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const us = await import("../../store/userSettings");
    (us as any).__settings.preferredCameraLabel = "Phone Camera";

    mod.dispatchCameraRecovery("user-click");

    expect(
      dispatchSpy.mock.calls.some(
        (c) => (c[0] as any)?.type === "ndn:phone-camera-reconnect",
      ),
    ).toBe(true);
  });
});
