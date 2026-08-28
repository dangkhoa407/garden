"use client";

import { useState, useEffect, useRef } from "react";

interface CapturedImage {
  trayName?: string;
  imageBase64?: string;
  filePath?: string;
}

interface PendingSchedule {
  id: string;
  scheduleId?: string;
  title: string;
  actionType: string;
  overallAssessment?: string;
  recommendations?: Array<{
    tankCode: string;
    name?: string;
    ml: number;
    reason?: string;
  }>;
  capturedImages?: CapturedImage[];
  customDosages?: Array<{
    tankCode: string;
    ml: number;
  }>;
  timestamp: string;
  status: "pending" | "executing" | "completed";
  createdAt?: number;
}

interface Fertilizer {
  id: string;
  name: string;
  tankCode: string;
  capacityMl: number;
  currentMl: number;
  status: string;
}

export function ScheduleConfirmModal() {
  const [pendingItem, setPendingItem] = useState<PendingSchedule | null>(null);
  const [fertilizers, setFertilizers] = useState<Fertilizer[]>([]);
  const [selectedTanks, setSelectedTanks] = useState<Record<string, { enabled: boolean; ml: number }>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeStep, setExecuteStep] = useState<"idle" | "dose" | "well" | "water" | "done">("idle");
  const [executeLogs, setExecuteLogs] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number>(60);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);

  const confirmTriggeredRef = useRef(false);

  // Poll for pending schedule confirmation every 3 seconds
  useEffect(() => {
    let isMounted = true;
    const checkPending = async () => {
      try {
        const res = await fetch("/api/schedules/pending");
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            if (data.success && data.item) {
              setPendingItem(data.item);
            } else {
              setPendingItem(null);
            }
          }
        }
      } catch (e) {}
    };

    checkPending();
    const interval = setInterval(checkPending, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Handle 60-second Countdown & Auto confirm
  useEffect(() => {
    if (!pendingItem || isExecuting || isSubmitting) return;

    confirmTriggeredRef.current = false;
    setCountdown(60);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!confirmTriggeredRef.current) {
            confirmTriggeredRef.current = true;
            handleConfirmExecute(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [pendingItem?.id, isExecuting, isSubmitting]);

  // Fetch fertilizers database
  useEffect(() => {
    if (!pendingItem) return;
    fetch("/api/fertilizers")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setFertilizers(data);

          // Initialize selected tanks based on recommendations or custom dosages
          const initialMap: Record<string, { enabled: boolean; ml: number }> = {};
          const recs = pendingItem.recommendations || [];
          const custom = pendingItem.customDosages || [];

          data.forEach((fert) => {
            const recMatch = recs.find((r) => r.tankCode === fert.tankCode || r.tankCode === fert.name);
            const customMatch = custom.find((c) => c.tankCode === fert.tankCode);

            if (recMatch && recMatch.ml > 0) {
              initialMap[fert.tankCode] = { enabled: true, ml: recMatch.ml };
            } else if (customMatch && customMatch.ml > 0) {
              initialMap[fert.tankCode] = { enabled: true, ml: customMatch.ml };
            } else {
              initialMap[fert.tankCode] = { enabled: false, ml: 2.0 };
            }
          });

          setSelectedTanks(initialMap);
        }
      })
      .catch(() => {});
  }, [pendingItem]);

  if (!pendingItem) return null;

  const handleToggleTank = (tankCode: string) => {
    setSelectedTanks((prev) => ({
      ...prev,
      [tankCode]: {
        ...prev[tankCode],
        enabled: !prev[tankCode]?.enabled,
      },
    }));
  };

  const handleUpdateMl = (tankCode: string, delta: number) => {
    setSelectedTanks((prev) => {
      const current = prev[tankCode] || { enabled: true, ml: 2.0 };
      const newMl = Math.max(0.5, Math.min(10, Number((current.ml + delta).toFixed(1))));
      return {
        ...prev,
        [tankCode]: {
          ...current,
          ml: newMl,
        },
      };
    });
  };

  const handleConfirmExecute = async (isAuto = false) => {
    if (isSubmitting || isExecuting) return;
    setIsSubmitting(true);
    setIsExecuting(true);
    setExecuteStep("dose");
    setExecuteLogs([
      isAuto
        ? "⏰ Đã hết 60s chờ xác nhận. Hệ thống TỰ ĐỘNG KÍCH HOẠT chu trình tưới phân bón!"
        : "🚀 Đã xác nhận thủ công từ Web! Bắt đầu chu trình tưới...",
    ]);

    const activeDosages = Object.entries(selectedTanks)
      .filter(([_, val]) => val.enabled && val.ml > 0)
      .map(([tankCode, val]) => ({ tankCode, ml: val.ml }));

    try {
      if (activeDosages.length > 0) {
        setExecuteLogs((prev) => [
          ...prev,
          `🧪 Trích xuất ${activeDosages.length} loại phân bón: ${activeDosages.map((d) => `${d.tankCode} (${d.ml}ml)`).join(", ")}`,
        ]);
        for (const dose of activeDosages) {
          setExecuteLogs((prev) => [...prev, `⚡ Bơm trích xuất ${dose.tankCode}: ${dose.ml}ml...`]);
          await fetch("/api/esp32/dose", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tankCode: dose.tankCode, ml: dose.ml }),
          }).catch(() => {});
          const expectedSec = Math.max(1, Math.round((dose.ml * 10) / 6));
          await new Promise((r) => setTimeout(r, expectedSec * 1000 + 500));
        }
      } else {
        setExecuteLogs((prev) => [
          ...prev,
          "ℹ️ Không có bình phân nào được chọn (Bỏ qua bơm nhu động).",
        ]);
      }

      // Step 2: Well Fill
      setExecuteStep("well");
      setExecuteLogs((prev) => [...prev, "💧 Bật bơm giếng WELL ON nạp nước bồn trộn..."]);
      await fetch("/api/esp32/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "WELL ON" }),
      }).catch(() => {});

      await new Promise((r) => setTimeout(r, 6000));

      await fetch("/api/esp32/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "WELL OFF" }),
      }).catch(() => {});

      // Step 3: Water Garden
      setExecuteStep("water");
      setExecuteLogs((prev) => [...prev, "🌿 Bật bơm tưới WATER ON tưới vườn..."]);
      await fetch("/api/esp32/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "WATER ON" }),
      }).catch(() => {});

      await new Promise((r) => setTimeout(r, 8000));

      await fetch("/api/esp32/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "WATER OFF" }),
      }).catch(() => {});

      setExecuteStep("done");
      setExecuteLogs((prev) => [...prev, "🎉 Hoàn tất chu trình tưới phân bón!"]);

      // Dismiss pending schedule
      await fetch("/api/schedules/pending/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingItem.id }),
      }).catch(() => {});

      setTimeout(() => {
        setPendingItem(null);
        setIsExecuting(false);
        setIsSubmitting(false);
      }, 2000);
    } catch (err: any) {
      setExecuteLogs((prev) => [...prev, `❌ Lỗi thực thi: ${err.message}`]);
      setIsSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await fetch("/api/schedules/pending/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingItem.id }),
      });
      setPendingItem(null);
    } catch (e) {}
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-outline-variant/40 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-primary p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center font-bold text-xl shadow-inner">
              <span className="material-symbols-outlined animate-bounce">alarm</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full font-semibold">
                  TỚI GIỜ LỊCH TRÌNH
                </span>
                <span className="text-xs text-white/80">{pendingItem.timestamp}</span>
              </div>
              <h3 className="text-lg font-bold mt-0.5">{pendingItem.title}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isExecuting && (
              <div className="flex items-center gap-1.5 bg-amber-500/20 text-amber-200 border border-amber-500/30 text-xs px-2.5 py-1 rounded-full font-bold animate-pulse">
                <span className="material-symbols-outlined text-xs">timer</span>
                Tự động xác nhận sau: {countdown}s
              </div>
            )}
            <button
              onClick={handleDismiss}
              disabled={isExecuting}
              className="text-white/80 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* AI Assessment Prompt Card */}
          {pendingItem.overallAssessment && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                <span className="material-symbols-outlined text-emerald-600 text-lg">
                  auto_awesome
                </span>
                Đánh giá tổng quan từ Gemini AI:
              </div>
              <p className="text-sm text-on-surface-variant leading-relaxed font-body">
                {pendingItem.overallAssessment}
              </p>
            </div>
          )}

          {/* Captured Camera Images Gallery */}
          {pendingItem.capturedImages && pendingItem.capturedImages.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-on-surface">
                <span className="flex items-center gap-1.5 text-primary">
                  <span className="material-symbols-outlined text-base">photo_camera</span>
                  Hình ảnh camera thực tế đã quét ({pendingItem.capturedImages.length} vị trí):
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-surface-variant/20 rounded-xl border border-outline-variant/30">
                {pendingItem.capturedImages.map((img, idx) => {
                  const src = img.imageBase64 || (img.filePath ? `/${img.filePath}` : "");
                  return (
                    <div
                      key={idx}
                      onClick={() => src && setSelectedPreviewImage(src)}
                      className="relative group rounded-lg overflow-hidden border border-outline-variant/40 bg-black/20 aspect-video cursor-pointer hover:border-primary transition-all shadow-sm"
                    >
                      {src ? (
                        <img
                          src={src}
                          alt={img.trayName || `Vị trí ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-white/60">
                          Khay {idx + 1}
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1 text-[11px] font-bold text-white text-center truncate">
                        {img.trayName || `Khay ${String(idx + 1).padStart(2, "0")}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Image Preview Lightbox */}
          {selectedPreviewImage && (
            <div
              className="fixed inset-0 z-[10000] bg-black/80 flex items-center justify-center p-4"
              onClick={() => setSelectedPreviewImage(null)}
            >
              <div className="relative max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
                <img
                  src={selectedPreviewImage}
                  alt="Camera Preview"
                  className="w-full h-full object-contain max-h-[80vh]"
                />
                <button
                  onClick={() => setSelectedPreviewImage(null)}
                  className="absolute top-3 right-3 bg-black/60 text-white p-2 rounded-full hover:bg-black transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>
            </div>
          )}

          {/* Execution Progress Bar if currently executing */}
          {isExecuting ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between text-sm font-semibold text-primary">
                <span>Trạng thái thực thi tự động:</span>
                <span className="uppercase text-xs tracking-wider bg-primary/10 px-2.5 py-1 rounded-full">
                  {executeStep}
                </span>
              </div>

              {/* Progress Steps */}
              <div className="grid grid-cols-4 gap-2">
                <div
                  className={`h-2 rounded-full ${
                    executeStep === "dose" || executeStep === "well" || executeStep === "water" || executeStep === "done"
                      ? "bg-primary animate-pulse"
                      : "bg-outline-variant/30"
                  }`}
                />
                <div
                  className={`h-2 rounded-full ${
                    executeStep === "well" || executeStep === "water" || executeStep === "done"
                      ? "bg-primary animate-pulse"
                      : "bg-outline-variant/30"
                  }`}
                />
                <div
                  className={`h-2 rounded-full ${
                    executeStep === "water" || executeStep === "done"
                      ? "bg-primary animate-pulse"
                      : "bg-outline-variant/30"
                  }`}
                />
                <div
                  className={`h-2 rounded-full ${
                    executeStep === "done" ? "bg-emerald-500" : "bg-outline-variant/30"
                  }`}
                />
              </div>

              {/* Live Logs */}
              <div className="bg-surface-variant/40 border border-outline-variant/30 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1 font-mono text-xs text-on-surface">
                {executeLogs.map((log, idx) => (
                  <div key={idx}>{log}</div>
                ))}
              </div>
            </div>
          ) : (
            /* Tank Selection & Dosage Adjustment Controls */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary text-base">
                    vaccines
                  </span>
                  Điều chỉnh lưu lượng phân bón:
                </h4>
                <span className="text-xs text-on-surface-variant">
                  Tự động điền theo đề xuất AI
                </span>
              </div>

              {fertilizers.length === 0 ? (
                <div className="text-center py-4 text-sm text-on-surface-variant">
                  Đang tải danh sách bình phân bón...
                </div>
              ) : (
                <div className="space-y-2.5">
                  {fertilizers.map((fert) => {
                    const state = selectedTanks[fert.tankCode] || { enabled: false, ml: 2.0 };
                    const isAiRecommended = (pendingItem.recommendations || []).some(
                      (r) => (r.tankCode === fert.tankCode || r.tankCode === fert.name) && r.ml > 0
                    );
                    const aiRecObj = (pendingItem.recommendations || []).find(
                      (r) => r.tankCode === fert.tankCode || r.tankCode === fert.name
                    );

                    return (
                      <div
                        key={fert.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          state.enabled
                            ? "bg-primary/5 border-primary/40 shadow-sm"
                            : "bg-surface-variant/20 border-outline-variant/30 opacity-70"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              id={`tank-chk-${fert.id}`}
                              checked={state.enabled}
                              onChange={() => handleToggleTank(fert.tankCode)}
                              className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <label
                                  htmlFor={`tank-chk-${fert.id}`}
                                  className="font-bold text-sm text-on-surface cursor-pointer"
                                >
                                  {fert.tankCode} - {fert.name}
                                </label>
                                {isAiRecommended && (
                                  <span className="bg-emerald-500/20 text-emerald-700 font-semibold text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs">sparkles</span>
                                    AI Đề xuất {aiRecObj?.ml}ml
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-on-surface-variant mt-0.5">
                                Còn {fert.currentMl}ml / {fert.capacityMl}ml
                              </div>
                            </div>
                          </div>

                          {/* ML Adjuster */}
                          {state.enabled && (
                            <div className="flex items-center gap-2 bg-surface border border-outline-variant/40 rounded-lg p-1">
                              <button
                                onClick={() => handleUpdateMl(fert.tankCode, -0.5)}
                                className="w-7 h-7 rounded bg-surface-variant hover:bg-outline-variant/40 text-on-surface flex items-center justify-center font-bold text-sm transition-colors"
                              >
                                -
                              </button>
                              <span className="w-12 text-center font-bold text-sm text-primary">
                                {state.ml} <span className="text-[10px] text-on-surface-variant font-normal">ml</span>
                              </span>
                              <button
                                onClick={() => handleUpdateMl(fert.tankCode, 0.5)}
                                className="w-7 h-7 rounded bg-surface-variant hover:bg-outline-variant/40 text-on-surface flex items-center justify-center font-bold text-sm transition-colors"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>

                        {/* AI Reason string if present */}
                        {isAiRecommended && aiRecObj?.reason && (
                          <div className="text-xs text-emerald-700 bg-emerald-500/10 rounded-lg p-2 mt-2 font-medium">
                            💡 Lý do: {aiRecObj.reason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isExecuting && (
          <div className="p-4 bg-surface-variant/30 border-t border-outline-variant/30 flex items-center justify-between gap-3">
            <button
              onClick={handleDismiss}
              className="px-4 py-2.5 rounded-xl border border-outline-variant/40 hover:bg-surface-variant/50 text-on-surface text-sm font-semibold transition-colors"
            >
              Bỏ qua lần này
            </button>
            <button
              onClick={() => handleConfirmExecute(false)}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-primary hover:opacity-95 text-white text-sm font-bold shadow-lg shadow-primary/20 flex items-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined text-lg">water_drop</span>
              Xác nhận & Bắt đầu tưới ({countdown}s)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
