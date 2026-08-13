"use client";

import { useState } from "react";
import { Plant } from "@/lib/data";
import { useGarden } from "@/context/GardenContext";
import { InspectionHistoryModal } from "@/components/dashboard/InspectionHistoryModal";
import { CameraObserveModal } from "@/components/dashboard/CameraObserveModal";

interface PlantCardProps {
  plant: Plant;
  onObserve?: (plant: Plant) => void;
  onWater?: (plant: Plant) => void;
  onHistory?: (plant: Plant) => void;
}

function cleanLocation(loc?: string): string {
  if (!loc) return "Khay 01";
  const match = loc.match(/Khay\s*\d+/i);
  if (match) return match[0].replace(/khay/i, "Khay");
  return (
    loc
      .replace(/\s*-\s*T[aà]ng\s*\d+/gi, "")
      .replace(/V[iị]\s*tr[ií]\s*\d+\s*/gi, "")
      .replace(/\s*\(.*\)/g, "")
      .trim() || "Khay 01"
  );
}

export function PlantCard({ plant, onObserve, onWater, onHistory }: PlantCardProps) {
  const { triggerQuickAction, updateControls, controls } = useGarden();
  const [actionLoading, setActionLoading] = useState<"observe" | "inspect" | "water" | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showObserveModal, setShowObserveModal] = useState(false);

  const now = new Date();
  const defaultDateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
  const displayDate = plant.createdDate || defaultDateStr;
  const displayLocation = cleanLocation(plant.location);

  const handleObserveClick = async () => {
    setActionLoading("observe");
    try {
      const [arduinoRes, cameraRes] = await Promise.all([
        fetch("/api/arduino/status").then((r) => r.json()).catch(() => ({ connected: false })),
        fetch("/api/camera/status").then((r) => r.json()).catch(() => ({ connected: false })),
      ]);

      if (!arduinoRes?.connected || !cameraRes?.connected) {
        const missing = [];
        if (!arduinoRes?.connected) missing.push("Arduino");
        if (!cameraRes?.connected) missing.push("USB Camera");
        triggerQuickAction(
          `❌ Lỗi kết nối phần cứng (${missing.join(" & ")} chưa kết nối). Không thể mở quan sát cho ${plant.name}.`
        );
        return;
      }

      if (onObserve) {
        onObserve(plant);
      } else {
        setShowObserveModal(true);
        triggerQuickAction(`🔍 Đang điều khiển robot tới ${displayLocation} để quan sát cây ${plant.name}...`);
        fetch("/api/plant-move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plantId: plant.id,
            plantName: plant.name,
            location: displayLocation,
          }),
        }).catch(() => {});
      }
    } catch (e) {
      triggerQuickAction(`❌ Lỗi hệ thống khi mở quan sát tại ${displayLocation}`);
    } finally {
      setTimeout(() => setActionLoading(null), 800);
    }
  };

  const handleInspectClick = async () => {
    setActionLoading("inspect");
    try {
      triggerQuickAction(`🐛 Đang điều khiển robot tới ${displayLocation} để kiểm tra sâu bệnh cho ${plant.name}...`);

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
        triggerQuickAction(`✅ Đã kiểm tra sâu bệnh xong cho ${plant.name}. Báo cáo đã lưu vào lịch sử.`);
        setShowHistoryModal(true);
      } else {
        const json = await res.json().catch(() => ({}));
        triggerQuickAction(`❌ Lỗi kiểm tra sâu cho ${plant.name}: ${json.error || "Server không phản hồi"}`);
      }
    } catch (e) {
      triggerQuickAction(`❌ Lỗi khi kiểm tra sâu cho ${plant.name}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleFertilizeClick = async () => {
    setActionLoading("water");
    try {
      const ardRes = await fetch("/api/arduino/status").then((r) => r.json()).catch(() => ({ connected: false }));

      if (!ardRes?.connected) {
        triggerQuickAction(`❌ Lỗi kết nối phần cứng: chưa nhận diện mạch Arduino. Không thể phun thuốc cho ${plant.name}.`);
        return;
      }

      if (onWater) {
        onWater(plant);
      } else {
        triggerQuickAction(`🧪 Robot đang di chuyển tới ${displayLocation} để phun thuốc cho ${plant.name}...`);

        const res = await fetch("/api/plant-water", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plantId: plant.id,
            plantName: plant.name,
            location: displayLocation,
          }),
        });

        if (res.ok) {
          updateControls({
            watering: true,
            soilMoisture: Math.min(100, (controls.soilMoisture || 60) + 10),
          });

          triggerQuickAction(`🧪 Robot đã phun thuốc thành công cho ${plant.name} tại ${displayLocation}.`);

          setTimeout(() => {
            updateControls({ watering: false });
          }, 3000);
        } else {
          const json = await res.json().catch(() => ({}));
          triggerQuickAction(`❌ Lỗi phun thuốc cho ${plant.name}: ${json.error || "Không thể phát lệnh phần cứng"}`);
        }
      }
    } catch (e) {
      triggerQuickAction(`❌ Lỗi phần cứng khi phun thuốc cho ${plant.name}`);
    } finally {
      setTimeout(() => setActionLoading(null), 1000);
    }
  };

  const handleHistoryClick = () => {
    if (onHistory) onHistory(plant);
    else setShowHistoryModal(true);
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
              <span className={`font-label-caps text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${plant.statusColor}`}>
                {plant.status}
              </span>
              <span className="font-label-caps text-[10px] text-on-surface-variant font-medium">
                {plant.progress}%
              </span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
              <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${plant.progress}%` }} />
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-outline-variant/15 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleObserveClick}
            disabled={actionLoading === "observe"}
            className="py-2 px-2.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/80 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
            title="Di chuyển robot tới khay này và mở camera quan sát trực tiếp"
          >
            {actionLoading === "observe" ? (
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm">visibility</span>
            )}
            Quan sát
          </button>

          <button
            type="button"
            onClick={handleInspectClick}
            disabled={actionLoading === "inspect"}
            className="py-2 px-2.5 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/40 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/80 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
            title="Di chuyển robot tới khay này, chụp ảnh và quét sâu bệnh qua AI Gemini"
          >
            {actionLoading === "inspect" ? (
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm">bug_report</span>
            )}
            Kiểm tra sâu
          </button>

          <button
            type="button"
            onClick={handleFertilizeClick}
            disabled={actionLoading === "water"}
            className="py-2 px-2.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
            title="Di chuyển robot tới khay này và kích hoạt phun thuốc bằng Arduino"
          >
            {actionLoading === "water" ? (
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm">water_drop</span>
            )}
            Tưới thuốc
          </button>

          <button
            type="button"
            onClick={handleHistoryClick}
            className="py-2 px-2.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/80 rounded-xl font-bold text-xs transition-all active:scale-95 flex items-center justify-center gap-1.5"
            title="Xem nhật ký kiểm tra sâu, phun thuốc và quan sát của cây này"
          >
            <span className="material-symbols-outlined text-sm">history</span>
            Lịch sử
          </button>
        </div>
      </div>

      <InspectionHistoryModal plant={plant} isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} />
      <CameraObserveModal plant={plant} isOpen={showObserveModal} onClose={() => setShowObserveModal(false)} />
    </>
  );
}
