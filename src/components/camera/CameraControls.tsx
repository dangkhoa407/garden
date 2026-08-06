"use client";

import { useState } from "react";

interface CameraControlsProps {
  nightVision: boolean;
  onToggleNightVision: (enabled: boolean) => void;
}

export function CameraControls({
  nightVision,
  onToggleNightVision,
}: CameraControlsProps) {
  const [selectedCam, setSelectedCam] = useState("cam-04");
  const [isRecording, setIsRecording] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCapturePhoto = () => {
    showToast("Đã chụp ảnh màn hình và lưu vào thư viện!");
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      setIsRecording(false);
      showToast("Đã dừng và lưu video quan sát!");
    } else {
      setIsRecording(true);
      showToast("Đang ghi hình video...");
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl p-md tech-shadow flex flex-col gap-md border border-outline-variant/20 h-full">
      <h3 className="font-headline-md text-headline-md font-bold text-on-surface border-b border-outline-variant/20 pb-3">
        Điều khiển Camera
      </h3>

      {/* Select Camera Channel */}
      <div>
        <label className="block font-label-caps text-label-caps text-on-surface-variant mb-2">
          CHỌN KÊNH CAMERA
        </label>
        <select
          value={selectedCam}
          onChange={(e) => setSelectedCam(e.target.value)}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-body-sm font-body-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
        >
          <option value="cam-01">Camera 01 - Khu vực Rễ & Dinh dưỡng</option>
          <option value="cam-02">Camera 02 - Khay Thủy canh Tầng 1</option>
          <option value="cam-03">Camera 03 - Hệ thống Đèn LED Tầng 2</option>
          <option value="cam-04">Camera 04 - Tổng quan Khu nhà kính</option>
        </select>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-sm mt-2">
        <button
          onClick={handleCapturePhoto}
          className="w-full bg-primary text-on-primary font-body-lg text-body-sm font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-primary-container transition-all shadow-sm active:scale-95"
        >
          <span className="material-symbols-outlined">photo_camera</span>
          Chụp ảnh nhanh
        </button>

        <button
          onClick={handleToggleRecord}
          className={`w-full border-2 font-body-lg text-body-sm font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 ${
            isRecording
              ? "bg-error text-on-error border-error animate-pulse"
              : "border-secondary text-secondary hover:bg-secondary/10"
          }`}
        >
          <span className="material-symbols-outlined">
            {isRecording ? "stop_circle" : "videocam"}
          </span>
          {isRecording ? "Đang quay... (Bấm để dừng)" : "Quay video ghi hình"}
        </button>
      </div>

      {/* Night vision toggle */}
      <div className="mt-auto border-t border-outline-variant/20 pt-4 flex items-center justify-between">
        <div>
          <p className="font-body-lg text-body-sm font-semibold text-on-surface">
            Chế độ Hồng ngoại
          </p>
          <p className="font-body-sm text-xs text-on-surface-variant">
            Tự động bật Night Vision ban đêm
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={nightVision}
            onChange={(e) => onToggleNightVision(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
        </label>
      </div>

      {toast && (
        <div className="p-3 bg-inverse-surface text-inverse-on-surface text-xs rounded-xl flex items-center gap-2 mt-2 font-medium">
          <span className="material-symbols-outlined text-primary-fixed text-sm">info</span>
          {toast}
        </div>
      )}
    </div>
  );
}
