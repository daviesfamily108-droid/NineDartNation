export const NDN_CAMERA_RECOVERY_EVENT = "ndn:camera-recovery" as const;

export type CameraRecoveryUiDetail = {
  reason: string;
  ts: number;
};

export function dispatchCameraRecoveryUi(detail: CameraRecoveryUiDetail) {
  window.dispatchEvent(new CustomEvent(NDN_CAMERA_RECOVERY_EVENT, { detail }));
}
