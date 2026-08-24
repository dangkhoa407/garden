"use client";

import { useState, useEffect } from "react";
import { QuickToggleCard } from "@/components/controls/QuickToggleCard";
import { RangeSliderCard } from "@/components/controls/RangeSliderCard";
import { useGarden } from "@/context/GardenContext";
import { IrrigateModal } from "@/components/fertilizers/IrrigateModal";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

interface CommandLog {
  timestamp: string;
  command: string;
  label: string;
}

interface ArduinoStatus {
  connected: boolean;
  port: string;
  baudRate: number;
  pointCount: number;
  statusMessage: string;
  lastPingTime?: string;
}

interface SystemLog {
  timestamp: string;
  command: string;
  label: string;
  status?: string;
}

export default function ControlsPage() {
  const { controls, updateControls } = useGarden();
  const [sendingCmd, setSendingCmd] = useState<string | null>(null);
  const [sendingRoof, setSendingRoof] = useState<string | null>(null);
  const [sunStatus, setSunStatus] = useState<"Đã che" | "Đang chạy" | "Đã mở" | null>(null);
  const [rainStatus, setRainStatus] = useState<"Đã che" | "Đang chạy" | "Đã mở" | null>(null);
  const [activeToast, setActiveToast] = useState<string | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [logFilter, setLogFilter] = useState<"ALL" | "ERRORS" | "AI" | "SERIAL">("ALL");
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [showIrrigateModal, setShowIrrigateModal] = useState(false);
  const [arduinoStatus, setArduinoStatus] = useState<ArduinoStatus>({
    connected: false,
    port: "Đang dò cổng Serial...",
    baudRate: 9600,
    pointCount: 6,
    statusMessage: "Đang kiểm tra thiết bị qua cổng Serial...",
    lastPingTime: "--:--:--",
  });

  interface Esp32SensorData {
    soil1Raw: number;
    soil1Percent: number;
    soil2Raw: number;
    soil2Percent: number;
    floatHigh: boolean;
    floatLow: boolean;
    avgMoisture: number;
    temperature?: number;
    humidity?: number;
    lightPercent?: number;
    rainRaw?: number;
  }

  interface TaskProgressState {
    taskId: string;
    label: string;
    totalSec: number;
    elapsedSec: number;
    percent: number;
  }

  const [esp32Sensors, setEsp32Sensors] = useState<Esp32SensorData>({
    soil1Raw: 3171,
    soil1Percent: 0,
    soil2Raw: 4095,
    soil2Percent: 0,
    floatHigh: false,
    floatLow: false,
    avgMoisture: 0,
    temperature: 28,
    humidity: 70,
    lightPercent: 80,
  });

  const [taskProgress, setTaskProgress] = useState<TaskProgressState | null>(null);

  const startTaskProgress = (taskId: string, label: string, totalSec: number) => {
    setTaskProgress({
      taskId,
      label,
      totalSec,
      elapsedSec: 0,
      percent: 0,
    });

    const interval = setInterval(() => {
      setTaskProgress((prev) => {
        if (!prev || prev.taskId !== taskId) {
          clearInterval(interval);
          return null;
        }
        const nextElapsed = prev.elapsedSec + 0.5;
        if (nextElapsed >= totalSec) {
          clearInterval(interval);
          return null;
        }
        const percent = Math.min(99, Math.round((nextElapsed / totalSec) * 100));
        return {
          ...prev,
          elapsedSec: nextElapsed,
          percent,
        };
      });
    }, 500);
  };

  const handleStartFertilizingFromModal = (durationSec: number) => {
    startTaskProgress("fertilize", "Tưới Phân ESP32", durationSec || 25);
    setActiveToast("🚀 Đã kích hoạt tiến trình tưới phân bón tự động ESP32!");
  };

  const fetchEsp32Sensors = async () => {
    try {
      const res = await fetch("/api/esp32/sensors");
      if (res.ok) {
        const json = await res.json();
        if (json.data) setEsp32Sensors(json.data);
      }
    } catch (err) { }
  };

  const fetchArduinoStatus = async () => {
    try {
      const res = await fetch("/api/arduino/status");
      if (res.ok) {
        const data = await res.json();
        setArduinoStatus(data);
        if (data.lastLogs && Array.isArray(data.lastLogs)) {
          setLogs(data.lastLogs);
        }
      }
    } catch (err) {
      setArduinoStatus({
        connected: false,
        port: "Chưa cắm thiết bị Serial",
        baudRate: 9600,
        pointCount: 6,
        statusMessage: "Không thể kết nối đến Backend Server để quét cổng Serial",
        lastPingTime: "--:--:--",
      });
    }
  };

  const autoPingCheck = async () => {
    try {
      const res = await fetch("/api/arduino/ping-check", { method: "POST" });
      const data = await res.json();
      if (data.status) {
        setArduinoStatus(data.status);
      }
    } catch (err) {
      // Bỏ qua lỗi ngầm khi quét tự động
    }
  };

  const [autoSunEnabled, setAutoSunEnabled] = useState(false);
  const [autoSunOpenThreshold, setAutoSunOpenThreshold] = useState(70);
  const [autoSunCloseThreshold, setAutoSunCloseThreshold] = useState(30);

  const [autoRainEnabled, setAutoRainEnabled] = useState(false);

  const [showSunModal, setShowSunModal] = useState(false);
  const [tempOpenThreshold, setTempOpenThreshold] = useState(70);
  const [tempCloseThreshold, setTempCloseThreshold] = useState(30);

  const fetchControlsConfig = async () => {
    try {
      const res = await fetch("/api/controls");
      if (res.ok) {
        const data = await res.json();
        if (typeof data.autoSunEnabled === "boolean") setAutoSunEnabled(data.autoSunEnabled);
        if (typeof data.autoSunOpenThreshold === "number") {
          setAutoSunOpenThreshold(data.autoSunOpenThreshold);
          setTempOpenThreshold(data.autoSunOpenThreshold);
        }
        if (typeof data.autoSunCloseThreshold === "number") {
          setAutoSunCloseThreshold(data.autoSunCloseThreshold);
          setTempCloseThreshold(data.autoSunCloseThreshold);
        }
        if (typeof data.autoRainEnabled === "boolean") setAutoRainEnabled(data.autoRainEnabled);
      }
    } catch (err) {}
  };

  const handleToggleSunAuto = async () => {
    if (!autoSunEnabled) {
      setTempOpenThreshold(autoSunOpenThreshold);
      setTempCloseThreshold(autoSunCloseThreshold);
      setShowSunModal(true);
    } else {
      setAutoSunEnabled(false);
      setActiveToast("Đã tắt chế độ đóng mở rèm nắng tự động");
      try {
        await fetch("/api/controls", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoSunEnabled: false }),
        });
      } catch (e) {}
    }
  };

  const handleSaveSunModal = async () => {
    if (tempOpenThreshold <= tempCloseThreshold) {
      setActiveToast("⚠️ Ngưỡng MỞ rèm (nắng gắt) phải lớn hơn ngưỡng ĐÓNG rèm (ánh sáng yếu)!");
      return;
    }
    setAutoSunOpenThreshold(tempOpenThreshold);
    setAutoSunCloseThreshold(tempCloseThreshold);
    setAutoSunEnabled(true);
    setShowSunModal(false);
    setActiveToast(`☀️ Đã bật rèm nắng tự động (Mở: ≥${tempOpenThreshold}%, Đóng: ≤${tempCloseThreshold}%)`);

    try {
      await fetch("/api/controls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoSunEnabled: true,
          autoSunOpenThreshold: tempOpenThreshold,
          autoSunCloseThreshold: tempCloseThreshold,
        }),
      });
    } catch (e) {}
  };

  const handleToggleRainAuto = async () => {
    const newStatus = !autoRainEnabled;
    setAutoRainEnabled(newStatus);
    if (newStatus) {
      setActiveToast("🌧️ Đã bật chế độ đóng mở rèm mưa tự động!");
    } else {
      setActiveToast("Đã tắt chế độ đóng mở rèm mưa tự động");
    }

    try {
      await fetch("/api/controls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoRainEnabled: newStatus }),
      });
    } catch (e) {}
  };

  useEffect(() => {
    fetchControlsConfig();
    fetchArduinoStatus();
    fetchEsp32Sensors();
    // Tự động quét trạng thái thiết bị mỗi 2 giây
    const statusInterval = setInterval(fetchArduinoStatus, 2000);
    // Tự động quét dữ liệu cảm biến ESP32 mỗi 2 giây
    const sensorInterval = setInterval(fetchEsp32Sensors, 2000);
    // Tự động kiểm tra kết nối Arduino (Ping Test ngầm) mỗi 4 giây
    const pingInterval = setInterval(autoPingCheck, 4000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(sensorInterval);
      clearInterval(pingInterval);
    };
  }, []);

  const filteredLogs = logs.filter((log) => {
    const cmd = (log.command || "").toUpperCase();
    const status = (log.status || "").toUpperCase();
    const text = (log.label || "").toUpperCase();

    if (logFilter === "ERRORS") {
      return (
        cmd.includes("ERROR") ||
        cmd.includes("ALERT") ||
        cmd.includes("FAILED") ||
        cmd.includes("WARNING") ||
        status.includes("ERROR") ||
        status.includes("ALERT") ||
        status.includes("FAILED") ||
        status.includes("WARNING") ||
        text.includes("LỖI") ||
        text.includes("CẢNH BÁO")
      );
    }
    if (logFilter === "AI") {
      return (
        cmd.includes("AI") ||
        cmd.includes("PROCESS") ||
        cmd.includes("COMPLETE") ||
        cmd.includes("GEMINI") ||
        text.includes("GEMINI") ||
        text.includes("CHỤP") ||
        text.includes("BỎ QUA") ||
        text.includes("PHÂN TÍCH")
      );
    }
    if (logFilter === "SERIAL") {
      return (
        cmd === "RX" ||
        cmd === "TX" ||
        status.includes("SENT") ||
        cmd.includes("PING") ||
        text.includes("ARDUINO")
      );
    }
    return true;
  });

  const handleCheckConnection = async () => {
    setCheckingStatus(true);
    setActiveToast(null);

    try {
      const res = await fetch("/api/arduino/ping-check", {
        method: "POST",
      });
      const data = await res.json();

      if (data.status) {
        setArduinoStatus(data.status);
      }
      setActiveToast(data.message);

      if (data.success) {
        setLogs((prev) => [
          {
            timestamp: data.status?.lastPingTime || new Date().toLocaleTimeString("vi-VN"),
            command: "PING",
            label: "Kiểm tra kết nối Arduino thực tế (PING)",
          },
          ...prev,
        ]);
      }
    } catch (err) {
      setActiveToast("Lỗi kiểm tra: Không thể phản hồi từ server Backend!");
    } finally {
      setCheckingStatus(false);
    }
  };

  const sendRoofCommand = async (action: string) => {
    setSendingRoof(action);
    setActiveToast(null);

    // Bật "Đang chạy" ngay khi bấm
    const isSun = action === "SUN CLOSE" || action === "SUN OPEN";
    const isRain = action === "RAIN CLOSE" || action === "RAIN OPEN";
    if (isSun) setSunStatus("Đang chạy");
    if (isRain) setRainStatus("Đang chạy");

    try {
      const res = await fetch("/api/esp32/roof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setActiveToast(data.message || `Đã gửi lệnh: ${action}`);
      setLogs((prev) => [
        {
          timestamp: data.timestamp || new Date().toLocaleTimeString("vi-VN"),
          command: "ESP32_ROOF",
          label: `Lệnh rèm: ${action} — ${data.sentToHardware ? "✅ Gửi thành công" : "⚠️ ESP32 chưa kết nối"}`,
          status: data.sentToHardware ? "SENT" : "WARNING",
        },
        ...prev,
      ]);

      if (!data.sentToHardware) {
        // ESP32 chưa kết nối — reset badge
        if (isSun) setSunStatus(null);
        if (isRain) setRainStatus(null);
        return;
      }

      // ESP32 đã nhận lệnh → poll cho đến khi nhận DONE (tối đa 60s)
      const pollKey = isSun ? "sun" : "rain";
      const maxAttempts = 75; // 75 × 800ms = 60s
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const sr = await fetch("/api/esp32/roof-status");
          const sd = await sr.json();
          const roofVal: string | null = sd[pollKey];

          if (roofVal === "che" || roofVal === "mo") {
            clearInterval(poll);
            const label = roofVal === "che" ? "Đã che" : "Đã mở";
            if (isSun) setSunStatus(label as "Đã che" | "Đã mở");
            if (isRain) setRainStatus(label as "Đã che" | "Đã mở");
          } else if (attempts >= maxAttempts) {
            clearInterval(poll);
            // Timeout — giữ lại trạng thái cuối cùng server biết
            if (isSun) setSunStatus(null);
            if (isRain) setRainStatus(null);
          }
        } catch { clearInterval(poll); }
      }, 800);

    } catch (err) {
      setActiveToast(`Lỗi gửi lệnh rèm [${action}]: Không kết nối được server`);
      if (isSun) setSunStatus(null);
      if (isRain) setRainStatus(null);
    } finally {
      setSendingRoof(null);
    }
  };


  const sendRobotCommand = async (cmdKey: string, labelName: string) => {
    setSendingCmd(cmdKey);
    setActiveToast(null);

    let estDurationSec = 15;
    if (cmdKey === "k") estDurationSec = 18;
    else if (cmdKey === "p") estDurationSec = 25;
    else if (cmdKey === "h") estDurationSec = 12;

    startTaskProgress(cmdKey, labelName, estDurationSec);

    try {
      const response = await fetch("/api/arduino/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmdKey }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setActiveToast(data.message);
        setTaskProgress((prev) => (prev ? { ...prev, percent: 100 } : null));
        setTimeout(() => setTaskProgress(null), 1200);
        setLogs((prev) => [
          {
            timestamp: data.timestamp || new Date().toLocaleTimeString("vi-VN"),
            command: data.command,
            label: labelName,
          },
          ...prev,
        ]);
      } else {
        setActiveToast(`Lỗi: ${data.error || "Không thể gửi lệnh"}`);
        setTaskProgress(null);
      }
    } catch (err) {
      setActiveToast(`Lỗi gửi lệnh [${labelName}]: Kết nối server không khả dụng`);
      setTaskProgress(null);
    } finally {
      setSendingCmd(null);
    }
  };

  return (
    <div className="space-y-xl max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="font-bold text-on-surface mb-1 text-2xl sm:text-3xl md:text-display-lg">
          Điều Khiển Vườn Rau
        </h1>
        <p className="text-sm md:font-body-lg md:text-body-lg text-on-surface-variant">
          Tại đây có thể thực hiện các thao tác trên hệ thông vườn rau
        </p>
      </div>



      {/* Robot Control Panel */}
      <section className="bg-surface-container-lowest rounded-2xl p-lg border border-primary/20 shadow-md">
        <div className="flex items-center gap-3 mb-md pb-sm border-b border-outline-variant/15">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-2xl">smart_toy</span>
          </div>
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
              Bộ Điều Khiển
            </h2>

          </div>
        </div>

        {/* Command Toast Feedback */}
        {activeToast && (
          <div className="mb-md p-3 bg-primary/10 border border-primary/30 rounded-xl text-primary text-body-sm flex items-center gap-2 animate-in fade-in duration-200">
            <span className="material-symbols-outlined text-lg">info</span>
            <span className="font-semibold">{activeToast}</span>
          </div>
        )}

        {/* Real-time Sensors Panel (ESP32) */}
        <div className="mb-md p-md bg-emerald-50/40 rounded-2xl border border-emerald-200/80 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-md pb-sm border-b border-emerald-200/60">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm tracking-tight">
              <span className="material-symbols-outlined text-lg text-emerald-600 animate-pulse">
                sensors
              </span>
              <span>DỮ LIỆU VƯỜN RAU:</span>
            </div>
            <div className="text-emerald-700 font-bold text-sm">
              Độ ẩm trung bình: <span className="text-emerald-800 text-base font-extrabold">{esp32Sensors.avgMoisture}%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            {/* CB Độ Ẩm 1 */}
            <div className="p-3 bg-white rounded-xl border border-emerald-100/90 shadow-2xs">
              <div className="text-xs font-semibold text-zinc-500 mb-0.5">CB Độ Ẩm 1:</div>
              <div className="text-xl font-black text-emerald-800">{esp32Sensors.soil1Percent}%</div>
            </div>

            {/* CB Độ Ẩm 2 */}
            <div className="p-3 bg-white rounded-xl border border-emerald-100/90 shadow-2xs">
              <div className="text-xs font-semibold text-zinc-500 mb-0.5">CB Độ Ẩm 2:</div>
              <div className="text-xl font-black text-emerald-800">{esp32Sensors.soil2Percent}%</div>
            </div>

            {/* Trạng Thái Bồn Nước (Gộp 2 phao cao/thấp) */}
            <div className="p-3 bg-white rounded-xl border border-emerald-100/90 shadow-2xs">
              <div className="text-xs font-semibold text-zinc-500 mb-0.5">Trạng Thái Bồn Nước:</div>
              <div className="flex items-center gap-2 mt-1">
                {esp32Sensors.floatHigh ? (
                  <span className="text-lg font-extrabold text-emerald-700 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    Đầy nước
                  </span>
                ) : esp32Sensors.floatLow ? (
                  <span className="text-lg font-extrabold text-rose-700 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                    Hết nước
                  </span>
                ) : (
                  <span className="text-lg font-extrabold text-sky-700 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                    Còn nước
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Command Buttons Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
          {/* Check Pests (k) */}
          <button
            onClick={() => sendRobotCommand("k", "Kiểm tra sâu (k)")}
            disabled={sendingCmd === "k"}
            className="flex flex-col p-4 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 rounded-2xl text-left transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="material-symbols-outlined text-3xl text-emerald-700 group-hover:scale-110 transition-transform">
                bug_report
              </span>
              <span className="font-mono text-xs px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded font-bold">
                Tự động
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-emerald-900">
              Kiểm tra sâu hại
            </h3>
            <p className="font-body-sm text-xs text-emerald-700/90 mt-1">
              Hệ thống sẽ kiểm tra toàn bộ vườn rau để phát hiện sâu bệnh.
            </p>
            {taskProgress?.taskId === "k" && (
              <div className="mt-3 pt-2 border-t border-emerald-300/80 w-full space-y-1 animate-fadeIn">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-950">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                    Đang thực hiện...
                  </span>
                  <span className="font-mono font-extrabold">{taskProgress.percent}% • Còn ~{Math.max(1, Math.ceil(taskProgress.totalSec - taskProgress.elapsedSec))}s</span>
                </div>
                <div className="w-full bg-emerald-200/90 rounded-full h-2 overflow-hidden shadow-inner">
                  <div
                    className="bg-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${taskProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </button>

          {/* Nút Tưới Phân (Vị trí 2) */}
          <button
            onClick={() => setShowIrrigateModal(true)}
            className="flex flex-col p-4 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-300 rounded-2xl text-left transition-all active:scale-[0.98] group shadow-sm"
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="material-symbols-outlined text-3xl text-emerald-700 group-hover:scale-110 transition-transform">
                water_drop
              </span>
              <span className="font-mono text-xs px-2.5 py-1 bg-emerald-200 text-emerald-900 rounded-full font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Tuỳ chỉnh & tự động
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-emerald-950">
              Tưới Phân
            </h3>
            <p className="font-body-sm text-xs text-emerald-800/90 mt-1">
              Có thể tưới phân theo yêu cầu hoặc dùng AI để phân tích.
            </p>
            {taskProgress?.taskId === "fertilize" && (
              <div className="mt-3 pt-2 border-t border-emerald-300/80 w-full space-y-1 animate-fadeIn">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-950">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                    Đang bơm tưới phân...
                  </span>
                  <span className="font-mono font-extrabold">{taskProgress.percent}% • Còn ~{Math.max(1, Math.ceil(taskProgress.totalSec - taskProgress.elapsedSec))}s</span>
                </div>
                <div className="w-full bg-emerald-200/90 rounded-full h-2 overflow-hidden shadow-inner">
                  <div
                    className="bg-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${taskProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </button>

          {/* Full Spray (p) */}
          <button
            onClick={() => sendRobotCommand("p", "Phun toàn bộ (p)")}
            disabled={sendingCmd === "p"}
            className="flex flex-col p-4 bg-teal-50 hover:bg-teal-100/80 border border-teal-200 rounded-2xl text-left transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="material-symbols-outlined text-3xl text-teal-700 group-hover:scale-110 transition-transform">
                water_drop
              </span>
              <span className="font-mono text-xs px-2 py-0.5 bg-teal-200 text-teal-800 rounded font-bold">
                Tự động
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-teal-900">
              Phun toàn bộ vườn
            </h3>
            <p className="font-body-sm text-xs text-teal-700/90 mt-1">
              Hệ thống sẽ phun thuốc sinh học phổ rộng ở toàn bộ vườn rau.
            </p>
            {taskProgress?.taskId === "p" && (
              <div className="mt-3 pt-2 border-t border-teal-300/80 w-full space-y-1 animate-fadeIn">
                <div className="flex items-center justify-between text-[11px] font-bold text-teal-950">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-teal-600 animate-ping" />
                    Đang phun toàn bộ...
                  </span>
                  <span className="font-mono font-extrabold">{taskProgress.percent}% • Còn ~{Math.max(1, Math.ceil(taskProgress.totalSec - taskProgress.elapsedSec))}s</span>
                </div>
                <div className="w-full bg-teal-200/90 rounded-full h-2 overflow-hidden shadow-inner">
                  <div
                    className="bg-teal-600 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${taskProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </button>

          {/* Emergency Stop (s) */}
          <button
            onClick={() => sendRobotCommand("s", "Dừng khẩn cấp (s)")}
            disabled={sendingCmd === "s"}
            className="flex flex-col p-4 bg-rose-50 hover:bg-rose-100/80 border border-rose-200 rounded-2xl text-left transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="material-symbols-outlined text-3xl text-rose-700 group-hover:scale-110 transition-transform">
                stop_circle
              </span>
              <span className="font-mono text-xs px-2 py-0.5 bg-rose-200 text-rose-800 rounded font-bold">
                Tự động
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-rose-900">
              Dừng khẩn cấp
            </h3>
            <p className="font-body-sm text-xs text-rose-700/90 mt-1">
              Hủy chu trình đang chạy và ngắt toàn bộ động cơ ngay lập tức
            </p>
          </button>

          {/* Reset Error (r) */}
          <button
            onClick={() => sendRobotCommand("r", "Xóa lỗi (r)")}
            disabled={sendingCmd === "r"}
            className="flex flex-col p-4 bg-amber-50 hover:bg-amber-100/80 border border-amber-200 rounded-2xl text-left transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="material-symbols-outlined text-3xl text-amber-700 group-hover:scale-110 transition-transform">
                restart_alt
              </span>
              <span className="font-mono text-xs px-2 py-0.5 bg-amber-200 text-amber-800 rounded font-bold">
                Tự động
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-amber-900">
              Khôi phục
            </h3>
            <p className="font-body-sm text-xs text-amber-700/90 mt-1">
              Khôi phục hệ thống sau khi gặp sự cố cảnh báo hoặc dừng khẩn
            </p>
          </button>

          {/* Homing (h) - Vị trí 6 */}
          <button
            onClick={() => sendRobotCommand("h", "Homing (h)")}
            disabled={sendingCmd === "h"}
            className="flex flex-col p-4 bg-sky-50 hover:bg-sky-100/80 border border-sky-200 rounded-2xl text-left transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="material-symbols-outlined text-3xl text-sky-700 group-hover:scale-110 transition-transform">
                home_pin
              </span>
              <span className="font-mono text-xs px-2 py-0.5 bg-sky-200 text-sky-800 rounded font-bold">
                Tự động
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-sky-900">
              Homing
            </h3>
            <p className="font-body-sm text-xs text-sky-700/90 mt-1">
              Đưa bộ phân theo dõi vườn rau về vị trí gốc
            </p>
          </button>
        </div>
      </section>

      {/* === ĐIỀU KHIỂN RÈM CHE NẮNG & MƯA === */}
      <section className="bg-surface-container-lowest rounded-2xl p-lg border border-sky-200/40 shadow-md">
        <div className="flex items-center gap-3 mb-md pb-sm border-b border-outline-variant/15">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-600">
            <span className="material-symbols-outlined text-2xl">blinds</span>
          </div>
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold">Điều Khiển Rèm Che</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Gửi lệnh trực tiếp đến ESP32 — Rèm Nắng &amp; Rèm Mưa</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          {/* RÈM NẮNG */}
          <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-2xl text-amber-600">wb_sunny</span>
                <span className="font-bold text-amber-900 text-base">Rèm Che Nắng</span>
              </div>
              {/* Badge trạng thái rèm nắng */}
              {sunStatus && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  sunStatus === "Đang chạy"
                    ? "bg-amber-200 text-amber-800"
                    : sunStatus === "Đã che"
                    ? "bg-orange-100 text-orange-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}>
                  {sunStatus === "Đang chạy" && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
                  {sunStatus === "Đã che" && <span className="w-2 h-2 rounded-full bg-orange-500" />}
                  {sunStatus === "Đã mở" && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                  {sunStatus}
                </span>
              )}
            </div>

            {/* Nút điều khiển thủ công */}
            <div className="grid grid-cols-2 gap-3">
              <button
                id="btn-sun-close"
                onClick={() => sendRoofCommand("SUN OPEN")}
                disabled={sendingRoof !== null}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-sm transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sendingRoof === "SUN OPEN" ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-lg">dark_mode</span>
                )}
                Kéo Che
              </button>
              <button
                id="btn-sun-open"
                onClick={() => sendRoofCommand("SUN CLOSE")}
                disabled={sendingRoof !== null}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white hover:bg-amber-50 text-amber-700 border border-amber-300 font-bold text-sm shadow-sm transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sendingRoof === "SUN CLOSE" ? (
                  <span className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-lg">light_mode</span>
                )}
                Thu Lại
              </button>
            </div>

            {/* NÚT 1: TỰ ĐỘNG RÈM NẮNG */}
            <div className="pt-2 border-t border-amber-200/60">
              <div className="flex items-center justify-between gap-2">
                <button
                  id="btn-auto-sun-toggle"
                  type="button"
                  onClick={handleToggleSunAuto}
                  className={`flex-1 flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-sm ${
                    autoSunEnabled
                      ? "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20"
                      : "bg-white text-amber-800 border border-amber-300 hover:bg-amber-100/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">
                      {autoSunEnabled ? "wb_sunny" : "partly_cloudy_day"}
                    </span>
                    <span>Tự Động Rèm Nắng</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    autoSunEnabled ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                  }`}>
                    {autoSunEnabled ? "Đang Bật" : "Tắt"}
                  </span>
                </button>

                {autoSunEnabled && (
                  <button
                    type="button"
                    title="Cấu hình lại ngưỡng ánh sáng"
                    onClick={() => {
                      setTempOpenThreshold(autoSunOpenThreshold);
                      setTempCloseThreshold(autoSunCloseThreshold);
                      setShowSunModal(true);
                    }}
                    className="p-2.5 rounded-xl bg-amber-200/70 text-amber-900 hover:bg-amber-300 transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-base">settings</span>
                  </button>
                )}
              </div>

              {autoSunEnabled && (
                <div className="mt-2 text-[11px] text-amber-800/90 font-medium bg-amber-100/60 px-3 py-1.5 rounded-lg flex items-center justify-between">
                  <span>Mở che: <strong className="text-amber-950">≥ {autoSunOpenThreshold}%</strong></span>
                  <span>|</span>
                  <span>Thu lại: <strong className="text-amber-950">≤ {autoSunCloseThreshold}%</strong></span>
                  <span>|</span>
                  <span>Hiện tại: <strong className="text-amber-950">{esp32Sensors.lightPercent ?? 80}%</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* RÈM MƯA */}
          <div className="p-4 bg-sky-50/60 border border-sky-200/80 rounded-2xl space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-2xl text-sky-600">water_drop</span>
                <span className="font-bold text-sky-900 text-base">Rèm Che Mưa</span>
              </div>
              {/* Badge trạng thái rèm mưa */}
              {rainStatus && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                  rainStatus === "Đang chạy"
                    ? "bg-sky-200 text-sky-800"
                    : rainStatus === "Đã che"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}>
                  {rainStatus === "Đang chạy" && <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />}
                  {rainStatus === "Đã che" && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                  {rainStatus === "Đã mở" && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
                  {rainStatus}
                </span>
              )}
            </div>

            {/* Nút điều khiển thủ công */}
            <div className="grid grid-cols-2 gap-3">
              <button
                id="btn-rain-close"
                onClick={() => sendRoofCommand("RAIN OPEN")}
                disabled={sendingRoof !== null}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm shadow-sm transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sendingRoof === "RAIN OPEN" ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-lg">umbrella</span>
                )}
                Kéo Che
              </button>
              <button
                id="btn-rain-open"
                onClick={() => sendRoofCommand("RAIN CLOSE")}
                disabled={sendingRoof !== null}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white hover:bg-sky-50 text-sky-700 border border-sky-300 font-bold text-sm shadow-sm transition-all active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {sendingRoof === "RAIN CLOSE" ? (
                  <span className="w-4 h-4 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-lg">cloud_off</span>
                )}
                Thu Lại
              </button>
            </div>

            {/* NÚT 2: TỰ ĐỘNG RÈM MƯA */}
            <div className="pt-2 border-t border-sky-200/60">
              <button
                id="btn-auto-rain-toggle"
                type="button"
                onClick={handleToggleRainAuto}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-sm ${
                  autoRainEnabled
                    ? "bg-sky-500 text-white hover:bg-sky-600 shadow-sky-500/20"
                    : "bg-white text-sky-800 border border-sky-300 hover:bg-sky-100/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">
                    {autoRainEnabled ? "water_drop" : "rainy"}
                  </span>
                  <span>Tự Động Rèm Mưa</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                  autoRainEnabled ? "bg-white/20 text-white" : "bg-sky-100 text-sky-700"
                }`}>
                  {autoRainEnabled ? "Đang Bật" : "Tắt"}
                </span>
              </button>

              {autoRainEnabled && (
                <div className="mt-2 text-[11px] text-sky-800/90 font-medium bg-sky-100/60 px-3 py-1.5 rounded-lg flex items-center justify-between">
                  <span>Có mưa ➔ Mở che | Hết mưa ➔ Đóng lại</span>
                  <span className="font-bold text-sky-950">
                    {esp32Sensors.rainRaw !== undefined && esp32Sensors.rainRaw < 2800 ? "🌧️ Đang có mưa" : "☀️ Không mưa"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* POPUP CONFIG MODAL CHO RÈM NẮNG TỰ ĐỘNG */}
      {showSunModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-amber-100 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <span className="material-symbols-outlined text-2xl">wb_sunny</span>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Cấu Hình Rèm Nắng Tự Động</h3>
                  <p className="text-xs text-slate-500">Cài đặt ngưỡng ánh sáng tự động kích hoạt rèm</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSunModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-4">
              {/* NGƯỠNG MỞ RÈM */}
              <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/60 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-600 text-base">light_mode</span>
                    Ngưỡng Cường Độ Ánh Sáng MỞ Rèm (%)
                  </span>
                  <span className="text-sm font-extrabold px-2.5 py-0.5 bg-amber-200 text-amber-950 rounded-lg">
                    ≥ {tempOpenThreshold}%
                  </span>
                </div>
                <p className="text-[11px] text-amber-700/80 leading-relaxed">
                  Khi ánh sáng vượt quá ngưỡng này (nắng gắt), hệ thống tự động <strong>kéo rèm che nắng</strong>.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={tempOpenThreshold}
                    onChange={(e) => setTempOpenThreshold(Number(e.target.value))}
                    className="flex-1 accent-amber-500 h-2 bg-amber-200 rounded-lg cursor-pointer"
                  />
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={tempOpenThreshold}
                    onChange={(e) => setTempOpenThreshold(Math.min(100, Math.max(10, Number(e.target.value))))}
                    className="w-16 px-2 py-1 text-center font-bold text-amber-900 text-xs border border-amber-300 rounded-lg bg-white"
                  />
                </div>
              </div>

              {/* NGƯỠNG ĐÓNG RÈM */}
              <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/60 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-600 text-base">dark_mode</span>
                    Ngưỡng Cường Độ Ánh Sáng ĐÓNG Rèm (%)
                  </span>
                  <span className="text-sm font-extrabold px-2.5 py-0.5 bg-amber-200 text-amber-950 rounded-lg">
                    ≤ {tempCloseThreshold}%
                  </span>
                </div>
                <p className="text-[11px] text-amber-700/80 leading-relaxed">
                  Khi ánh sáng giảm xuống dưới ngưỡng này (trời dịu/tối), hệ thống tự động <strong>thu rèm nắng lại</strong>.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min="0"
                    max="90"
                    step="5"
                    value={tempCloseThreshold}
                    onChange={(e) => setTempCloseThreshold(Number(e.target.value))}
                    className="flex-1 accent-amber-500 h-2 bg-amber-200 rounded-lg cursor-pointer"
                  />
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={tempCloseThreshold}
                    onChange={(e) => setTempCloseThreshold(Math.min(90, Math.max(0, Number(e.target.value))))}
                    className="w-16 px-2 py-1 text-center font-bold text-amber-900 text-xs border border-amber-300 rounded-lg bg-white"
                  />
                </div>
              </div>

              {tempOpenThreshold <= tempCloseThreshold && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-red-500">warning</span>
                  <span>Ngưỡng MỞ (nắng gắt) phải lớn hơn ngưỡng ĐÓNG (ánh sáng yếu)!</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSunModal(false)}
                className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveSunModal}
                disabled={tempOpenThreshold <= tempCloseThreshold}
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-500/30 transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Lưu &amp; Bật Tự Động
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REAL-TIME SYSTEM LOG & HARDWARE DIAGNOSTICS TERMINAL */}
      <section className="bg-zinc-950 rounded-2xl p-md sm:p-lg border border-zinc-800 shadow-2xl overflow-hidden font-mono">
        {/* Terminal Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-md border-b border-zinc-800/80 mb-md">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <div className="h-4 w-px bg-zinc-800 mx-1 hidden sm:block" />
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-400 text-lg animate-pulse">terminal</span>
              <h3 className="text-zinc-100 font-bold text-sm tracking-wide">
                NHẬT KÝ HỆ THỐNG
              </h3>
            </div>
          </div>

          {/* Controls & Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Filter Tabs */}
            <div className="bg-zinc-900 p-1 rounded-xl flex items-center border border-zinc-800 flex-wrap gap-1">
              <button
                onClick={() => setLogFilter("ALL")}
                className={`px-2.5 py-1 rounded-lg transition-all ${logFilter === "ALL" ? "bg-zinc-800 text-emerald-400 font-bold" : "text-zinc-400 hover:text-zinc-200"
                  }`}
              >
                Tất cả ({logs.length})
              </button>
              <button
                onClick={() => setLogFilter("ERRORS")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${logFilter === "ERRORS" ? "bg-rose-950/80 text-rose-400 font-bold border border-rose-800/50" : "text-zinc-400 hover:text-rose-400"
                  }`}
              >
                🚨 Lỗi & Cảnh báo
              </button>
              <button
                onClick={() => setLogFilter("AI")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${logFilter === "AI" ? "bg-cyan-950/80 text-cyan-400 font-bold border border-cyan-800/50" : "text-zinc-400 hover:text-cyan-400"
                  }`}
              >
                🤖 AI Inspection
              </button>
              <button
                onClick={() => setLogFilter("SERIAL")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${logFilter === "SERIAL" ? "bg-purple-950/80 text-purple-400 font-bold border border-purple-800/50" : "text-zinc-400 hover:text-purple-400"
                  }`}
              >
                🔌 Serial RX/TX
              </button>
            </div>

            {/* Clear button */}
            <button
              onClick={() => setLogs([])}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-xl transition-all"
              title="Xóa khung log màn hình"
            >
              Xóa log
            </button>
          </div>
        </div>

        {/* Terminal Log Output List */}
        <div className="h-64 sm:h-80 overflow-y-auto pr-2 space-y-2 text-xs scrollbar-thin scrollbar-thumb-zinc-800">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-2 py-8">
              <span className="material-symbols-outlined text-4xl">subject</span>
              <p>Chưa có dữ liệu log nào phù hợp với bộ lọc hiện tại</p>
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              const cmdUpper = (log.command || "").toUpperCase();
              const isError = cmdUpper.includes("ERROR") || cmdUpper.includes("ALERT") || cmdUpper.includes("FAILED");
              const isWarn = cmdUpper.includes("WARNING") || cmdUpper.includes("WARN");
              const isAi = cmdUpper.includes("AI") || cmdUpper.includes("PROCESS") || cmdUpper.includes("GEMINI");
              const isSuccess = cmdUpper.includes("SUCCESS") || cmdUpper.includes("COMPLETE");

              let badgeStyle = "bg-zinc-800 text-zinc-300 border-zinc-700";
              if (isError) badgeStyle = "bg-rose-950 text-rose-400 border-rose-800/60 font-bold";
              else if (isWarn) badgeStyle = "bg-amber-950 text-amber-400 border-amber-800/60 font-bold";
              else if (isAi) badgeStyle = "bg-cyan-950 text-cyan-300 border-cyan-800/60";
              else if (isSuccess) badgeStyle = "bg-emerald-950 text-emerald-300 border-emerald-800/60";

              return (
                <div
                  key={index}
                  className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-start gap-2 transition-colors ${isError
                    ? "bg-rose-950/30 border-rose-900/40 text-rose-200"
                    : isWarn
                      ? "bg-amber-950/20 border-amber-900/30 text-amber-200"
                      : "bg-zinc-900/70 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900"
                    }`}
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-zinc-500 font-mono text-[11px]">
                      [{log.timestamp || "NOW"}]
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold border ${badgeStyle}`}>
                      {log.command || "LOG"}
                    </span>
                  </div>
                  <div className="break-all font-sans text-xs sm:text-[13px] leading-relaxed flex-1">
                    {log.label}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Terminal Footer Status Bar */}
        <div className="mt-md pt-sm border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-zinc-500">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${arduinoStatus.connected ? "bg-emerald-500 animate-ping" : "bg-rose-500"}`} />
            <span>
              Cổng Serial: <strong className="text-zinc-300">{arduinoStatus.port}</strong> ({arduinoStatus.connected ? "HOẠT ĐỘNG 9600 BAUD" : "DISCONNECTED"})
            </span>
          </div>
          <div>
            Tổng log ghi nhận: <span className="text-zinc-300 font-bold">{logs.length}</span>
          </div>
        </div>
      </section>

      {/* Quick Toggles Section */}
      <section>
        <h2 className="font-headline-md text-headline-md text-on-surface mb-md font-bold">
          Công tắc thiết bị
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
          <QuickToggleCard
            label="Màn che tự động"
            icon="smart_toy"
            checked={!!controls.autoShade}
            onChange={(checked) => {
              updateControls({ autoShade: checked });
              setActiveToast(`🤖 Đã ${checked ? "BẬT" : "TẮT"} chế độ màn che tự động!`);
            }}
          />
          <QuickToggleCard
            label="Màn che nắng"
            icon="wb_sunny"
            checked={!!controls.sunRoof}
            onChange={async (checked) => {
              updateControls({ sunRoof: checked });
              const cmd = checked ? "SUN CLOSE" : "SUN OPEN";
              try {
                await fetch("/api/esp32/roof", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: cmd }),
                });
              } catch (e) {}
              setActiveToast(`☀️ Đã ${checked ? "KÉO CHE" : "THU LẠI"} màn che nắng!`);
            }}
          />
          <QuickToggleCard
            label="Màn che mưa"
            icon="water_drop"
            checked={!!controls.rainRoof}
            onChange={async (checked) => {
              updateControls({ rainRoof: checked });
              const cmd = checked ? "RAIN CLOSE" : "RAIN OPEN";
              try {
                await fetch("/api/esp32/roof", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: cmd }),
                });
              } catch (e) {}
              setActiveToast(`🌧️ Đã ${checked ? "KÉO CHE" : "THU LẠI"} màn che mưa!`);
            }}
          />
        </div>
      </section>

      {/* Detailed Adjustments Section */}
      <section>
        <h2 className="font-headline-md text-headline-md text-on-surface mb-md font-bold">
          Điều chỉnh chi tiết
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          <RangeSliderCard
            label="CƯỜNG ĐỘ ÁNH SÁNG"
            value={controls.lightIntensity}
            onChange={(val) => updateControls({ lightIntensity: val })}
          />
          <RangeSliderCard
            label="LƯU LƯỢNG NƯỚC"
            value={controls.waterFlowRate}
            onChange={(val) => updateControls({ waterFlowRate: val })}
          />
          <RangeSliderCard
            label="ĐỘ ẨM MỤC TIÊU"
            value={controls.targetHumidity}
            onChange={(val) => updateControls({ targetHumidity: val })}
          />
        </div>
      </section>



      {/* Shared 2-Tab Irrigation Modal */}
      <IrrigateModal
        isOpen={showIrrigateModal}
        onClose={() => setShowIrrigateModal(false)}
        onStartIrrigation={handleStartFertilizingFromModal}
      />
    </div>
  );
}
