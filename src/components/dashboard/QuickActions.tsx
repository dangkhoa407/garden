"use client";

import { useGarden } from "@/context/GardenContext";

export function QuickActions() {
  const { updateControls, triggerQuickAction, controls } = useGarden();

  const handleWaterNow = () => {
    updateControls({ watering: true, soilMoisture: Math.min(100, controls.soilMoisture + 10) });
    triggerQuickAction("Đã kích hoạt hệ thống tưới nước tự động và cập nhật độ ẩm!");
  };

  const handleToggleLights = () => {
    const nextLights = !controls.lights;
    updateControls({ lights: nextLights });
    triggerQuickAction(`Đã ${nextLights ? "BẬT" : "TẮT"} đèn LED trồng cây!`);
  };

  const handlePestCheck = () => {
    triggerQuickAction("Camera AI đang khởi động quét phát hiện sâu bệnh trên lá...");
  };

  const handleMistSpray = () => {
    const nextMisting = !controls.misting;
    updateControls({ misting: nextMisting });
    triggerQuickAction(`Đã ${nextMisting ? "BẬT" : "TẮT"} máy phun sương!`);
  };

  return (
    <div className="flex gap-sm flex-wrap">
      <button
        onClick={handleWaterNow}
        className="bg-primary text-on-primary font-body-sm text-body-sm font-semibold py-2.5 px-md rounded-xl hover:bg-primary-container transition-all shadow-sm active:scale-95 flex items-center gap-xs"
      >
        <span className="material-symbols-outlined text-[18px]">water</span>
        Tưới nước ngay
      </button>

      <button
        onClick={handleToggleLights}
        className={`font-body-sm text-body-sm font-semibold py-2.5 px-md rounded-xl transition-all active:scale-95 flex items-center gap-xs border ${
          controls.lights
            ? "bg-secondary text-on-secondary border-secondary"
            : "bg-surface border-secondary text-secondary hover:bg-surface-container-high"
        }`}
      >
        <span className="material-symbols-outlined text-[18px]">wb_incandescent</span>
        {controls.lights ? "Đèn LED đang Bật" : "Bật / Tắt đèn LED"}
      </button>

      <button
        onClick={handlePestCheck}
        className="bg-surface border border-secondary text-secondary font-body-sm text-body-sm font-semibold py-2.5 px-md rounded-xl hover:bg-surface-container-high transition-all active:scale-95 flex items-center gap-xs"
      >
        <span className="material-symbols-outlined text-[18px]">bug_report</span>
        Kiểm tra sâu bệnh
      </button>

      <button
        onClick={handleMistSpray}
        className={`font-body-sm text-body-sm font-semibold py-2.5 px-md rounded-xl transition-all active:scale-95 flex items-center gap-xs border ${
          controls.misting
            ? "bg-primary-container text-on-primary border-primary-container"
            : "bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
        }`}
      >
        <span className="material-symbols-outlined text-[18px]">air</span>
        {controls.misting ? "Phun sương đang Bật" : "Phun sương độ ẩm"}
      </button>
    </div>
  );
}
