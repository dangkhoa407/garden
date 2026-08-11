"use client";

import { useState } from "react";
import { Plant } from "@/lib/data";
import { useGarden } from "@/context/GardenContext";
import { InspectionHistoryModal } from "@/components/dashboard/InspectionHistoryModal";

interface PlantCardProps {
  plant: Plant;
  onObserve?: (plant: Plant) => void;
  onWater?: (plant: Plant) => void;
  onHistory?: (plant: Plant) => void;
}

function cleanLocation(loc?: string): string {
  if (!loc) return "Khay 01";
  const match = loc.match(/Khay\s*\d+/i);
  if (match) {
    return match[0].replace(/khay/i, "Khay");
  }
  return (
    loc
      .replace(/\s*-\s*Tầng\s*\d+/gi, "")
      .replace(/Vị trí\s*\d+\s*/gi, "")
      .replace(/\s*\(.*\)/g, "")
      .trim() || "Khay 01"
  );
}

export function PlantCard({ plant, onObserve, onWater, onHistory }: PlantCardProps) {
  const { triggerQuickAction, updateControls, controls } = useGarden();
  const [actionLoading, setActionLoading] = useState<"inspect" | "water" | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const now = new Date();
  const defaultDateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
  const displayDate = plant.createdDate || defaultDateStr;
  const displayLocation = cleanLocation(plant.location);

  const handleInspectClick = async () => {
    setActionLoading("inspect");
    triggerQuickAction(
      `🐛 Đang điều khiển Robot di chuyển tới ${displayLocation} để kiểm tra sâu bệnh trên cây ${plant.name}...`
    );

    try {
      if (onObserve) {
        onObserve(plant);
      } else {
        const res = await fetch("/api/plant-inspect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plantId: plant.id,
            plantName: plant.name,
            location: displayLocation,
          }),
        });

        if (res.ok) {
          triggerQuickAction(
            `✅ Đã quét xong sâu bệnh cho cây ${plant.name}! Ảnh & báo cáo đã được lưu vào Lịch sử và gửi về Telegram.`
          );
        } else {
          triggerQuickAction(`⚠️ Không thể kết nối quét sâu bệnh cho ${plant.name}`);
        }
      }
    } catch (e) {
      triggerQuickAction(`⚠️ Lỗi khi kích hoạt kiểm tra sâu cho ${plant.name}`);
    } finally {
      setActionLoading(null);
      // Open history modal to display the freshly captured image & AI report
      setShowHistoryModal(true);
    }
  };

  const handleFertilizeClick = async () => {
    setActionLoading("water");
    try {
      if (onWater) {
        onWater(plant);
      } else {
        // 1. Gửi lệnh di chuyển robot tới vị trí khay cây trồng được chọn qua Arduino
        triggerQuickAction(
          `🤖 Robot đang di chuyển tới ${displayLocation} để tiến hành tưới phân...`
        );

        await fetch("/api/arduino/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "CHECK" }),
        }).catch(() => {});

        // Đợi 1.5s để robot di chuyển đến khay
        await new Promise((res) => setTimeout(res, 1500));

        // 2. Kích hoạt bơm tưới phân (Gửi SPRAY cho Arduino & WATER ON cho ESP32)
        await fetch("/api/arduino/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "SPRAY" }),
        }).catch(() => {});

        await fetch("/api/esp32/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "WATER ON" }),
        }).catch(() => {});

        updateControls({
          watering: true,
          soilMoisture: Math.min(100, (controls.soilMoisture || 60) + 10),
        });

        triggerQuickAction(
          `🌱 Robot đã tới ${displayLocation} và kích hoạt tưới phân thành công cho cây ${plant.name}!`
        );

        // 3. Tự động ngắt bơm tưới sau 5s
        setTimeout(async () => {
          await fetch("/api/esp32/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "WATER OFF" }),
          }).catch(() => {});
          updateControls({ watering: false });
        }, 5000);
      }
    } finally {
      setTimeout(() => setActionLoading(null), 1200);
    }
  };

  const handleHistoryClick = () => {
    if (onHistory) {
      onHistory(plant);
    } else {
      setShowHistoryModal(true);
    }
  };

  return (
    <>
      <div className="bg-surface rounded-2xl p-md card-shadow border border-outline-variant/20 hover:shadow-lg transition-all hover:-translate-y-0.5 group flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start mb-md pr-6">
            <div>
              <h4 className="font-body-lg text-body-lg font-bold text-on-surface group-hover:text-primary transition-colors">
                {plant.name}
              </h4>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                {displayLocation} - {displayDate}
              </p>
            </div>
          </div>

          <div className="mb-md">
            <div className="flex justify-between items-center mb-1.5">
              <span
                className={`font-label-caps text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${plant.statusColor}`}
              >
                {plant.status}
              </span>
              <span className="font-label-caps text-[10px] text-on-surface-variant font-medium">
                {plant.progress}%
              </span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${plant.progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons: Kiểm tra sâu, Tưới phân, Lịch sử */}
        <div className="pt-3 border-t border-outline-variant/15 flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={handleInspectClick}
            disabled={actionLoading === "inspect"}
            className="flex-1 py-2 px-2 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/80 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-1 disabled:opacity-50"
            title="Điều khiển Robot tới khay này để chụp ảnh & quét sâu bệnh qua AI Gemini"
          >
            {actionLoading === "inspect" ? (
              <span className="material-symbols-outlined text-sm animate-spin">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-sm">bug_report</span>
            )}
            Kiểm tra sâu
          </button>

          <button
            type="button"
            onClick={handleFertilizeClick}
            disabled={actionLoading === "water"}
            className="flex-1 py-2 px-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-1 disabled:opacity-50"
          >
            {actionLoading === "water" ? (
              <span className="material-symbols-outlined text-sm animate-spin">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-sm">water_drop</span>
            )}
            Tưới phân
          </button>

          <button
            type="button"
            onClick={handleHistoryClick}
            className="flex-1 py-2 px-2 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">history</span>
            Lịch sử
          </button>
        </div>
      </div>

      {/* History Popup Modal */}
      <InspectionHistoryModal
        plant={plant}
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
      />
    </>
  );
}
