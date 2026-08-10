"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

const TANK_CODES = ["Bình A", "Bình B", "Bình C", "Bình D"];

interface IrrigateModalProps {
  isOpen: boolean;
  onClose: () => void;
  fertilizers?: any[];
  onSuccess?: () => void;
  onStartIrrigation?: (durationSec: number) => void;
}

export function IrrigateModal({ isOpen, onClose, fertilizers = [], onSuccess, onStartIrrigation }: IrrigateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeFertilizers, setActiveFertilizers] = useState<any[]>(fertilizers);
  const [irrigateTab, setIrrigateTab] = useState<"custom" | "ai">("custom");
  const [isIrrigating, setIsIrrigating] = useState(false);
  const [irrigateStep, setIrrigateStep] = useState<"idle" | "dose" | "well" | "water" | "done">("idle");
  const [irrigateLog, setIrrigateLog] = useState<string[]>([]);
  const [targetMoisture, setTargetMoisture] = useState<number>(70);

  // Sensor state
  const [espSensors, setEspSensors] = useState<{
    soil1Raw: number;
    soil2Raw: number;
    soil1Percent: number;
    soil2Percent: number;
    avgSoilPercent: number;
    floatLow: boolean;
    floatHigh: boolean;
    running: boolean;
  }>({
    soil1Raw: 3171,
    soil2Raw: 4095,
    soil1Percent: 0,
    soil2Percent: 0,
    avgSoilPercent: 0,
    floatLow: false,
    floatHigh: false,
    running: false,
  });

  // Selected tanks state for Tab 1
  const [selectedTanks, setSelectedTanks] = useState<{
    [key: string]: { selected: boolean; ml: number };
  }>({
    "Bình A": { selected: false, ml: 2.0 },
    "Bình B": { selected: false, ml: 2.0 },
    "Bình C": { selected: false, ml: 2.0 },
    "Bình D": { selected: false, ml: 2.0 },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch fertilizers list from server whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchFertilizers = async () => {
      try {
        const res = await fetch("/api/fertilizers");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setActiveFertilizers(data);
          }
        }
      } catch (err) {}
    };

    fetchFertilizers();
  }, [isOpen]);

  // Fetch real-time ESP32 sensors while modal is open
  useEffect(() => {
    if (!isOpen) return;

    const fetchSensors = async () => {
      try {
        const res = await fetch("/api/esp32/sensors");
        if (res.ok) {
          const data = await res.json();
          if (data.sensors) {
            setEspSensors(data.sensors);
          }
        }
      } catch (err) {}
    };

    fetchSensors();
    const interval = setInterval(fetchSensors, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  // Filter only tanks that have been added/configured in fertilizer management
  const availableTanks = TANK_CODES.filter((code) =>
    activeFertilizers.some((f: any) => f.tankCode === code || f.code === code)
  );

  const handleToggleTank = (code: string) => {
    setSelectedTanks((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        selected: !prev[code]?.selected,
      },
    }));
  };

  const handleMlChange = (code: string, val: number) => {
    const clamped = Math.min(6, Math.max(0.1, val));
    setSelectedTanks((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        ml: clamped,
      },
    }));
  };

  const handleStartIrrigation = async (isAiMode: boolean = false) => {
    setIsIrrigating(true);
    setIrrigateLog([]);
    setIrrigateStep("dose");

    const tanksToDose: { tankCode: string; ml: number }[] = [];

    if (isAiMode) {
      const avg = espSensors.avgSoilPercent;
      const mlA = avg < 40 ? 3.0 : 1.5;
      const mlB = avg < 40 ? 2.0 : 1.0;

      if (availableTanks.includes("Bình A")) {
        tanksToDose.push({ tankCode: "Bình A", ml: mlA });
      }
      if (availableTanks.includes("Bình B")) {
        tanksToDose.push({ tankCode: "Bình B", ml: mlB });
      }

      setIrrigateLog((prev) => [
        ...prev,
        `🤖 KÍCH HOẠT TƯỚI PHÂN BẰNG AI: Độ ẩm hiện tại ${avg}%`,
        `💡 AI Đề xuất: Trích xuất ${tanksToDose.map(t => `${t.ml}ml ${t.tankCode}`).join(", ")}`,
      ]);
    } else {
      availableTanks.forEach((code) => {
        if (selectedTanks[code]?.selected) {
          tanksToDose.push({ tankCode: code, ml: selectedTanks[code].ml });
        }
      });

      if (tanksToDose.length === 0) {
        setIrrigateLog((prev) => [
          ...prev,
          "❌ Chưa chọn bình phân nào! Vui lòng tích chọn ít nhất 1 bình phân.",
        ]);
        setIsIrrigating(false);
        setIrrigateStep("idle");
        return;
      }
    }

    let estDurationSec = 20;
    tanksToDose.forEach((t) => {
      estDurationSec += Math.max(5, Math.round(t.ml * 5));
    });

    if (onStartIrrigation) {
      onStartIrrigation(estDurationSec);
    }
    onClose();

    try {
      // 1. TRÍCH XUẤT PHÂN BÓN (DOSE)
      for (const t of tanksToDose) {
        const expectedSec = Math.round(t.ml * 60);
        setIrrigateLog((prev) => [
          ...prev,
          `🧪 Gửi lệnh DOSE: Đang bơm ${t.ml} ml từ ${t.tankCode} (Tốc độ 1 ml/phút => Bơm chạy trong ${expectedSec} giây)...`,
        ]);
        const res = await fetch("/api/esp32/dose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tankCode: t.tankCode, ml: t.ml }),
        });
        const data = await res.json();
        const actualSec = data.durationSec || expectedSec;
        setIrrigateLog((prev) => [
          ...prev,
          `✅ Đã trích xuất thành công ${t.ml} ml từ ${t.tankCode}! (Thời gian: ${actualSec}s)`,
        ]);

        await new Promise((r) => setTimeout(r, actualSec * 1000 + 500));
      }

      // 2. BƠM NƯỚC VÀO BỒN TRỘN (WELL ON - ĐỢI PHAO CAO BẬT)
      setIrrigateStep("well");
      setIrrigateLog((prev) => [
        ...prev,
        "💧 Gửi lệnh WELL ON: Đang bật bơm giếng nạp nước vào bồn trộn...",
        "⏳ Đang chờ nước nạp đầy bồn (Đợi phao cao bật / HIGH = 1)...",
      ]);

      await fetch("/api/esp32/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "WELL ON" }),
      });

      let floatHighTriggered = false;
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const sRes = await fetch("/api/esp32/sensors");
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.sensors?.floatHigh) {
              floatHighTriggered = true;
              setIrrigateLog((prev) => [
                ...prev,
                "✅ PHAO CAO ĐÃ BẬT! Bồn trộn đã đầy nước dung dịch.",
              ]);
              break;
            }
          }
        } catch (e) {}
      }

      if (!floatHighTriggered) {
        setIrrigateLog((prev) => [
          ...prev,
          "⚠️ Hết thời gian chờ phao cao! Tự động ngắt bơm giếng để đảm bảo an toàn.",
        ]);
        await fetch("/api/esp32/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "WELL OFF" }),
        });
      }

      // 3. TƯỚI PHÂN VÀO VƯỜN (WATER ON - ĐẾN KHI ĐỦ ĐỘ ẨM HOẶC PHAO THẤP BẬT)
      setIrrigateStep("water");
      setIrrigateLog((prev) => [
        ...prev,
        `🌿 Gửi lệnh WATER ON: Đang bật bơm tưới dung dịch phân bón cho cây...`,
        `🎯 Mục tiêu: Đạt độ ẩm ${targetMoisture}% từ 2 cảm biến độ ẩm...`,
      ]);

      await fetch("/api/esp32/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "WATER ON" }),
      });

      let completedSuccess = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const sRes = await fetch("/api/esp32/sensors");
          if (sRes.ok) {
            const sData = await sRes.json();
            const sensors = sData.sensors;
            const currentAvg = sensors?.avgSoilPercent || 0;

            if (sensors?.floatLow) {
              setIrrigateLog((prev) => [
                ...prev,
                "🚨 CẢNH BÁO AN TOÀN: Phao dưới đã bật (Cạn bồn chứa)! Dừng bơm tưới khẩn cấp.",
              ]);
              break;
            }

            if (currentAvg >= targetMoisture) {
              completedSuccess = true;
              setIrrigateLog((prev) => [
                ...prev,
                `🎉 THÀNH CÔNG: Đã đạt độ ẩm mục tiêu ${currentAvg}% >= ${targetMoisture}%!`,
              ]);
              break;
            }
          }
        } catch (e) {}
      }

      // Tắt bơm tưới
      await fetch("/api/esp32/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "WATER OFF" }),
      });

      setIrrigateStep("done");
      setIrrigateLog((prev) => [
        ...prev,
        completedSuccess
          ? "✅ Đã hoàn thành chu kỳ tưới phân bón thành công!"
          : "⏹️ Đã dừng chu kỳ tưới phân bón an toàn.",
      ]);

      if (onSuccess) onSuccess();
    } catch (err: any) {
      setIrrigateLog((prev) => [...prev, `❌ Lỗi thực thi: ${err.message}`]);
    } finally {
      setIsIrrigating(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-surface border border-outline-variant/30 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-surface-container-lowest border-b border-outline-variant/15 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <span className="material-symbols-outlined text-2xl">water_drop</span>
            </div>
            <div>
              <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                Hệ Thống Tưới Phân Bón Tự Động ESP32
              </h3>
              <p className="text-xs text-on-surface-variant">
                Quy trình 3 bước: Trích xuất phân $\rightarrow$ Nạp nước bồn $\rightarrow$ Tưới vườn
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isIrrigating}
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Live Sensor Diagnostics Box */}
          <div className="p-3.5 rounded-2xl bg-surface-container-low border border-outline-variant/30 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-on-surface">
              <span className="flex items-center gap-1.5 text-primary">
                <span className="material-symbols-outlined text-base">sensors</span>
                CẢM BIẾN THỜI GIAN THỰC (ESP32):
              </span>
              <span className="font-mono text-[11px] text-emerald-600 font-bold">
                Độ ẩm trung bình: {espSensors.avgSoilPercent}%
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2 bg-surface rounded-xl border border-outline-variant/20">
                <span className="text-[10px] text-on-surface-variant block">CB Độ Ẩm 1:</span>
                <strong className="text-primary">{espSensors.soil1Percent}%</strong>
                <span className="text-[10px] text-zinc-400 block font-normal">
                  Raw: {espSensors.soil1Raw}
                </span>
              </div>
              <div className="p-2 bg-surface rounded-xl border border-outline-variant/20">
                <span className="text-[10px] text-on-surface-variant block">CB Độ Ẩm 2:</span>
                <strong className="text-primary">{espSensors.soil2Percent}%</strong>
                <span className="text-[10px] text-zinc-400 block font-normal">
                  Raw: {espSensors.soil2Raw}
                </span>
              </div>
              <div className="p-2 bg-surface rounded-xl border border-outline-variant/20">
                <span className="text-[10px] text-on-surface-variant block">Phao Cao (Đầy):</span>
                <strong
                  className={espSensors.floatHigh ? "text-emerald-500 font-bold" : "text-zinc-400"}
                >
                  {espSensors.floatHigh ? "BẬT (ĐẦY)" : "TẮT"}
                </strong>
              </div>
              <div className="p-2 bg-surface rounded-xl border border-outline-variant/20">
                <span className="text-[10px] text-on-surface-variant block">Phao Thấp (Cạn):</span>
                <strong
                  className={espSensors.floatLow ? "text-rose-500 font-bold" : "text-zinc-400"}
                >
                  {espSensors.floatLow ? "BẬT (CẠN)" : "TẮT"}
                </strong>
              </div>
            </div>
          </div>

          {/* 2 Tabs Header */}
          <div className="flex bg-surface-container-high p-1 rounded-2xl border border-outline-variant/30">
            <button
              type="button"
              onClick={() => setIrrigateTab("custom")}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                irrigateTab === "custom"
                  ? "bg-surface text-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-lg">tune</span>
              Tab 1: Tưới phân tùy chỉnh
            </button>
            <button
              type="button"
              onClick={() => setIrrigateTab("ai")}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                irrigateTab === "ai"
                  ? "bg-surface text-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
              Tab 2: Tưới phân bằng AI
            </button>
          </div>

          {/* TAB 1: TƯỚI PHÂN TÙY CHỈNH */}
          {irrigateTab === "custom" && (
            <div className="space-y-4">
              <p className="text-xs text-on-surface-variant font-medium">
                Tích chọn các bình phân đã được thêm ở trang Quản Lý Bình Phân để chọn lượng phân (ml) cần trích xuất:
              </p>

              {availableTanks.length === 0 ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-center text-xs text-amber-700 dark:text-amber-300 space-y-1">
                  <span className="material-symbols-outlined text-2xl block text-amber-500">
                    warning
                  </span>
                  <p className="font-bold text-sm">Chưa có bình phân nào được thêm!</p>
                  <p>
                    Vui lòng vào trang <strong>Quản Lý Bình Phân Bón</strong> để tạo bình phân mới trước khi thực hiện tưới.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableTanks.map((code) => {
                    const fert = activeFertilizers.find((f: any) => f.tankCode === code || f.code === code);
                    const item = selectedTanks[code] || { selected: false, ml: 2.0 };

                    return (
                      <div
                        key={code}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          item.selected
                            ? "bg-primary/10 border-primary shadow-sm"
                            : "bg-surface-container-low border-outline-variant/30 opacity-80"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <label className="flex items-center gap-2.5 cursor-pointer font-bold text-sm text-on-surface">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              disabled={isIrrigating}
                              onChange={() => handleToggleTank(code)}
                              className="w-4.5 h-4.5 rounded text-primary focus:ring-primary"
                            />
                            <span className="font-mono text-primary font-bold">{code}</span>
                            <span className="text-xs text-emerald-600 font-bold truncate max-w-[130px]">
                              {fert ? fert.name : "(Đã thêm)"}
                            </span>
                          </label>
                        </div>

                        {item.selected && (
                          <div className="mt-2.5 pt-2 border-t border-primary/20 flex items-center justify-between gap-2">
                            <span className="text-xs text-on-surface-variant font-semibold">
                              Lượng phân cần lấy:
                            </span>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0.1}
                                max={6}
                                step={0.5}
                                disabled={isIrrigating}
                                value={item.ml}
                                onChange={(e) => handleMlChange(code, Number(e.target.value))}
                                className="w-20 px-2 py-1 bg-surface border border-primary/40 rounded-xl font-mono text-sm font-bold text-primary text-center focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <span className="text-xs font-mono font-bold text-on-surface-variant">
                                ml
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {availableTanks.length > 0 && (
                <div className="flex items-center justify-between bg-surface-container-low p-3 rounded-xl border border-outline-variant/20">
                  <span className="text-xs font-semibold text-on-surface-variant">
                    Chỉ số độ ẩm mục tiêu tự động dừng:
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={30}
                      max={95}
                      value={targetMoisture}
                      onChange={(e) => setTargetMoisture(Number(e.target.value))}
                      disabled={isIrrigating}
                      className="w-16 px-2 py-1 bg-surface border border-outline-variant rounded-xl font-mono font-bold text-sm text-center"
                    />
                    <span className="text-xs font-mono font-bold text-on-surface-variant">%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TƯỚI PHÂN BẰNG AI */}
          {irrigateTab === "ai" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/20 via-teal-900/10 to-primary/10 border border-primary/30 space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm">
                  <span className="material-symbols-outlined text-xl animate-spin">
                    psychology
                  </span>
                  AI Đánh Giá Độ Ẩm & Khuyến Nghị Liều Lượng
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Độ ẩm trung bình đất trồng hiện tại là{" "}
                  <strong className="text-primary font-mono font-bold">
                    {espSensors.avgSoilPercent}%
                  </strong>
                  . AI đề xuất công thức phối trộn phân bón sinh học tối ưu:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono font-bold">
                  {availableTanks.map((code) => {
                    const fert = activeFertilizers.find((f: any) => f.tankCode === code || f.code === code);
                    const suggestedMl = espSensors.avgSoilPercent < 40 ? 3.0 : 1.5;
                    return (
                      <div key={code} className="p-2 bg-surface rounded-xl border border-outline-variant/30 flex justify-between">
                        <span>{code} ({fert ? fert.name : "Phân bón"}):</span>
                        <span className="text-emerald-600">{suggestedMl} ml</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Hardware Execution Console Logs */}
          {irrigateLog.length > 0 && (
            <div className="p-3.5 bg-zinc-950 rounded-2xl font-mono text-xs text-zinc-300 space-y-1.5 border border-zinc-800 max-h-36 overflow-y-auto">
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block border-b border-zinc-800 pb-1">
                TIẾN TRÌNH THỰC THI PHẦN CỨNG ESP32:
              </span>
              {irrigateLog.map((log, idx) => (
                <p key={idx} className="leading-relaxed">
                  {log}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-surface-container-lowest border-t border-outline-variant/15 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isIrrigating}
            className="px-4 py-2.5 rounded-xl text-body-sm font-semibold border border-outline-variant text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
          >
            Đóng
          </button>

          <button
            type="button"
            onClick={() => handleStartIrrigation(irrigateTab === "ai")}
            disabled={isIrrigating || availableTanks.length === 0}
            className="px-6 py-2.5 rounded-xl text-body-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {isIrrigating ? (
              <>
                <span className="material-symbols-outlined text-lg animate-spin">
                  progress_activity
                </span>
                Đang thực thi tưới phân...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg">play_arrow</span>
                {irrigateTab === "ai"
                  ? "Kích hoạt tưới phân bằng AI"
                  : "Bắt đầu tưới phân tùy chỉnh"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
