import React from "react";
import { render, act, waitFor } from "@testing-library/react";
import CameraView from "../CameraView.js";
import { useUserSettings } from "../../store/userSettings.js";

beforeEach(() => {
  // Reset store
  const s = useUserSettings.getState();
  s.setPreferredCamera(undefined, undefined as any, true);
});

test("preferredCameraId is not cleared when the selected camera is unavailable (fallback to default)", async () => {
  const deviceId = "usb-123";
  const label = "USB Camera";
  const store = useUserSettings.getState();
  // Set user-selected camera
  store.setPreferredCamera(deviceId, label, true);

  // Mock available devices to only include the built-in laptop camera
  (navigator.mediaDevices as any).enumerateDevices = async () => [
    { deviceId: "default", kind: "videoinput", label: "Built-in Camera" },
  ];

  // Render CameraView and attempt to start camera
  const { container } = render((<CameraView />) as any);

  // Dispatch start-camera event to instruct CameraTile/CameraView to start
  act(() => {
    window.dispatchEvent(
      new CustomEvent("ndn:start-camera", { detail: { mode: "local" } }),
    );
  });
  await waitFor(() =>
    expect(useUserSettings.getState().preferredCameraId).toBe(deviceId),
  );

  expect(useUserSettings.getState().preferredCameraId).toBe(deviceId);
  expect(useUserSettings.getState().preferredCameraLabel).toBe(label);
});
