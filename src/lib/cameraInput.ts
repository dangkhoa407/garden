export const CAMERA_INPUT_STORAGE_KEY = "growhub:selected-camera-input";
export const CAMERA_INPUT_CHANGED_EVENT = "growhub:camera-input-changed";

export interface SavedCameraInput {
  deviceId: string;
  label: string;
}

export interface CameraStreamResult {
  stream: MediaStream;
  requestedInput: SavedCameraInput | null;
  usedSavedInput: boolean;
}

export function readSavedCameraInput(): SavedCameraInput | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CAMERA_INPUT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedCameraInput>;
    if (typeof parsed.deviceId !== "string" || !parsed.deviceId) return null;

    return {
      deviceId: parsed.deviceId,
      label: typeof parsed.label === "string" ? parsed.label : "",
    };
  } catch {
    return null;
  }
}

export function saveCameraInput(input: SavedCameraInput | null) {
  if (typeof window === "undefined") return;

  if (!input || !input.deviceId) {
    window.localStorage.removeItem(CAMERA_INPUT_STORAGE_KEY);
  } else {
    window.localStorage.setItem(CAMERA_INPUT_STORAGE_KEY, JSON.stringify(input));
  }

  window.dispatchEvent(new CustomEvent(CAMERA_INPUT_CHANGED_EVENT));
}

function withDeviceId(
  baseVideo: MediaTrackConstraints,
  input: SavedCameraInput | null
): MediaTrackConstraints {
  if (!input?.deviceId) return baseVideo;
  return {
    ...baseVideo,
    deviceId: { exact: input.deviceId },
  };
}

export async function getCameraStreamWithSavedInput(
  baseVideo: MediaTrackConstraints
): Promise<CameraStreamResult> {
  const requestedInput = readSavedCameraInput();

  if (requestedInput?.deviceId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: withDeviceId(baseVideo, requestedInput),
      });
      return { stream, requestedInput, usedSavedInput: true };
    } catch (err) {
      const errorName = err instanceof DOMException ? err.name : "";
      if (!["OverconstrainedError", "NotFoundError", "NotReadableError"].includes(errorName)) {
        throw err;
      }
    }
  }

  const stream = await navigator.mediaDevices.getUserMedia({ video: baseVideo });
  return { stream, requestedInput, usedSavedInput: false };
}
