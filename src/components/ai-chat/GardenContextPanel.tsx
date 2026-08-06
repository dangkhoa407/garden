"use client";

import { useGarden } from "@/context/GardenContext";

export function GardenContextPanel() {
  const { controls, plants } = useGarden();

  // Dynamic health score calculation based on soil moisture and temperature
  const healthScore = Math.min(
    100,
    Math.max(60, 100 - Math.abs(65 - controls.soilMoisture) - Math.abs(26 - controls.temperature))
  );

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-md card-shadow border border-outline-variant/20 flex flex-col gap-md h-full overflow-y-auto scroll-smooth">
      {/* AI Health Score Header */}
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-md flex items-center justify-between flex-shrink-0">
        <div>
          <span className="font-label-caps text-[10px] text-primary uppercase font-bold block mb-1">
            CHỈ SỐ SỨC KHỎE VƯỜN (LIVE METRIC)
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-stat-value text-headline-md font-bold text-primary">
              {healthScore} / 100
            </span>
            <span className="text-body-sm font-semibold text-primary">
              {healthScore >= 90 ? "Rất Tốt" : healthScore >= 75 ? "Tốt" : "Cần lưu ý"}
            </span>
          </div>
        </div>
        <div className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-sm">
          <span className="material-symbols-outlined text-2xl icon-filled">
            auto_awesome
          </span>
        </div>
      </div>

      {/* Telemetry context feeds */}
      <div className="flex-shrink-0">
        <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase font-bold mb-3">
          DỮ LIỆU CẢM BIẾN TỰ ĐỘNG
        </h4>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/20">
            <div className="flex items-center gap-1.5 text-secondary text-xs font-semibold mb-1">
              <span className="material-symbols-outlined text-sm">water_drop</span>
              Độ ẩm đất
            </div>
            <div className="text-body-lg font-bold text-on-surface">
              {controls.soilMoisture}%
            </div>
            <span className="text-[10px] text-primary font-medium">
              {controls.watering ? "Đang tưới nước" : "Tự động"}
            </span>
          </div>

          <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/20">
            <div className="flex items-center gap-1.5 text-tertiary text-xs font-semibold mb-1">
              <span className="material-symbols-outlined text-sm">thermostat</span>
              Nhiệt độ
            </div>
            <div className="text-body-lg font-bold text-on-surface">
              {controls.temperature}°C
            </div>
            <span className="text-[10px] text-on-surface-variant">
              Quạt: {controls.fan ? "Bật" : "Tắt"}
            </span>
          </div>

          <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/20">
            <div className="flex items-center gap-1.5 text-tertiary-fixed-dim text-xs font-semibold mb-1">
              <span className="material-symbols-outlined text-sm">light_mode</span>
              Cường độ sáng
            </div>
            <div className="text-body-lg font-bold text-on-surface">
              {controls.lightIntensity}%
            </div>
            <span className="text-[10px] text-primary font-medium">
              Đèn: {controls.lights ? "Bật" : "Tắt"}
            </span>
          </div>

          <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/20">
            <div className="flex items-center gap-1.5 text-primary text-xs font-semibold mb-1">
              <span className="material-symbols-outlined text-sm">potted_plant</span>
              Số loại cây
            </div>
            <div className="text-body-lg font-bold text-on-surface">
              {plants.length} loài
            </div>
            <span className="text-[10px] text-primary font-medium">Đang theo dõi</span>
          </div>
        </div>
      </div>

      {/* AI Diagnoses & Insights */}
      <div className="flex-shrink-0 pb-md">
        <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase font-bold mb-3">
          CHẨN ĐOÁN & KHUYÊN DÙNG TỪ AI
        </h4>
        <div className="space-y-2">
          <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-secondary text-lg mt-0.5">
              task_alt
            </span>
            <div className="text-xs">
              <span className="font-bold text-on-surface block">
                Vườn đang có {plants.length} loài cây
              </span>
              <span className="text-on-surface-variant">
                Dữ liệu được lưu trữ trực tiếp vào cơ sở dữ liệu hệ thống GrowHub.
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-tertiary text-lg mt-0.5">
              wb_twilight
            </span>
            <div className="text-xs">
              <span className="font-bold text-on-surface block">
                Tối ưu ánh sáng LED ({controls.lightIntensity}%)
              </span>
              <span className="text-on-surface-variant">
                Tự động điều chỉnh theo thời gian thực khi bạn thay đổi ở trang Điều khiển.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
