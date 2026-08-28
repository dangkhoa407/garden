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

  // AI Scan & Analysis State
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [aiAnalysisDone, setAiAnalysisDone] = useState(false);
  const [aiStatusMsg, setAiStatusMsg] = useState("");
  const [capturedImages, setCapturedImages] = useState<
    { trayName: string; imageBase64: string }[]
  >([]);
  const [aiOverallAssessment, setAiOverallAssessment] = useState<string>("");
  const [aiRecommendations, setAiRecommendations] = useState<
    { tankCode: string; name: string; ml: number; reason: string; selected: boolean }[]
  >([]);
  const [rawAiResponse, setRawAiResponse] = useState<string>("");
  const [rawRequestPayload, setRawRequestPayload] = useState<string>("");
  const [aiModelName, setAiModelName] = useState<string>("gemini-3.5-flash-lite");

  const [selectedPreviewImage, setSelectedPreviewImage] = useState<{
    trayName: string;
    imageBase64: string;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [plantedCount, setPlantedCount] = useState<number>(0);

  // Reset state & Fetch fertilizers & plants list from server whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    setCapturedImages([]);
    setAiAnalysisDone(false);
    setAiOverallAssessment("");
    setAiRecommendations([]);
    setRawAiResponse("");
    setRawRequestPayload("");

    const fetchFertilizersAndPlants = async () => {
      try {
        const [fRes, pRes] = await Promise.all([
          fetch("/api/fertilizers"),
          fetch("/api/plants"),
        ]);

        if (fRes.ok) {
          const data = await fRes.json();
          if (Array.isArray(data)) setActiveFertilizers(data);
        }

        if (pRes.ok) {
          const data = await pRes.json();
          if (Array.isArray(data)) setPlantedCount(data.length);
        }
      } catch (err) { }
    };

    fetchFertilizersAndPlants();
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
      } catch (err) { }
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

  const handleRunAiAnalysis = async () => {
    setIsAnalyzingAi(true);
    setCapturedImages([]);
    setAiAnalysisDone(false);
    setAiOverallAssessment("");
    setAiStatusMsg(`🤖 Đang kiểm tra danh sách các vị trí khay cây...`);

    try {
      // 1. Lấy danh sách cây trong /plants
      const plantsRes = await fetch("/api/plants");
      const plantsData = await plantsRes.json();
      const plantsList = Array.isArray(plantsData) ? plantsData : (plantsData.plants || []);

      const pointIndexes: number[] = Array.from(new Set<number>(
        plantsList
          .filter((p: any) => p && p.location)
          .map((p: any) => {
            const m = String(p.location).match(/\d+/);
            return m ? parseInt(m[0], 10) - 1 : -1;
          })
          .filter((idx: number) => idx >= 0 && idx <= 5)
      )).sort((a: number, b: number) => a - b);

      if (pointIndexes.length === 0) {
        alert("Chưa có vị trí cây nào được gieo trồng trong Vườn. Vui lòng thêm cây trước!");
        setIsAnalyzingAi(false);
        return;
      }

      // 2. Homing robot trước khi di chuyển
      setAiStatusMsg(`🏠 Đang đưa robot về vị trí gốc (Homing)...`);
      await fetch("/api/ai/scan-homing", { method: "POST" }).catch(() => {});

      // 3. Lần lượt gửi request quét đơn lẻ từng khay một (mỗi request chỉ mất 3-4s, KHÔNG BAO GIỜ TIMEOUT)
      const collectedImages: any[] = [];
      const total = pointIndexes.length;

      for (let i = 0; i < total; i++) {
        const pointIdx = pointIndexes[i];
        const trayLabel = `Khay ${String(pointIdx + 1).padStart(2, "0")}`;
        setAiStatusMsg(`📸 Đang di chuyển & chụp ảnh ${trayLabel} (${i + 1}/${total})...`);

        const trayRes = await fetch("/api/ai/scan-single-tray", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pointIdx, totalTrays: total, currentStep: i + 1 }),
        });

        const trayText = await trayRes.text();
        let trayData: any = {};
        try { trayData = JSON.parse(trayText); } catch {
          trayData = { success: false, error: trayText || `Lỗi di chuyển/chụp tại ${trayLabel}` };
        }

        if (!trayRes.ok || !trayData.success || !trayData.capturedImage) {
          throw new Error(trayData.error || `Lỗi chụp ảnh tại ${trayLabel}`);
        }

        collectedImages.push(trayData.capturedImage);
        setCapturedImages([...collectedImages]);
      }

      // 4. CHỤP XONG CÂY CUỐI CÙNG! Chuyển qua gửi toàn bộ dữ liệu ảnh lên Gemini AI
      const lastTrayLabel = `Khay ${String(pointIndexes[total - 1] + 1).padStart(2, "0")}`;
      setAiStatusMsg(`📸 Đã chụp xong cây cuối cùng (${lastTrayLabel})! Đang gửi dữ liệu lên Gemini AI để phân tích...`);

      const res = await fetch("/api/ai/fertilize-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capturedImages: collectedImages }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { success: false, error: text || "Lỗi máy chủ (Invalid JSON)" };
      }

      if (res.ok && data.success && Array.isArray(data.recommendations)) {
        if (data.capturedImages && Array.isArray(data.capturedImages)) {
          setCapturedImages(data.capturedImages);
        }

        if (data.overallAssessment) {
          setAiOverallAssessment(data.overallAssessment);
        }

        if (data.aiModel) {
          setAiModelName(data.aiModel);
        }

        if (data.requestPayload) {
          setRawRequestPayload(
            typeof data.requestPayload === "string"
              ? data.requestPayload
              : JSON.stringify(data.requestPayload, null, 2)
          );
        }

        if (data.rawResponse) {
          setRawAiResponse(data.rawResponse);
        } else {
          setRawAiResponse(JSON.stringify(data.recommendations, null, 2));
        }

        const recs = data.recommendations.map((r: any) => ({
          tankCode: r.tankCode,
          name: r.name || "Phân bón sinh học",
          ml: Number(r.ml) || 2.0,
          reason: r.reason || "AI khuyến nghị dựa trên phân tích hình ảnh thực tế cây trồng.",
          selected: true,
        }));

        setAiRecommendations(recs);

        // Đồng bộ với selectedTanks
        setSelectedTanks((prev) => {
          const next = { ...prev };
          recs.forEach((item: any) => {
            next[item.tankCode] = { selected: true, ml: item.ml };
          });
          return next;
        });

        setAiAnalysisDone(true);
      } else {
        alert(data.error || "Không thể thực hiện phân tích AI.");
      }
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi kết nối với máy chủ: " + err.message);
    } finally {
      setIsAnalyzingAi(false);
      setAiStatusMsg("");
    }
  };

  const handleToggleAiTank = (tankCode: string) => {
    setAiRecommendations((prev) =>
      prev.map((item) =>
        item.tankCode === tankCode ? { ...item, selected: !item.selected } : item
      )
    );
    setSelectedTanks((prev) => ({
      ...prev,
      [tankCode]: {
        selected: !prev[tankCode]?.selected,
        ml: prev[tankCode]?.ml || 2.0,
      },
    }));
  };

  const handleAiMlChange = (tankCode: string, ml: number) => {
    const val = Math.max(0.1, Number(ml) || 0.1);
    setAiRecommendations((prev) =>
      prev.map((item) => (item.tankCode === tankCode ? { ...item, ml: val } : item))
    );
    setSelectedTanks((prev) => ({
      ...prev,
      [tankCode]: {
        selected: prev[tankCode]?.selected ?? true,
        ml: val,
      },
    }));
  };

  const handleStartIrrigation = async (isAiMode: boolean = false) => {
    setIsIrrigating(true);
    setIrrigateLog([]);
    setIrrigateStep("dose");

    const tanksToDose: { tankCode: string; ml: number }[] = [];

    if (isAiMode) {
      if (aiRecommendations.length > 0) {
        aiRecommendations.forEach((r) => {
          if (r.selected) {
            tanksToDose.push({ tankCode: r.tankCode, ml: r.ml });
          }
        });
      }
    } else {
      availableTanks.forEach((code) => {
        if (selectedTanks[code]?.selected) {
          tanksToDose.push({ tankCode: code, ml: selectedTanks[code].ml });
        }
      });
    }

    // Kiểm tra lượng phân bón trong từng bình trước khi trích xuất (nếu có bình phân được chọn)
    if (tanksToDose.length > 0) {
      let currentFertilizersList: any[] = activeFertilizers || [];
      try {
        const fRes = await fetch("/api/fertilizers");
        if (fRes.ok) {
          const freshList = await fRes.json();
          if (Array.isArray(freshList)) currentFertilizersList = freshList;
        }
      } catch (e) { }

      let insufficientTank: { name: string; tankCode: string; required: number; remaining: number } | null = null;

      for (const t of tanksToDose) {
        const fertItem = currentFertilizersList.find(
          (f) => f.tankCode === t.tankCode || f.name === t.tankCode || f.code === t.tankCode
        );
        const remainingMl = fertItem
          ? fertItem.currentMl !== undefined
            ? Number(fertItem.currentMl)
            : Number(fertItem.capacityMl || 0)
          : 0;

        if (remainingMl < t.ml) {
          insufficientTank = {
            name: fertItem?.name || t.tankCode,
            tankCode: t.tankCode,
            required: t.ml,
            remaining: remainingMl,
          };
          break;
        }
      }

      if (insufficientTank) {
        setIsIrrigating(false);
        setIrrigateStep("idle");
        alert(
          `⚠️ KHÔNG THỂ TRÍCH XUẤT PHÂN BÓN!\n\n` +
          `Bình phân [${insufficientTank.tankCode} - ${insufficientTank.name}] hiện chỉ còn ${insufficientTank.remaining} ml.\n` +
          `Lượng phân cần trích xuất: ${insufficientTank.required} ml.\n\n` +
          `Lượng phân trong bình không đủ để trích xuất! Vui lòng châm thêm phân bón trước khi thực hiện.`
        );
        return;
      }
    }

    let estDurationSec = 20;
    if (tanksToDose.length > 0) {
      tanksToDose.forEach((t) => {
        estDurationSec += Math.max(2, Math.round((t.ml * 10) / 6));
      });
    }

    if (onStartIrrigation) {
      onStartIrrigation(estDurationSec);
    }
    onClose();

    // Helper gửi thông báo Telegram
    const sendTelegramAlert = async (textMsg: string) => {
      try {
        await fetch("/api/telegram/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: textMsg }),
        });
      } catch (e) { }
    };

    try {
      let cycleCount = 0;
      let targetReached = false;
      const MAX_CYCLES = 10;

      while (!targetReached && cycleCount < MAX_CYCLES) {
        cycleCount++;
        setIrrigateLog((prev) => [
          ...prev,
          `🔄 === BẮT ĐẦU CHU KỲ PHA & TƯỚI LẦN ${cycleCount} ===`,
        ]);

        // 1. KIỂM TRẢ DUNG TÍCH BÌNH PHÂN XEM CÓ ĐỦ TRÍCH XUẤT KHÔNG (nếu có bình phân được chọn)
        if (tanksToDose.length > 0) {
          let currentFertilizersList: any[] = [];
          try {
            const fRes = await fetch("/api/fertilizers");
            if (fRes.ok) currentFertilizersList = await fRes.json();
          } catch (e) { }

          let insufficientTank: { tankCode: string; required: number; remaining: number } | null = null;

          for (const t of tanksToDose) {
            const fertItem = currentFertilizersList.find(
              (f) => f.tankCode === t.tankCode || f.name === t.tankCode
            );
            const remainingMl = fertItem
              ? fertItem.currentMl !== undefined
                ? fertItem.currentMl
                : fertItem.capacityMl || 0
              : 999;

            if (remainingMl < t.ml) {
              insufficientTank = {
                tankCode: t.tankCode,
                required: t.ml,
                remaining: remainingMl,
              };
              break;
            }
          }

          // Nếu phân không đủ để trích xuất -> Dừng lại và gửi cảnh báo Web + Telegram
          if (insufficientTank) {
            const alertMsg = `⚠️ CẢNH BÁO TƯỚI PHÂN (GROW HUB):\nBình [${insufficientTank.tankCode}] chỉ còn ${insufficientTank.remaining}ml, KHÔNG ĐỦ để trích xuất ${insufficientTank.required}ml!\n👉 Hệ thống đã TỰ ĐỘNG DỪNG chu trình tưới phân bón để bảo vệ hệ thống.`;

            setIrrigateLog((prev) => [
              ...prev,
              `❌ HẾT PHÂN BÓN: ${insufficientTank.tankCode} chỉ còn ${insufficientTank.remaining}ml (Không đủ trích xuất ${insufficientTank.required}ml)!`,
              `📢 Đã gửi cảnh báo tới hệ thống Web và Bot Telegram!`,
            ]);

            await sendTelegramAlert(alertMsg);

            // Ngắt các bơm đảm bảo an toàn
            await fetch("/api/esp32/command", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ command: "WATER OFF" }),
            });
            await fetch("/api/esp32/command", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ command: "WELL OFF" }),
            });

            setIsIrrigating(false);
            setIrrigateStep("idle");
            return;
          }
        }

        // 2. TRÍCH XUẤT PHÂN BÓN (DOSE)
        setIrrigateStep("dose");
        if (tanksToDose.length > 0) {
          for (const t of tanksToDose) {
            const expectedSec = Math.round(t.ml * 60);
            setIrrigateLog((prev) => [
              ...prev,
              `🧪 DOSE: Bơm ${t.ml}ml từ ${t.tankCode} (Dự kiến: ${expectedSec}s)...`,
            ]);
            const res = await fetch("/api/esp32/dose", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tankCode: t.tankCode, ml: t.ml }),
            });
            const data = await res.json();
            const actualSec = data.durationSec || expectedSec;

            await new Promise((r) => setTimeout(r, actualSec * 1000 + 500));
          }
        } else {
          setIrrigateLog((prev) => [
            ...prev,
            "ℹ️ Không chọn/đề xuất bình phân nào: Bỏ qua kích hoạt bơm nhu động.",
          ]);
        }

        // 3. BƠM NƯỚC GIẾNG VÀO BỒN TRỘN (WELL ON - ĐỢI PHAO CAO BẬT)
        setIrrigateStep("well");
        setIrrigateLog((prev) => [
          ...prev,
          "💧 WELL ON: Đang bật bơm giếng nạp nước vào bồn trộn cho tới khi phao cao bật...",
        ]);

        await fetch("/api/esp32/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "WELL ON" }),
        });

        let floatHighTriggered = false;
        for (let i = 0; i < 20; i++) {
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
          } catch (e) { }
        }

        if (!floatHighTriggered) {
          setIrrigateLog((prev) => [
            ...prev,
            "⚠️ Ngắt bơm giếng để chuyển tiếp bước tưới...",
          ]);
          await fetch("/api/esp32/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "WELL OFF" }),
          });
        }

        // 4. TƯỚI PHÂN VÀO VƯỜN (WATER ON - ĐẾN KHỦ ĐỘ ẨM HOẶC PHAO THẤP BẬT)
        setIrrigateStep("water");
        setIrrigateLog((prev) => [
          ...prev,
          `🌿 WATER ON: Bật bơm tưới vườn... (Đạt ${targetMoisture}% sẽ ngắt)`,
        ]);

        await fetch("/api/esp32/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "WATER ON" }),
        });

        let floatLowTriggered = false;

        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const sRes = await fetch("/api/esp32/sensors");
            if (sRes.ok) {
              const sData = await sRes.json();
              const sensors = sData.sensors;
              const currentAvg = sensors?.avgSoilPercent || 0;

              if (currentAvg >= targetMoisture) {
                targetReached = true;
                setIrrigateLog((prev) => [
                  ...prev,
                  `🎉 THÀNH CÔNG: Độ ẩm đất đã đạt mục tiêu ${currentAvg}% >= ${targetMoisture}%!`,
                ]);
                break;
              }

              if (sensors?.floatLow) {
                floatLowTriggered = true;
                setIrrigateLog((prev) => [
                  ...prev,
                  `⚠️ Phao đáy báo cạn nước trong bồn, nhưng độ ẩm đất (${currentAvg}%) chưa đạt ${targetMoisture}%. Chuẩn bị lặp lại quy trình pha phân & nạp nước mới...`,
                ]);
                break;
              }
            }
          } catch (e) { }
        }

        // Tắt bơm tưới
        await fetch("/api/esp32/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "WATER OFF" }),
        });

        if (targetReached) {
          break;
        }

        if (!floatLowTriggered && !targetReached) {
          setIrrigateLog((prev) => [
            ...prev,
            "⏹️ Đã hết chu trình tưới vườn hiện tại.",
          ]);
          break;
        }
      }

      setIrrigateStep("done");
      setIrrigateLog((prev) => [
        ...prev,
        targetReached
          ? "✅ Đã hoàn thành toàn bộ quá trình tưới phân bón và đạt độ ẩm mục tiêu!"
          : "⏹️ Đã dừng chu kỳ tưới phân bón.",
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
                Hệ Thống Tưới Phân Bón Tự Động
              </h3>
              <p className="text-xs text-on-surface-variant">
                Quy trình 3 bước: Trích xuất phân → Nạp nước bồn → Tưới vườn
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
          {/* 2 Tabs Header */}
          <div className="flex bg-surface-container-high p-1 rounded-2xl border border-outline-variant/30">
            <button
              type="button"
              onClick={() => setIrrigateTab("custom")}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${irrigateTab === "custom"
                ? "bg-surface text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
                }`}
            >
              <span className="material-symbols-outlined text-lg">tune</span>
              Tưới phân tùy chỉnh
            </button>
            <button
              type="button"
              onClick={() => setIrrigateTab("ai")}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${irrigateTab === "ai"
                ? "bg-surface text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
                }`}
            >
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
              Tưới phân bằng AI
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
                        className={`p-3.5 rounded-2xl border transition-all ${item.selected
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary font-bold text-sm">
                    <span className="material-symbols-outlined text-xl">psychology</span>
                    AI Phân Tích Dinh Dưỡng Cây Trồng
                  </div>
                  {aiAnalysisDone && (
                    <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-[11px] font-mono font-bold">
                      ✨ Đã phân tích thành công
                    </span>
                  )}
                </div>

                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Hệ thống sẽ di chuyển camera đến các vị trí cây trồng trong vườn để phân tích dữ liệu dinh dưỡng.
                </p>

                {/* Scan & Analyze Action Button */}
                <button
                  type="button"
                  onClick={handleRunAiAnalysis}
                  disabled={isAnalyzingAi || isIrrigating}
                  className="w-full py-3 rounded-xl bg-primary text-white font-bold text-xs shadow-md hover:bg-primary/90 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isAnalyzingAi ? (
                    <>
                      <span className="material-symbols-outlined text-lg animate-spin">
                        progress_activity
                      </span>
                      <span>{aiStatusMsg || "Đang di chuyển camera & phân tích Gemini AI..."}</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">auto_awesome</span>
                      <span>
                        {aiAnalysisDone
                          ? `Quét Lại ${plantedCount > 0 ? `${plantedCount} Vị Trí Cây` : "Các Vị Trí Cây"} & Phân Tích Lại Bằng AI`
                          : `Bắt Đầu Quét ${plantedCount > 0 ? `${plantedCount} Vị Trí Cây` : "Các Vị Trí Cây"} & Phân Tích Gemini AI`}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* Display Captured Plant Images Gallery */}
              {capturedImages.length > 0 && (
                <div className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-on-surface font-bold text-xs">
                      <span className="material-symbols-outlined text-primary text-base">
                        photo_camera
                      </span>
                      <span>Hình ảnh phân tích ({capturedImages.length} ảnh):</span>
                    </div>

                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {capturedImages.map((img, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedPreviewImage(img)}
                        className="relative rounded-xl overflow-hidden border border-outline-variant/40 bg-black/80 shadow-sm group cursor-pointer hover:border-primary transition-all duration-200"
                      >
                        <img
                          src={img.imageBase64}
                          alt={img.trayName}
                          className="w-full h-32 object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="material-symbols-outlined text-white text-2xl drop-shadow-md">
                            zoom_in
                          </span>
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 text-white flex items-center justify-between">
                          <span className="text-[11px] font-bold text-emerald-300">{img.trayName}</span>
                          <span className="text-[9px] bg-primary/80 text-white px-1.5 py-0.5 rounded font-mono font-medium">
                            Xem Ảnh
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Display Real AI Overall Assessment from Gemini */}
              {aiAnalysisDone && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <span className="material-symbols-outlined text-lg">psychology</span>
                    <span>Đánh Giá Tổng Quan Từ AI:</span>
                  </div>
                  <p className="text-xs text-on-surface leading-relaxed font-medium">
                    {aiOverallAssessment || "Gemini AI đã hoàn tất phân tích tổng thể hình ảnh từ camera."}
                  </p>
                </div>
              )}

              {aiAnalysisDone && aiRecommendations.length === 0 && (
                <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-center text-xs text-on-surface-variant font-medium">
                  Hiện tại AI chưa đề xuất bổ sung thêm loại phân bón nào cho chu kỳ này.
                </div>
              )}

              {aiRecommendations.length > 0 && (
                <div className="space-y-3 pt-1">
                  <h4 className="text-xs font-bold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-emerald-600 text-base">
                      playlist_add_check
                    </span>
                    ĐỀ XUẤT TỪ AI:
                  </h4>

                  <div className="space-y-2.5">
                    {aiRecommendations.map((item) => (
                      <div
                        key={item.tankCode}
                        className={`p-3.5 rounded-2xl border transition-all ${item.selected
                          ? "bg-primary/10 border-primary shadow-sm"
                          : "bg-surface-container-low border-outline-variant/30 opacity-70"
                          }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="flex items-center gap-2.5 cursor-pointer font-bold text-sm text-on-surface">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              disabled={isIrrigating}
                              onChange={() => handleToggleAiTank(item.tankCode)}
                              className="w-4.5 h-4.5 rounded text-primary focus:ring-primary"
                            />
                            <span className="font-mono text-primary font-bold">
                              {item.tankCode}
                            </span>
                            <span className="text-xs text-emerald-600 font-bold truncate max-w-[140px]">
                              ({item.name})
                            </span>
                          </label>

                          {item.selected && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-on-surface-variant font-semibold">
                                Liều lượng:
                              </span>
                              <input
                                type="number"
                                min={0.1}
                                max={10}
                                step={0.5}
                                disabled={isIrrigating}
                                value={item.ml}
                                onChange={(e) =>
                                  handleAiMlChange(item.tankCode, Number(e.target.value))
                                }
                                className="w-20 px-2 py-1 bg-surface border border-primary/40 rounded-xl font-mono text-sm font-bold text-primary text-center focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <span className="text-xs font-mono font-bold text-on-surface-variant">
                                ml
                              </span>
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-on-surface-variant italic pl-7 border-l-2 border-primary/30 mt-1">
                          💡 AI: {item.reason}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between bg-surface-container-low p-3 rounded-xl border border-outline-variant/20 mt-2">
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

      {/* Lightbox Modal for Full Resolution Photo Preview */}
      {selectedPreviewImage && (
        <div
          onClick={() => setSelectedPreviewImage(null)}
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-surface rounded-2xl overflow-hidden shadow-2xl border border-outline-variant/40 flex flex-col"
          >
            <div className="p-3 bg-black/60 backdrop-blur-md flex items-center justify-between text-white border-b border-white/10">
              <div className="flex items-center gap-2 font-bold text-emerald-400 text-sm">
                <span className="material-symbols-outlined text-base">photo_camera</span>
                <span>{selectedPreviewImage.trayName} - Ảnh Chụp Từ Camera Thật (Flash ON)</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPreviewImage(null)}
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <div className="relative bg-black flex items-center justify-center p-2">
              <img
                src={selectedPreviewImage.imageBase64}
                alt={selectedPreviewImage.trayName}
                className="max-h-[75vh] w-auto object-contain rounded-lg shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
