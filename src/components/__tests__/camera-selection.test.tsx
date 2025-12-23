import React from "react";
import { render, cleanup } from "@testing-library/react";
import OfflinePlay from "../OfflinePlay";
import { useUserSettings } from "../../store/userSettings";

afterEach(() => {
  cleanup();
});

test("preferred camera persists when entering a game/OfflinePlay mount", async () => {
  const id = "preferred-camera-123";
  const label = "User Camera";
  const getState = useUserSettings.getState();
  // Set preferred camera in store as if selected by user
  getState.setPreferredCamera(id, label, true);

  // Mount OfflinePlay component (simulate entering a game)
  const { unmount } = render(<OfflinePlay user={null} />);

  // Ensure userSettings still holds the preferred camera id
  expect(useUserSettings.getState().preferredCameraId).toBe(id);
  expect(useUserSettings.getState().preferredCameraLabel).toBe(label);

  // Clean up
  unmount();
});
