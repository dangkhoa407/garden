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
  const [selectedCam, setSelectedCam] = useState("cam-usb-01");
  const [isRecording, setIsRecording] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleCapturePhoto = async () => {
    setCapturing(true);
    showToast("Đang gửi lệnh chụp ảnh tới USB Camera (/dev/video0)...");

    try {
      const res = await fetch("/api/camera/snapshot", {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast(`📸 Chụp thành công lúc ${data.timestamp || "ngay bây giờ"}! Đã cập nhật khung hình.`);
      } else {
        showToast(`⚠️ Lỗi chụp ảnh: ${data.error || data.message || "Không phản hồi"}`);
      }
    } catch (err: any) {
      showToast(`❌ Lỗi kết nối: Không thể gửi lệnh tới Backend Server`);
    } finally {
      setCapturing(false);
    }
  };

  const handleToggleNightVisionMode = async (enabled: boolean) => {
    onToggleNightVision(enabled);
    try {
      await fetch("/api/camera/night-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      showToast(`Chế độ Hồng ngoại Night Vision: ${enabled ? "BẬT (Bão hòa IR)" : "TẮT (Giao diện chuẩn)"}`);
    } catch (err) {
      showToast("Lỗi gửi lệnh Hồng ngoại tới Camera");
    }
  };

  const handleToggleRecord = () => {
    if (isRecording) {
      setIsRecording(false);
      showToast("Đã dừng và lưu video quan sát!");
    } else {
      setIsRecording(true);
      showToast("Đang ghi hình video quan sát...");
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl p-md tech-shadow flex flex-col gap-md border border-outline-variant/20 h-full">
      <h3 className="font-headline-md text-headline-md font-bold text-on-surface border-b border-outline-variant/20 pb-3">
        Điều khiển Camera USB
      </h3>

      {/* Select Camera Channel */}
      <div>
        <label className="block font-label-caps text-label-caps text-on-surface-variant mb-2">
          CHỌN KÊNH CAMERA THỰC TẾ
        </label>
        <select
          value={selectedCam}
          onChange={(e) => setSelectedCam(e.target.value)}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-body-sm font-body-sm text-on-surface focus:ring-1 focus:ring-primary focus:outline-none"
        >
          <option value="cam-usb-01">Camera USB 01 - /dev/video0 (Trực tiếp)</option>
          <option value="cam-02">Camera 02 - Khay Thủy canh Tầng 1 (Dự phòng)</option>
          <option value="cam-03">Camera 03 - Hệ thống Đèn LED Tầng 2 (Dự phòng)</option>
        </select>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-sm mt-2">
        <button
          onClick={handleCapturePhoto}
          disabled={capturing}
          className="w-full bg-primary text-on-primary font-body-lg text-body-sm font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-primary-container transition-all shadow-sm active:scale-95 disabled:opacity-50"
        >
          <span className={`material-symbols-outlined ${capturing ? "animate-spin" : ""}`}>
            {capturing ? "progress_activity" : "photo_camera"}
          </span>
          {capturing ? "Đang mở camera chụp..." : "Chụp ảnh thực tế ngay"}
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
            Điều chỉnh độ sáng/độ tương phản IR ban đêm
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={nightVision}
            onChange={(e) => handleToggleNightVisionMode(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
        </label>
      </div>

      {toast && (
        <div className="p-3 bg-inverse-surface text-inverse-on-surface text-xs rounded-xl flex items-center gap-2 mt-2 font-medium animate-fadeIn">
          <span className="material-symbols-outlined text-primary-fixed text-sm">info</span>
          {toast}
        </div>
      )}
    </div>
  );
}
