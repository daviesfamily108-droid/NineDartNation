import { describe, expect, it, beforeEach } from "vitest";
import { useCameraSession } from "../cameraSession";

// Minimal MediaStream-ish stub for our store; we only care that it is returned.
type FakeMediaStream = { id: string };

describe("cameraSession getMediaStream fallback", () => {
  beforeEach(() => {
    // Reset serializable state; also clears non-serializable holders
    useCameraSession.getState().clearSession();
  });

  it("returns holder stream when setMediaStream was called", () => {
    const fake = { id: "s1" } as unknown as MediaStream;
    useCameraSession.getState().setMediaStream(fake);
    expect(useCameraSession.getState().getMediaStream()).toBe(fake);
  });

  it("falls back to videoElementRef.srcObject when holder is null", () => {
    const fake = { id: "s2" } as unknown as MediaStream;

    // Set no holder stream
    useCameraSession.getState().setMediaStream(null);

    // Provide a fake video element that carries the stream on srcObject
    const video = {
      srcObject: fake,
      tagName: "VIDEO",
    } as unknown as HTMLVideoElement;
    useCameraSession.getState().setVideoElementRef(video);

    expect(useCameraSession.getState().getMediaStream()).toBe(fake);
  });
});
