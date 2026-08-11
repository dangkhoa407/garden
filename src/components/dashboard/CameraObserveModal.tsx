"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plant } from "@/lib/data";

interface CameraObserveModalProps {
  plant: Plant;
  isOpen: boolean;
  onClose: () => void;
}

export function CameraObserveModal({
  plant,
  isOpen,
  onClose,
}: CameraObserveModalProps) {
  const [mounted, setMounted] = useState(false);
  const [imgTime, setImgTime] = useState(Date.now());
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto refresh image every 3 seconds while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setImgTime(Date.now());
    }, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleRefreshSnapshot = async () => {
    setSnapshotLoading(true);
    try {
      await fetch("/api/camera/test", { method: "POST" });
    } catch (e) {}
    setImgTime(Date.now());
    setSnapshotLoading(false);
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-surface rounded-3xl p-6 max-w-3xl w-full shadow-2xl border border-outline-variant/30 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-outline-variant/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-2xl">visibility</span>
            </div>
            <div>
              <h3 className="font-bold text-base text-on-surface flex items-center gap-2">
                Quan Sát Camera Trực Tiếp
              </h3>
              <p className="text-xs text-on-surface-variant font-mono">
                🌱 {plant.name} • Vị trí: <span className="font-bold text-sky-600 dark:text-sky-400">{plant.location || "Khay 01"}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-primary p-1.5 rounded-xl hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Camera View Window */}
        <div className="relative rounded-2xl overflow-hidden bg-black/90 border border-outline-variant/40 aspect-video flex items-center justify-center group shadow-inner">
          <img
            src={`/api/camera/image?t=${imgTime}`}
            alt={`Camera view ${plant.name}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/api/camera/image";
            }}
          />

          {/* Overlay HUD */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="px-2.5 py-1 bg-red-600/90 text-white text-[11px] font-mono font-bold rounded-lg flex items-center gap-1.5 backdrop-blur-md animate-pulse">
              <span className="w-2 h-2 rounded-full bg-white"></span>
              LIVE STREAM
            </span>
            <span className="px-2.5 py-1 bg-black/60 text-white text-[11px] font-mono rounded-lg backdrop-blur-md border border-white/10">
              📍 {plant.location || "Khay 01"}
            </span>
          </div>

          <div className="absolute bottom-3 right-3 text-white/70 text-[10px] font-mono bg-black/70 px-2 py-1 rounded-md backdrop-blur-xs">
            USB Camera 1080P • Auto-Refresh 3s
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center pt-2">
          <button
            type="button"
            onClick={handleRefreshSnapshot}
            disabled={snapshotLoading}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200/80 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-base ${snapshotLoading ? "animate-spin" : ""}`}>
              refresh
            </span>
            Chụp lại ảnh ngay
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-xs"
          >
            Đóng Camera
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
