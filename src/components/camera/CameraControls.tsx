"use client";

import { useState } from "react";
import { CameraInputSelect } from "./CameraInputSelect";

interface CameraControlsProps {
  nightVision: boolean;
  onToggleNightVision: (enabled: boolean) => void;
}

export function CameraControls({
  nightVision,
  onToggleNightVision,
}: CameraControlsProps) {
  const [capturing, setCapturing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleCapturePhoto = async () => {
    setCapturing(true);
    try {
      const res = await fetch("/api/camera/snapshot", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`📸 Chụp thành công! Đã cập nhật khung hình.`);
      } else {
        showToast(`⚠️ ${data.error || "Lỗi chụp ảnh"}`);
      }
    } catch {
      showToast("❌ Không thể kết nối server");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl p-md tech-shadow flex flex-col gap-md border border-outline-variant/20 h-full">
      <h3 className="font-headline-md text-headline-md font-bold text-on-surface border-b border-outline-variant/20 pb-3">
        Điều khiển Camera
      </h3>

      {/* Chọn nguồn camera để xem (real browser devices) */}
      <CameraInputSelect />

      {/* Chụp ảnh */}
      <button
        onClick={handleCapturePhoto}
        disabled={capturing}
        className="w-full bg-primary text-on-primary font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-primary-container transition-all shadow-sm active:scale-95 disabled:opacity-50 text-body-sm"
      >
        <span className={`material-symbols-outlined ${capturing ? "animate-spin" : ""}`}>
          {capturing ? "progress_activity" : "photo_camera"}
        </span>
        {capturing ? "Đang chụp..." : "Chụp ảnh thực tế"}
      </button>

      {/* Night vision */}
      <div className="mt-auto border-t border-outline-variant/20 pt-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-on-surface text-body-sm">Hồng ngoại</p>
          <p className="text-xs text-on-surface-variant">IR ban đêm</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={nightVision}
            onChange={(e) => {
              onToggleNightVision(e.target.checked);
              fetch("/api/camera/night-vision", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: e.target.checked }),
              }).catch(() => {});
            }}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
        </label>
      </div>

      {toast && (
        <div className="p-2.5 bg-inverse-surface text-inverse-on-surface text-xs rounded-xl flex items-center gap-2 font-medium animate-fadeIn">
          <span className="material-symbols-outlined text-primary-fixed text-sm">info</span>
          {toast}
        </div>
      )}
    </div>
  );
}
