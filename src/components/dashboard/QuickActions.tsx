"use client";

import { useGarden } from "@/context/GardenContext";

export function QuickActions() {
  const { updateControls, triggerQuickAction, controls } = useGarden();

  const handleToggleAutoShade = () => {
    const nextAuto = !controls.autoShade;
    updateControls({ autoShade: nextAuto });
    triggerQuickAction(
      `🤖 Đã ${nextAuto ? "BẬT" : "TẮT"} chế độ tự động đóng/mở màn che theo cảm biến Mưa & Ánh sáng!`
    );
  };

  const handleToggleSunRoof = async () => {
    const nextState = !controls.sunRoof;
    updateControls({ sunRoof: nextState });
    const cmd = nextState ? "SUN CLOSE" : "SUN OPEN";
    try {
      await fetch("/api/esp32/roof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: cmd }),
      });
    } catch (e) {}
    triggerQuickAction(
      `☀️ Đã ${nextState ? "KÉO CHE" : "THU LẠI"} màn che nắng! (Tự dừng khi chạm công tắc hành trình)`
    );
  };

  const handleToggleRainRoof = async () => {
    const nextState = !controls.rainRoof;
    updateControls({ rainRoof: nextState });
    const cmd = nextState ? "RAIN CLOSE" : "RAIN OPEN";
    try {
      await fetch("/api/esp32/roof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: cmd }),
      });
    } catch (e) {}
    triggerQuickAction(
      `🌧️ Đã ${nextState ? "KÉO CHE" : "THU LẠI"} màn che mưa! (Tự dừng khi chạm công tắc hành trình)`
    );
  };

  return (
    <div className="flex gap-sm flex-wrap">

      {/* Nút Bật/Tắt Màn Che Tự Động */}
      <button
        onClick={handleToggleAutoShade}
        className={`font-body-sm text-body-sm font-semibold py-2.5 px-md rounded-xl transition-all active:scale-95 flex items-center gap-xs border ${
          controls.autoShade
            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
            : "bg-surface border-emerald-600/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
        }`}
        title="Tự động kéo/thu màn che khi cảm biến phát hiện mưa hoặc nắng gắt"
      >
        <span className="material-symbols-outlined text-[18px]">smart_toy</span>
        {controls.autoShade ? "Màn che Tự động: BẬT" : "Màn che Tự động"}
      </button>

      {/* Nút Bật/Tắt Màn Che Nắng */}
      <button
        onClick={handleToggleSunRoof}
        className={`font-body-sm text-body-sm font-semibold py-2.5 px-md rounded-xl transition-all active:scale-95 flex items-center gap-xs border ${
          controls.sunRoof
            ? "bg-amber-600 text-white border-amber-600 shadow-sm"
            : "bg-surface border-amber-500/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
        }`}
        title="Bật/Tắt màn che nắng (Lưới che nắng ESP32 tự dừng công tắc hành trình)"
      >
        <span className="material-symbols-outlined text-[18px]">wb_sunny</span>
        {controls.sunRoof ? "Màn che Nắng: ĐANG CHE" : "Màn che Nắng"}
      </button>

      {/* Nút Bật/Tắt Màn Che Mưa */}
      <button
        onClick={handleToggleRainRoof}
        className={`font-body-sm text-body-sm font-semibold py-2.5 px-md rounded-xl transition-all active:scale-95 flex items-center gap-xs border ${
          controls.rainRoof
            ? "bg-sky-600 text-white border-sky-600 shadow-sm"
            : "bg-surface border-sky-500/60 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40"
        }`}
        title="Bật/Tắt màn che mưa (Bạt che mưa ESP32 tự dừng công tắc hành trình)"
      >
        <span className="material-symbols-outlined text-[18px]">water_drop</span>
        {controls.rainRoof ? "Màn che Mưa: ĐANG CHE" : "Màn che Mưa"}
      </button>
    </div>
  );
}
