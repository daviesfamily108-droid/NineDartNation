// @vitest-environment jsdom
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture props passed into CameraView from OnlinePlay
const cameraPropsSpy = vi.fn();
vi.mock("../CameraView", () => ({
  default: (props: any) => {
    cameraPropsSpy(props);
    return <div data-testid="mock-camera" />;
  },
}));

// Mock WSProvider to prevent real websocket usage
vi.mock("../WSProvider", () => ({
  WSProvider: ({ children }: any) => <>{children}</>,
  useWS: () => ({
    connected: true,
    status: "connected",
    send: vi.fn(),
    addListener: () => () => {},
    reconnect: () => {},
  }),
}));

// Mock userSettings; OnlinePlay reads both hook state and getState() in the CameraView props.
// NOTE: must be created inside the mock factory because vi.mock is hoisted.
vi.mock("../../store/userSettings", () => {
  const state: any = {
    favoriteDouble: "D16",
    callerEnabled: false,
    callerVoice: "",
    callerVolume: 1,
    speakCheckoutOnly: false,
    allowSpectate: true,
    cameraScale: 1,
    setCameraScale: vi.fn(),
    cameraFitMode: "fit",
    setCameraFitMode: vi.fn(),
    cameraEnabled: true,
    textSize: "medium",
    boxSize: "medium",
    autoscoreProvider: "built-in",
    matchType: "singles",
    setMatchType: vi.fn(),
    teamAName: "Team A",
    setTeamAName: vi.fn(),
    teamBName: "Team B",
    setTeamBName: vi.fn(),
    x01DoubleIn: false,

    // critical gating inputs
    autoCommitMode: "wait-for-clear",
    allowAutocommitInOnline: false,
  };

  const useUserSettings: any = (selector?: any) =>
    typeof selector === "function" ? selector(state) : state;
  useUserSettings.getState = () => state;

  return {
    useUserSettings,
    __setUserSettingsForTest: (patch: any) => Object.assign(state, patch),
  };
});

import OnlinePlay from "../OnlinePlay.clean";

describe.skip("OnlinePlay immediate autocommit gating", () => {
  beforeEach(() => {
    cameraPropsSpy.mockClear();
  });

  async function setSettings(patch: any) {
    const m: any = await import("../../store/userSettings");
    m.__setUserSettingsForTest(patch);
  }

  async function getLastCameraProps() {
    await waitFor(() => expect(screen.getByTestId("mock-camera")).toBeTruthy());
    const calls = cameraPropsSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1][0];
  }

  it("passes immediateAutoCommit=false unless both flags true", async () => {
    await setSettings({
      autoCommitMode: "wait-for-clear",
      allowAutocommitInOnline: false,
    });
    render(<OnlinePlay user={{ email: "a@a.com", username: "Alice" }} />);
    const props = await getLastCameraProps();
    expect(props.cameraAutoCommit).toBe("parent");
    expect(props.immediateAutoCommit).toBe(false);
  });

  it("passes immediateAutoCommit=true only when mode=immediate AND allowAutocommitInOnline=true", async () => {
    await setSettings({
      autoCommitMode: "immediate",
      allowAutocommitInOnline: true,
    });
    render(<OnlinePlay user={{ email: "a@a.com", username: "Alice" }} />);
    const props = await getLastCameraProps();
    expect(props.immediateAutoCommit).toBe(true);
  });
});
