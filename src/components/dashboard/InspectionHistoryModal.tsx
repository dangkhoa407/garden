"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plant } from "@/lib/data";

export interface InspectionLogEntry {
  id: string;
  plantId?: string;
  type: "PEST" | "SPRAY" | "FERTILIZE";
  timestamp: string;
  title: string;
  detail: string;
  telegramCaption?: string;
  status?: string;
  image?: string;
  dosage?: string;
}

interface InspectionHistoryModalProps {
  plant: Plant;
  isOpen: boolean;
  onClose: () => void;
}

export function InspectionHistoryModal({
  plant,
  isOpen,
  onClose,
}: InspectionHistoryModalProps) {
  const [activeTab, setActiveTab] = useState<"PEST" | "SPRAY" | "FERTILIZE">("PEST");
  const [mounted, setMounted] = useState(false);
  const [logs, setLogs] = useState<InspectionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch real history from backend API (/api/inspection-history)
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inspection-history");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLogs(data);
          // Sync to localStorage as fallback cache
          localStorage.setItem(`plant_history_${plant.id}`, JSON.stringify(data));
          return;
        }
      }
    } catch (e) {
      console.error("Failed to fetch inspection history from server", e);
    } finally {
      setLoading(false);
    }

    // Fallback to local cache if offline
    const saved = localStorage.getItem(`plant_history_${plant.id}`);
    if (saved) {
      try {
        setLogs(JSON.parse(saved));
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, plant.id]);

  const handleDeleteLog = async (id: string) => {
    try {
      await fetch(`/api/inspection-history/${id}`, { method: "DELETE" });
    } catch (e) {}
    const updated = logs.filter((l) => l.id !== id);
    setLogs(updated);
    localStorage.setItem(`plant_history_${plant.id}`, JSON.stringify(updated));
  };

  const handleClearTabHistory = async () => {
    if (!confirm(`Bạn có chắc chắn muốn xóa toàn bộ lịch sử trong mục này?`)) return;
    try {
      await fetch(`/api/inspection-history?type=${activeTab}`, { method: "DELETE" });
    } catch (e) {}
    const updated = logs.filter((l) => l.type !== activeTab);
    setLogs(updated);
    localStorage.setItem(`plant_history_${plant.id}`, JSON.stringify(updated));
  };

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  if (!isOpen || !mounted) return null;

  const currentTabLogs = logs.filter((l) => {
    // 1. Tab type matching (PEST, SPRAY, FERTILIZE)
    const logType = l.type || "PEST";
    if (logType !== activeTab) return false;

    // 2. Direct plantId match
    if (l.plantId && l.plantId === plant.id) return true;

    // 3. Location and plant name matching
    const normPlantLoc = (plant.location || "").toLowerCase().trim(); // e.g. "khay 01"
    const normPlantName = (plant.name || "").toLowerCase().trim();

    // Extract tray number digits (e.g., "khay 01" -> "1")
    const trayMatch = normPlantLoc.match(/khay\s*0?(\d+)/i);
    const trayNum = trayMatch ? trayMatch[1] : null;

    const lTray = ((l as any).trayName || (l as any).location || "").toLowerCase().trim();
    const lPlantName = ((l as any).plantName || "").toLowerCase().trim();

    if (normPlantLoc && lTray === normPlantLoc) return true;
    if (normPlantName && lPlantName === normPlantName) return true;

    const searchString = `${l.title || ""} ${l.detail || ""} ${l.telegramCaption || ""} ${lTray} ${lPlantName}`.toLowerCase();

    if (normPlantLoc && searchString.includes(normPlantLoc)) return true;
    if (trayNum && (searchString.includes(`khay ${trayNum}`) || searchString.includes(`khay 0${trayNum}`) || searchString.includes(`điểm ${trayNum}`) || searchString.includes(`diem ${trayNum}`))) return true;
    if (normPlantName && searchString.includes(normPlantName)) return true;

    return false;
  });

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-surface rounded-3xl p-6 max-w-4xl w-full shadow-2xl border border-outline-variant/30 space-y-5 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col relative">
        {/* Full Image Preview Lightbox */}
        {previewImage && (
          <div
            className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
              <img
                src={previewImage}
                alt="Ảnh chụp camera thực tế"
                className="w-full h-full object-contain"
              />
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="absolute top-3 right-3 bg-black/70 text-white p-2 rounded-full hover:bg-red-600 transition-all"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-center border-b border-outline-variant/20 pb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-2xl">history</span>
            </div>
            <div>
              <h3 className="font-bold text-base text-on-surface flex items-center gap-2">
                Lịch Sử Chăm Sóc & Phân Tích
              </h3>
              <p className="text-xs text-on-surface-variant">
                🌱 {plant.name} • {plant.location || "Khay trồng"}
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

        {/* 3 Tabs Selection */}
        <div className="grid grid-cols-3 gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("PEST")}
            className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
              activeTab === "PEST"
                ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                : "bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-base">bug_report</span>
            Kiểm Tra Sâu Hại
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("SPRAY")}
            className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
              activeTab === "SPRAY"
                ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                : "bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-base">shower</span>
            Phun Sinh Học
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("FERTILIZE")}
            className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border ${
              activeTab === "FERTILIZE"
                ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                : "bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-base">water_drop</span>
            Tưới Phân Bón
          </button>
        </div>

        {/* Log Content List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-[260px]">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-on-surface-variant space-y-2">
              <span className="material-symbols-outlined text-3xl animate-spin text-purple-600">
                progress_activity
              </span>
              <p className="text-xs font-semibold">Đang tải lịch sử thực tế từ máy chủ...</p>
            </div>
          ) : currentTabLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-on-surface-variant/60 space-y-2 border border-dashed border-outline-variant/30 rounded-2xl">
              <span className="material-symbols-outlined text-4xl">folder_off</span>
              <p className="text-xs font-semibold">Chưa có nhật ký thực tế nào trong mục này</p>
            </div>
          ) : (
            currentTabLogs.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/20 hover:border-purple-500/30 transition-all space-y-3 relative group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-[11px] font-mono font-bold rounded-lg border border-purple-500/20">
                      📅 {item.timestamp}
                    </span>
                    {item.status && (
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-500/20">
                        {item.status}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleDeleteLog(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-on-surface-variant/50 hover:text-red-500 transition-all p-1"
                    title="Xóa nhật ký này"
                  >
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                </div>

                {/* Title */}
                <h4 className="font-bold text-sm text-on-surface flex items-center gap-2">
                  {item.title}
                  {item.dosage && (
                    <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 font-extrabold">
                      ({item.dosage})
                    </span>
                  )}
                </h4>

                {/* Grid Layout: Image on Left, Results on Right */}
                <div className={`grid ${item.image || activeTab === "PEST" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"} gap-4 items-stretch`}>
                  {/* Left Side: Inspection Image */}
                  {(item.image || activeTab === "PEST") && (
                    <div
                      onClick={() => setPreviewImage(item.image || "/api/camera/image")}
                      className="rounded-2xl overflow-hidden border border-outline-variant/30 bg-black/40 relative min-h-[190px] h-full max-h-[240px] flex items-center justify-center cursor-pointer group/img hover:border-purple-500/50 transition-all shadow-inner"
                    >
                      <img
                        src={item.image || "/api/camera/image"}
                        alt="Ảnh kiểm tra thực tế"
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/api/camera/image";
                        }}
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="px-3 py-1.5 bg-black/70 text-white text-xs font-bold rounded-xl backdrop-blur-xs flex items-center gap-1.5 shadow-md">
                          <span className="material-symbols-outlined text-sm">zoom_in</span>
                          Xem ảnh phóng to
                        </span>
                      </div>
                      <span className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/70 text-white text-[10px] font-mono rounded-md backdrop-blur-xs shadow-xs">
                        📷 Camera Snapshot thực tế
                      </span>
                    </div>
                  )}

                  {/* Right Side: Gemini Telegram Report Details */}
                  <div className="bg-surface rounded-2xl p-4 border border-outline-variant/20 font-mono text-xs text-on-surface whitespace-pre-wrap leading-relaxed h-full min-h-[190px] max-h-[240px] overflow-y-auto shadow-xs">
                    {item.telegramCaption || item.detail}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Controls */}
        <div className="flex justify-between items-center pt-3 border-t border-outline-variant/20 flex-shrink-0">
          <button
            type="button"
            onClick={handleClearTabHistory}
            disabled={currentTabLogs.length === 0}
            className="px-3.5 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-xl transition-all disabled:opacity-40 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">delete_sweep</span>
            Xóa nhật ký tab này
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
