"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plant } from "@/lib/data";

export interface InspectionLogEntry {
  id: string;
  type: "PEST" | "SPRAY" | "FERTILIZE";
  timestamp: string;
  title: string;
  detail: string;
  status?: "Sức khỏe tốt" | "Phát hiện sâu hại" | "Đã phun sương" | "Đã tưới phân";
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

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load history from localStorage or generate realistic default logs
  useEffect(() => {
    if (!isOpen) return;

    const storageKey = `plant_history_${plant.id}`;
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        setLogs(JSON.parse(saved));
        return;
      } catch (e) {}
    }

    // Default sample logs if empty
    const now = new Date();
    const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
    const defaultLogs: InspectionLogEntry[] = [
      {
        id: `log-1-${Date.now()}`,
        type: "PEST",
        timestamp: `${dateStr} 08:30`,
        title: "Quét AI Gemini 6 điểm tự động",
        detail: "Phân tích hình ảnh: Thân và lá phát triển bình thường, chỉ số diệp lục ổn định 92%. Không phát hiện trứng sâu hay dấu hiệu bọ trĩ.",
        status: "Sức khỏe tốt",
      },
      {
        id: `log-2-${Date.now()}`,
        type: "SPRAY",
        timestamp: `${dateStr} 07:15`,
        title: "Phun dung dịch sinh học toàn vườn",
        detail: "Khởi tạo qua phím p/Lịch trình: Bật vòi phun nano phòng trừ sâu bệnh tự động trong 30 giây.",
        status: "Đã phun sương",
      },
      {
        id: `log-3-${Date.now()}`,
        type: "FERTILIZE",
        timestamp: `${dateStr} 06:00`,
        title: "Tưới bổ sung phân vi lượng ESP32",
        detail: "Bơm phối trộn tự động: Bình A (2.0 ml) + Bình B (2.0 ml). Độ ẩm đất đạt mốc 75%.",
        status: "Đã tưới phân",
        dosage: "4.0 ml",
      },
    ];

    setLogs(defaultLogs);
    localStorage.setItem(storageKey, JSON.stringify(defaultLogs));
  }, [isOpen, plant.id]);

  const saveLogs = (updatedLogs: InspectionLogEntry[]) => {
    setLogs(updatedLogs);
    localStorage.setItem(`plant_history_${plant.id}`, JSON.stringify(updatedLogs));
  };

  const handleDeleteLog = (id: string) => {
    const updated = logs.filter((l) => l.id !== id);
    saveLogs(updated);
  };

  const handleClearTabHistory = () => {
    if (!confirm(`Bạn có chắc chắn muốn xóa toàn bộ lịch sử trong mục này?`)) return;
    const updated = logs.filter((l) => l.type !== activeTab);
    saveLogs(updated);
  };

  if (!isOpen || !mounted) return null;

  const currentTabLogs = logs.filter((l) => l.type === activeTab);

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-surface rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-outline-variant/30 space-y-5 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
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
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-[250px]">
          {currentTabLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-on-surface-variant/60 space-y-2 border border-dashed border-outline-variant/30 rounded-2xl">
              <span className="material-symbols-outlined text-4xl">folder_off</span>
              <p className="text-xs font-semibold">Chưa có nhật ký nào trong danh mục này</p>
            </div>
          ) : (
            currentTabLogs.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant/20 hover:border-purple-500/30 transition-all space-y-2 relative group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-[10px] font-mono font-bold rounded-lg border border-purple-500/20">
                      {item.timestamp}
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

                <h4 className="font-bold text-xs text-on-surface flex items-center gap-2">
                  {item.title}
                  {item.dosage && (
                    <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 font-extrabold">
                      ({item.dosage})
                    </span>
                  )}
                </h4>

                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {item.detail}
                </p>

                {item.image && (
                  <div className="mt-2 rounded-xl overflow-hidden max-w-xs border border-outline-variant/20">
                    <img src={item.image} alt="Inspection" className="w-full h-auto object-cover" />
                  </div>
                )}
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
