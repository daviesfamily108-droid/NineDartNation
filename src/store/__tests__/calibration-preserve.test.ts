import { describe, it, expect, beforeEach } from "vitest";

// Stub zustand persistence for store unit tests
vi.doMock("zustand/middleware", async () => {
  const actual = await vi.importActual<any>("zustand/middleware");
  return {
    ...actual,
    persist: (config: any) => config,
    createJSONStorage: () => ({
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    }),
  };
});

describe("calibration preserve on camera change", () => {
  let useCalibration: any;
  let useUserSettings: any;

  beforeEach(async () => {
    // Import stores after persistence has been mocked
    const calibModule = await vi.importActual("../calibration");
    const userModule = await vi.importActual("../userSettings");
    useCalibration = calibModule.useCalibration;
    useUserSettings = userModule.useUserSettings;
    // Reset stores to defaults
    useCalibration.setState?.({ H: null, cameraId: "cam1", locked: true });
    useUserSettings.setState?.({ preserveCalibrationOnCameraChange: true });
  });

  it("ignores auto-updates that change cameraId when preserve is enabled and calibration is locked", () => {
    const prev = useCalibration.getState();
    useCalibration.getState().setCalibration({
      H: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      cameraId: "cam2",
      locked: true,
    });
    const cur = useCalibration.getState();
    // cameraId should remain the original cam1 because preserve flag was set
    expect(cur.cameraId).toBe(prev.cameraId);
    expect(cur.H).toBe(prev.H);
  });

  it("allows camera updates when preserve is disabled", () => {
    useUserSettings.setState?.({ preserveCalibrationOnCameraChange: false });
    useCalibration.getState().setCalibration({
      H: [2, 0, 0, 0, 2, 0, 0, 0, 1],
      cameraId: "cam2",
      locked: true,
    });
    const cur = useCalibration.getState();
    expect(cur.cameraId).toBe("cam2");
    expect(cur.H).not.toBeNull();
  });
});
