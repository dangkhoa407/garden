"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useGarden } from "@/context/GardenContext";

export interface Fertilizer {
  id: string;
  name: string;
  tankCode: string; // e.g. "Bình A", "Bình B", "Bình C", "Bình D"
  capacityMl: number;
  currentMl: number;
  price?: number;
  addedDate?: string;
  status: "Sẵn sàng" | "Cần thêm" | "Hết phân";
}

const TANK_CODES = ["Bình A", "Bình B", "Bình C", "Bình D"];

export default function FertilizersPage() {
  const { fertilizers, addFertilizer, deleteFertilizer, updateFertilizer, triggerQuickAction } =
    useGarden();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingFert, setEditingFert] = useState<Fertilizer | null>(null);

  // Form State - Add/Edit Tank
  const [name, setName] = useState("");
  const [tankCode, setTankCode] = useState(TANK_CODES[0]);
  const [currentMl, setCurrentMl] = useState(6);
  const [price, setPrice] = useState(50000);
  const [errorMsg, setErrorMsg] = useState("");
  const [mounted, setMounted] = useState(false);

  // Modal Tưới Phân (Irrigation Modal) State
  const [showIrrigateModal, setShowIrrigateModal] = useState(false);
  const [irrigateTab, setIrrigateTab] = useState<"custom" | "ai">("custom");

  // Selected tanks and dosage inputs for custom tab
  const [selectedTanks, setSelectedTanks] = useState<
    Record<string, { selected: boolean; ml: number }>
  >({
    "Bình A": { selected: false, ml: 2.0 },
    "Bình B": { selected: false, ml: 2.0 },
    "Bình C": { selected: false, ml: 2.0 },
    "Bình D": { selected: false, ml: 2.0 },
  });

  const [targetMoisture, setTargetMoisture] = useState(70);

  // ESP32 Sensor State (Raw & Percentages)
  const [espSensors, setEspSensors] = useState({
    soil1Raw: 3171,
    soil2Raw: 4095,
    soil1Percent: 0,
    soil2Percent: 0,
    avgSoilPercent: 0,
    floatLow: false,
    floatHigh: false,
    running: false,
  });

  // Automated Execution State
  const [isIrrigating, setIsIrrigating] = useState(false);
  const [irrigateStep, setIrrigateStep] = useState<"idle" | "dose" | "well" | "water" | "done" | "stopped">("idle");
  const [irrigateLog, setIrrigateLog] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Poll ESP32 Sensors when Irrigate Modal is open
  useEffect(() => {
    if (!showIrrigateModal) return;

    const fetchSensors = async () => {
      try {
        const res = await fetch("/api/esp32/sensors");
        if (res.ok) {
          const data = await res.json();
          if (data.sensors) {
            setEspSensors(data.sensors);
          }
        }
      } catch (e) {}
    };

    fetchSensors();
    const interval = setInterval(fetchSensors, 2500);
    return () => clearInterval(interval);
  }, [showIrrigateModal]);

  const resetForm = () => {
    setName("");
    setTankCode(TANK_CODES[0]);
    setCurrentMl(6);
    setPrice(50000);
    setErrorMsg("");
    setEditingFert(null);
  };

  const handleOpenAddModal = (targetCode?: string) => {
    resetForm();
    if (targetCode) {
      setTankCode(targetCode);
    } else {
      const usedCodes = fertilizers.map((f: any) => f.tankCode);
      const availableCode = TANK_CODES.find((c) => !usedCodes.includes(c)) || TANK_CODES[0];
      setTankCode(availableCode);
    }
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!name.trim()) {
      setErrorMsg("Vui lòng nhập tên loại phân bón!");
      return;
    }

    const numCur = Number(currentMl);
    if (isNaN(numCur) || numCur < 0) {
      setErrorMsg("Vui lòng nhập lượng phân hợp lệ!");
      return;
    }

    if (numCur > 6) {
      setErrorMsg("Lượng phân tối đa chỉ là 6 ml!");
      return;
    }

    const todayDate = new Date().toLocaleDateString("vi-VN");
    const fixedCap = 6;
    const numPrice = Number(price) || 0;

    const status =
      numCur <= 0 ? "Hết phân" : numCur < fixedCap * 0.2 ? "Cần thêm" : "Sẵn sàng";

    if (editingFert) {
      await updateFertilizer(editingFert.id, {
        name: name.trim(),
        tankCode,
        capacityMl: fixedCap,
        currentMl: numCur,
        price: numPrice,
        status,
      });
      triggerQuickAction(`✅ Đã cập nhật bình phân "${tankCode} - ${name.trim()}"!`);
    } else {
      await addFertilizer({
        id: `fert-${Date.now()}`,
        name: name.trim(),
        tankCode,
        capacityMl: fixedCap,
        currentMl: numCur,
        price: numPrice,
        addedDate: todayDate,
        status,
      });
      triggerQuickAction(`✅ Đã thêm mới bình phân "${tankCode} - ${name.trim()}"!`);
    }

    setShowAddModal(false);
    resetForm();
  };

  const handleEditClick = (fert: any) => {
    setEditingFert(fert);
    setName(fert.name || "");
    setTankCode(fert.tankCode || TANK_CODES[0]);
    setCurrentMl(fert.currentMl ?? 6);
    setPrice(fert.price || 0);
    setShowAddModal(true);
  };

  const handleDeleteClick = async (id: string, code: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa bình phân ${code} này khỏi hệ thống?`)) {
      await deleteFertilizer(id);
      triggerQuickAction(`🗑️ Đã xóa bình phân ${code}!`);
    }
  };

  // Toggle Tank Selection in Custom Mode
  const handleToggleTank = (code: string) => {
    setSelectedTanks((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        selected: !prev[code]?.selected,
      },
    }));
  };

  // Change ml for tank
  const handleMlChange = (code: string, value: number) => {
    const val = Math.min(6, Math.max(0.1, value));
    setSelectedTanks((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        ml: val,
      },
    }));
  };

  // Automated Irrigation Cycle Execution (ESP32)
  const handleStartIrrigation = async (isAiMode = false) => {
    setIsIrrigating(true);
    setIrrigateStep("dose");
    setIrrigateLog(["🚀 Khởi tạo chu kỳ tưới phân tự động ESP32..."]);

    let tanksToDose: { tankCode: string; ml: number }[] = [];

    if (isAiMode) {
      const avg = espSensors.avgSoilPercent;
      if (avg < 40) {
        tanksToDose = [
          { tankCode: "Bình A", ml: 3.0 },
          { tankCode: "Bình B", ml: 2.0 },
        ];
      } else if (avg < 70) {
        tanksToDose = [
          { tankCode: "Bình A", ml: 1.5 },
          { tankCode: "Bình C", ml: 1.5 },
        ];
      } else {
        tanksToDose = [{ tankCode: "Bình D", ml: 1.0 }];
      }
    } else {
      tanksToDose = Object.entries(selectedTanks)
        .filter(([_, item]) => item.selected && item.ml > 0)
        .map(([code, item]) => ({ tankCode: code, ml: item.ml }));
    }

    if (tanksToDose.length === 0) {
      setIrrigateLog((prev) => [
        ...prev,
        "❌ Chưa chọn bình phân nào! Vui lòng tích chọn bình phân cần sử dụng.",
      ]);
      setIsIrrigating(false);
      return;
    }

    try {
      // 1. TRÍCH XUẤT PHÂN BÓN (DOSE)
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
          `✅ Đã trích xuất thành công ${t.ml} ml từ ${t.tankCode}! (Lệnh: ${data.command || "DOSE"}, Thời gian: ${actualSec}s)`,
        ]);

        // Đợi thời gian bơm phân
        await new Promise((r) => setTimeout(r, actualSec * 1000 + 500));

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
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const sRes = await fetch("/api/esp32/sensors");
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.sensors) {
            setEspSensors(sData.sensors);
            if (sData.sensors.floatHigh) {
              floatHighTriggered = true;
              break;
            }
          }
        }
      }

      setIrrigateLog((prev) => [
        ...prev,
        floatHighTriggered
          ? "✅ Phao cao đã bật (Bồn đầy nước)! ESP32 đã tự ngắt bơm giếng."
          : "ℹ️ Đã hoàn thành giai đoạn nạp nước vào bồn trộn.",
      ]);

      // 3. PHUN TƯỚI PHÂN & GIÁM SÁT 2 CẢM BIẾN ĐỘ ẨM (WATER ON)
      setIrrigateStep("water");
      setIrrigateLog((prev) => [
        ...prev,
        `🌿 Gửi lệnh WATER ON: Đang bật bơm tưới phân bón cho cây...`,
        `📊 Đang giám sát liên tục 2 Cảm biến độ ẩm (Mục tiêu: ≥ ${targetMoisture}%)...`,
      ]);

      await fetch("/api/esp32/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "WATER ON" }),
      });

      let isComplete = false;
      let isStoppedByFloatLow = false;

      for (let step = 0; step < 20; step++) {
        await new Promise((r) => setTimeout(r, 2500));
        const sRes = await fetch("/api/esp32/sensors");
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.sensors) {
            const sens = sData.sensors;
            setEspSensors(sens);

            setIrrigateLog((prev) => [
              ...prev,
              `📈 Độ ẩm hiện tại: CB1 = ${sens.soil1Percent}%, CB2 = ${sens.soil2Percent}% (Trung bình: ${sens.avgSoilPercent}%)`,
            ]);

            // ĐIỀU KIỆN DỪNG AN TOÀN: Phao dưới bật (Cạn bồn)
            if (sens.floatLow) {
              isStoppedByFloatLow = true;
              break;
            }

            // ĐIỀU KIỆN DỪNG THÀNH CÔNG: Đạt độ ẩm mục tiêu ở cả 2 cảm biến
            if (sens.soil1Percent >= targetMoisture && sens.soil2Percent >= targetMoisture) {
              isComplete = true;
              break;
            }
          }
        }
      }

      // TẮT BƠM TƯỚI DUNG DỊCH
      await fetch("/api/esp32/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "WATER OFF" }),
      });

      if (isStoppedByFloatLow) {
        setIrrigateStep("stopped");
        setIrrigateLog((prev) => [
          ...prev,
          "⚠️ CẢNH BÁO AN TOÀN: Phao dưới đã bật (Bồn chứa cạn nước)! Đã tự động tắt bơm tưới.",
        ]);
        triggerQuickAction("⚠️ Đã ngắt bơm tưới do bồn chứa cạn nước (Phao dưới bật)!");
      } else if (isComplete) {
        setIrrigateStep("done");
        setIrrigateLog((prev) => [
          ...prev,
          `🎉 THÀNH CÔNG: Cả 2 Cảm biến độ ẩm đã đạt chỉ số mục tiêu (≥ ${targetMoisture}%)! Đã ngắt bơm tưới.`,
        ]);
        triggerQuickAction("✅ Đã hoàn tất quy trình tưới phân: Đạt độ ẩm mục tiêu!");
      } else {
        setIrrigateStep("done");
        setIrrigateLog((prev) => [
          ...prev,
          "✅ Đã hoàn thành chu kỳ tưới phân bón theo thiết lập!",
        ]);
        triggerQuickAction("✅ Đã hoàn thành chu kỳ tưới phân bón!");
      }
    } catch (err: any) {
      setIrrigateLog((prev) => [...prev, `❌ Lỗi kết nối phần cứng: ${err.message}`]);
    } finally {
      setIsIrrigating(false);
    }
  };

  return (
    <div className="space-y-lg max-w-[1600px] mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md border-b border-outline-variant/15 pb-md">
        <div>
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-4xl">science</span>
            <div>
              <h2 className="font-display-lg text-display-lg font-bold text-primary">
                Quản Lý Bình Phân Bón & Bơm Tưới
              </h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant">
                Quản lý 4 bình phân bón (Bình A, B, C, D) kết nối trực tiếp với ESP32 (Giới hạn tối đa 6ml/bình, lưu tại <code className="font-mono text-xs text-primary">data/fertilizers.json</code>)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Action Button: Tưới Phân (Thay thế nút Ping) */}
          <button
            onClick={() => {
              setIrrigateStep("idle");
              setIrrigateLog([]);
              setShowIrrigateModal(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-body-lg font-bold transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 border border-emerald-500/30"
          >
            <span className="material-symbols-outlined text-xl">water_drop</span>
            Tưới Phân
          </button>

          {/* Action Button: Thêm Bình Phân */}
          <button
            onClick={() => handleOpenAddModal()}
            disabled={fertilizers.length >= 4}
            className="bg-primary text-on-primary px-5 py-3 rounded-xl font-body-lg font-semibold hover:bg-primary-container transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            <span className="material-symbols-outlined">add</span>
            Thêm bình phân mới ({fertilizers.length}/4)
          </button>
        </div>
      </div>

      {/* 4 Fixed Tank Slots Grid (Bình A, Bình B, Bình C, Bình D) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
        {TANK_CODES.map((code) => {
          const fert = fertilizers.find((f: any) => f.tankCode === code);

          if (fert) {
            const cap = 6;
            const cur = fert.currentMl ?? cap;
            const percent = Math.min(100, Math.round((cur / cap) * 100));

            return (
              <div
                key={fert.id}
                className="bg-surface rounded-2xl p-md card-shadow border border-outline-variant/20 hover:border-primary/40 transition-all flex flex-col justify-between group relative overflow-hidden"
              >
                <div>
                  <div className="flex justify-between items-start mb-sm">
                    <span className="px-3 py-1 rounded-xl bg-primary/10 text-primary font-mono text-xs font-bold border border-primary/20">
                      {code}
                    </span>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditClick(fert)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
                        title="Chỉnh sửa thông tin"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button
                        onClick={() => handleDeleteClick(fert.id, code)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
                        title="Xóa bình phân"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  </div>

                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mb-1">
                    {fert.name}
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    Ngày thêm: {fert.addedDate || "Hôm nay"}
                  </p>

                  <div className="mt-md space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-on-surface-variant">Lượng phân bón</span>
                      <span className="font-mono text-primary font-bold">
                        {cur} ml / 6 ml ({percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-surface-container-high rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all duration-500 ${
                          percent < 20
                            ? "bg-rose-500"
                            : percent < 50
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-md pt-sm border-t border-outline-variant/15 flex justify-between items-center text-xs">
                  <span className="text-on-surface-variant font-medium">Trạng thái bơm</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] ${
                      percent <= 0
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                        : percent < 20
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    }`}
                  >
                    {percent <= 0 ? "Hết phân" : percent < 20 ? "Cần thêm" : "Sẵn sàng"}
                  </span>
                </div>
              </div>
            );
          } else {
            return (
              <div
                key={code}
                onClick={() => handleOpenAddModal(code)}
                className="group border-2 border-dashed border-outline-variant/50 hover:border-primary/60 rounded-2xl p-md flex flex-col items-center justify-center min-h-[220px] cursor-pointer transition-all bg-surface-container-lowest hover:bg-primary/5 shadow-xs hover:shadow-md text-center space-y-3"
              >
                <span className="px-3 py-1 rounded-xl bg-surface-container-high text-on-surface-variant font-mono text-xs font-bold border border-outline-variant/30">
                  {code}
                </span>

                <div className="w-14 h-14 rounded-2xl bg-primary/10 group-hover:bg-primary group-hover:text-on-primary text-primary flex items-center justify-center transition-all duration-300 transform group-hover:scale-110 shadow-sm">
                  <span className="material-symbols-outlined text-3xl font-bold">add</span>
                </div>

                <div>
                  <h4 className="font-headline-sm text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                    Thêm phân bón cho {code}
                  </h4>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Nhấn vào đây để nhập thông tin (Tối đa 6ml)
                  </p>
                </div>
              </div>
            );
          }
        })}
      </div>

      {/* MODAL TƯỚI PHÂN POPUP (2 TABS: TÙY CHỈNH vs AI) VIA PORTAL */}
      {showIrrigateModal &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            <div className="bg-surface rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-outline-variant/30 space-y-5 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col justify-between">
              {/* Modal Title Bar */}
              <div className="flex justify-between items-center pb-3 border-b border-outline-variant/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl">water_drop</span>
                  </div>
                  <div>
                    <h3 className="font-headline-md text-xl font-bold text-on-surface">
                      Hệ Thống Tưới Phân Sinh Học ESP32
                    </h3>
                    <p className="text-xs text-on-surface-variant">
                      Điều khiển bơm trích xuất phân, bơm giếng và giám sát 2 Cảm biến độ ẩm
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIrrigateModal(false)}
                  disabled={isIrrigating}
                  className="text-on-surface-variant hover:text-primary p-2 rounded-xl hover:bg-surface-container-high transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Real-time Hardware Sensors Bar */}
              <div className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/30 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-surface rounded-xl p-2.5 border border-outline-variant/20">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">
                    CẢM BIẾN ĐỘ ẨM 1
                  </span>
                  <span className="font-mono text-base font-bold text-emerald-600">
                    {espSensors.soil1Percent}%
                  </span>
                  <span className="text-[10px] text-zinc-400 block font-mono">
                    (Raw: {espSensors.soil1Raw})
                  </span>
                </div>

                <div className="bg-surface rounded-xl p-2.5 border border-outline-variant/20">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">
                    CẢM BIẾN ĐỘ ẨM 2
                  </span>
                  <span className="font-mono text-base font-bold text-emerald-600">
                    {espSensors.soil2Percent}%
                  </span>
                  <span className="text-[10px] text-zinc-400 block font-mono">
                    (Raw: {espSensors.soil2Raw})
                  </span>
                </div>

                <div className="bg-surface rounded-xl p-2.5 border border-outline-variant/20">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">
                    PHAO CAO (NƯỚC ĐẦY)
                  </span>
                  <span
                    className={`font-bold text-xs px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                      espSensors.floatHigh
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-zinc-100 text-zinc-600 border border-zinc-300"
                    }`}
                  >
                    {espSensors.floatHigh ? "ĐẦY BỒN" : "CHƯA ĐẦY"}
                  </span>
                </div>

                <div className="bg-surface rounded-xl p-2.5 border border-outline-variant/20">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">
                    PHAO THẤP (NƯỚC CẠN)
                  </span>
                  <span
                    className={`font-bold text-xs px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                      espSensors.floatLow
                        ? "bg-rose-100 text-rose-800 border border-rose-300 animate-pulse"
                        : "bg-zinc-100 text-zinc-600 border border-zinc-300"
                    }`}
                  >
                    {espSensors.floatLow ? "CẠN BỒN" : "BÌNH THƯỜNG"}
                  </span>
                </div>
              </div>

              {/* 2 Tabs Header */}
              <div className="flex bg-surface-container-high p-1 rounded-2xl border border-outline-variant/20">
                <button
                  onClick={() => setIrrigateTab("custom")}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                    irrigateTab === "custom"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">tune</span>
                  Tab 1: Tưới phân tùy chỉnh
                </button>
                <button
                  onClick={() => setIrrigateTab("ai")}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                    irrigateTab === "ai"
                      ? "bg-primary text-on-primary shadow-sm"
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
                    Tích chọn các bình phân đã cấu hình để chọn lượng phân (ml) cần trích xuất:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {TANK_CODES.map((code) => {
                      const fert = fertilizers.find((f: any) => f.tankCode === code);
                      const item = selectedTanks[code] || { selected: false, ml: 2.0 };

                      return (
                        <div
                          key={code}
                          className={`p-3 rounded-2xl border transition-all ${
                            item.selected
                              ? "bg-primary/10 border-primary shadow-sm"
                              : "bg-surface-container-low border-outline-variant/30 opacity-70"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <label className="flex items-center gap-2.5 cursor-pointer font-bold text-sm text-on-surface">
                              <input
                                type="checkbox"
                                checked={item.selected}
                                disabled={!fert || isIrrigating}
                                onChange={() => handleToggleTank(code)}
                                className="w-4 h-4 rounded text-primary focus:ring-primary"
                              />
                              <span className="font-mono text-primary font-bold">{code}</span>
                              <span className="text-xs truncate max-w-[120px]">
                                {fert ? fert.name : "(Chưa thêm)"}
                              </span>
                            </label>
                          </div>

                          {item.selected && fert && (
                            <div className="mt-2 pt-2 border-t border-primary/20 flex items-center justify-between gap-2">
                              <span className="text-xs text-on-surface-variant font-semibold">
                                Lượng phân cần trích xuất:
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
                      <div className="p-2 bg-surface rounded-xl border border-outline-variant/30 flex justify-between">
                        <span>Bình A (Đạm hữu cơ):</span>
                        <span className="text-emerald-600">
                          {espSensors.avgSoilPercent < 40 ? "3.0 ml" : "1.5 ml"}
                        </span>
                      </div>
                      <div className="p-2 bg-surface rounded-xl border border-outline-variant/30 flex justify-between">
                        <span>Bình B (Amino & Min):</span>
                        <span className="text-emerald-600">
                          {espSensors.avgSoilPercent < 40 ? "2.0 ml" : "1.0 ml"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Execution Progress & Hardware Logs Box */}
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

              {/* Modal Footer Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-outline-variant/15">
                <button
                  type="button"
                  onClick={() => setShowIrrigateModal(false)}
                  disabled={isIrrigating}
                  className="px-4 py-2.5 rounded-xl text-body-sm font-semibold border border-outline-variant text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
                >
                  Đóng
                </button>

                <button
                  type="button"
                  onClick={() => handleStartIrrigation(irrigateTab === "ai")}
                  disabled={isIrrigating}
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
          </div>,
          document.body
        )}

      {/* Add / Edit Fertilizer Modal via Portal */}
      {showAddModal &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-md">
            <div className="bg-surface rounded-2xl p-lg max-w-md w-full shadow-2xl border border-outline-variant/30 space-y-md animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center">
                <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                  {editingFert ? "Chỉnh Sửa Bình Phân" : `Thêm Bình Phân Bón (${tankCode})`}
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-on-surface-variant hover:text-primary p-1 rounded-lg hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 bg-error/10 border border-error/20 rounded-xl text-error text-xs font-semibold">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-md">
                <div>
                  <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 font-semibold">
                    MÃ BÌNH PHÂN
                  </label>
                  <select
                    value={tankCode}
                    onChange={(e) => setTankCode(e.target.value)}
                    disabled={!!editingFert}
                    className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-body-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono font-bold"
                  >
                    {TANK_CODES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 font-semibold">
                    TÊN LOẠI PHÂN BÓN
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Phân NPK Thủy Canh"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 font-semibold">
                    LƯỢNG PHÂN (TỐI ĐA 6ML)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={6}
                    step={0.1}
                    value={currentMl}
                    onChange={(e) => setCurrentMl(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-body-sm focus:outline-none focus:ring-1 focus:ring-primary font-mono font-bold text-primary"
                  />
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    Nhập dung tích từ 0 đến 6 ml
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-xs">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl text-body-sm font-semibold border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-body-sm font-semibold bg-primary text-on-primary hover:bg-primary-container shadow-xs"
                  >
                    {editingFert ? "Cập nhật" : "Xác nhận thêm"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
