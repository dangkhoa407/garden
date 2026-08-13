"use client";

import { useEffect, useState } from "react";
import {
  CAMERA_INPUT_CHANGED_EVENT,
  readSavedCameraInput,
  saveCameraInput,
} from "@/lib/cameraInput";

interface CameraInputSelectProps {
  onChanged?: () => void;
}

export function CameraInputSelect({ onChanged }: CameraInputSelectProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(allDevices.filter((device) => device.kind === "videoinput"));
      setSelectedDeviceId(readSavedCameraInput()?.deviceId || "");
    } catch {
      setDevices([]);
    }
  };

  useEffect(() => {
    void refreshDevices();

    const handleExternalChange = () => {
      setSelectedDeviceId(readSavedCameraInput()?.deviceId || "");
      void refreshDevices();
    };

    window.addEventListener(CAMERA_INPUT_CHANGED_EVENT, handleExternalChange);
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);

    return () => {
      window.removeEventListener(CAMERA_INPUT_CHANGED_EVENT, handleExternalChange);
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
    };
  }, []);

  const handleChange = (deviceId: string) => {
    const device = devices.find((item) => item.deviceId === deviceId);
    setSelectedDeviceId(deviceId);
    saveCameraInput(
      deviceId
        ? {
            deviceId,
            label: device?.label || "Camera da chon",
          }
        : null
    );
    onChanged?.();
  };

  return (
    <div>
      <label className="block font-label-caps text-label-caps text-on-surface-variant mb-2">
        NGUON CAMERA INPUT
      </label>
      <select
        value={selectedDeviceId}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-body-sm font-body-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
      >
        <option value="">Camera mac dinh cua trinh duyet</option>
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Camera ${index + 1}`}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-[11px] text-on-surface-variant">
        Lua chon nay duoc luu lai va dung chung cho tat ca man hinh can camera.
      </p>
    </div>
  );
}
