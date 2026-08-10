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
  }

  const [esp32Sensors, setEsp32Sensors] = useState<Esp32SensorData>({
    soil1Raw: 3171,
    soil1Percent: 0,
    soil2Raw: 4095,
    soil2Percent: 0,
    floatHigh: false,
    floatLow: false,
    avgMoisture: 0,
  });

  const fetchEsp32Sensors = async () => {
    try {
      const res = await fetch("/api/esp32/sensors");
      if (res.ok) {
        const json = await res.json();
        if (json.data) setEsp32Sensors(json.data);
      }
    } catch (err) {}
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

  useEffect(() => {
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

  const sendRobotCommand = async (cmdKey: string, labelName: string) => {
    setSendingCmd(cmdKey);
    setActiveToast(null);

    try {
      const response = await fetch("/api/arduino/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmdKey }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setActiveToast(data.message);
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
      }
    } catch (err) {
      setActiveToast(`Lỗi gửi lệnh [${labelName}]: Kết nối server không khả dụng`);
    } finally {
      setSendingCmd(null);
    }
  };

  return (
    <div className="space-y-xl max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="font-display-lg text-display-lg font-bold text-on-surface mb-1">
          Điều Khiển Thiết Bị & Robot GrowHub
        </h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          Tích hợp hệ thống điều khiển Arduino, quét sâu bệnh AI Gemini và tự động hóa nhà kính
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
              Bộ Điều Khiển Robot AI
            </h2>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Các nút gửi lệnh trực tiếp xuống mạch điều khiển Arduino
            </p>
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
              <span>((•)) CẢM BIẾN THỜI GIAN THỰC (ESP32):</span>
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
              <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Raw: {esp32Sensors.soil1Raw}</div>
            </div>

            {/* CB Độ Ẩm 2 */}
            <div className="p-3 bg-white rounded-xl border border-emerald-100/90 shadow-2xs">
              <div className="text-xs font-semibold text-zinc-500 mb-0.5">CB Độ Ẩm 2:</div>
              <div className="text-xl font-black text-emerald-800">{esp32Sensors.soil2Percent}%</div>
              <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Raw: {esp32Sensors.soil2Raw}</div>
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
                Phím k
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-emerald-900">
              Kiểm tra sâu hại
            </h3>
            <p className="font-body-sm text-xs text-emerald-700/90 mt-1">
              Chụp 6 điểm bằng camera & phân tích hình ảnh qua AI Gemini
            </p>
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
                ESP32
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-emerald-950">
              Tưới Phân
            </h3>
            <p className="font-body-sm text-xs text-emerald-800/90 mt-1">
              Kích hoạt Popup tưới phân tự động (Tùy chỉnh ml hoặc Phối trộn AI)
            </p>
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
                Phím p
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-teal-900">
              Phun toàn bộ vườn
            </h3>
            <p className="font-body-sm text-xs text-teal-700/90 mt-1">
              Kích hoạt hệ thống phun dung dịch sinh học trên toàn bộ các khay
            </p>
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
                Phím s
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
                Phím r
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-amber-900">
              Xóa trạng thái lỗi
            </h3>
            <p className="font-body-sm text-xs text-amber-700/90 mt-1">
              Khôi phục Arduino và Robot sau khi gặp sự cố cảnh báo hoặc dừng khẩn
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
                Phím h
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-sky-900">
              Về vị trí gốc (Homing)
            </h3>
            <p className="font-body-sm text-xs text-sky-700/90 mt-1">
              Đưa robot về vị trí homing ban đầu và thiết lập lại điểm chuẩn
            </p>
          </button>
        </div>
      </section>

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
                KHUNG LOG HỆ THỐNG & NHẬT KÝ LỖI (LIVE CONSOLE)
              </h3>
            </div>
          </div>

          {/* Controls & Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Filter Tabs */}
            <div className="bg-zinc-900 p-1 rounded-xl flex items-center border border-zinc-800 flex-wrap gap-1">
              <button
                onClick={() => setLogFilter("ALL")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  logFilter === "ALL" ? "bg-zinc-800 text-emerald-400 font-bold" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Tất cả ({logs.length})
              </button>
              <button
                onClick={() => setLogFilter("ERRORS")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                  logFilter === "ERRORS" ? "bg-rose-950/80 text-rose-400 font-bold border border-rose-800/50" : "text-zinc-400 hover:text-rose-400"
                }`}
              >
                🚨 Lỗi & Cảnh báo
              </button>
              <button
                onClick={() => setLogFilter("AI")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                  logFilter === "AI" ? "bg-cyan-950/80 text-cyan-400 font-bold border border-cyan-800/50" : "text-zinc-400 hover:text-cyan-400"
                }`}
              >
                🤖 AI Inspection
              </button>
              <button
                onClick={() => setLogFilter("SERIAL")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                  logFilter === "SERIAL" ? "bg-purple-950/80 text-purple-400 font-bold border border-purple-800/50" : "text-zinc-400 hover:text-purple-400"
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
                  className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-start gap-2 transition-colors ${
                    isError
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
            Tự động làm mới: <span className="text-emerald-400 font-bold">2s/lần</span> | Tổng log ghi nhận: <span className="text-zinc-300 font-bold">{logs.length}</span>
          </div>
        </div>
      </section>

      {/* Quick Toggles Section */}
      <section>
        <h2 className="font-headline-md text-headline-md text-on-surface mb-md font-bold">
          Công tắc thiết bị
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
          <QuickToggleCard
            label="Hệ thống tưới"
            icon="water_drop"
            checked={controls.watering}
            onChange={(checked) => updateControls({ watering: checked })}
          />
          <QuickToggleCard
            label="Đèn LED"
            icon="lightbulb"
            checked={controls.lights}
            onChange={(checked) => updateControls({ lights: checked })}
          />
          <QuickToggleCard
            label="Quạt thông gió"
            icon="mode_fan"
            checked={controls.fan}
            onChange={(checked) => updateControls({ fan: checked })}
          />
          <QuickToggleCard
            label="Máy phun sương"
            icon="air"
            checked={controls.misting}
            onChange={(checked) => updateControls({ misting: checked })}
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

      {/* Device Status Banner */}
      <section className="bg-primary-container/10 border border-primary/20 rounded-2xl p-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-3xl">
            sensors
          </span>
          <div>
            <h4 className="font-body-lg font-bold text-on-surface">
              Trạng thái kết nối IoT Hub & Arduino
            </h4>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Tất cả 4 cảm biến và robot v2.mjs đang hoạt động ổn định (Baud Rate: 9600)
            </p>
          </div>
        </div>
        <span className="bg-primary/20 text-primary font-label-caps text-xs px-3 py-1 rounded-full font-bold uppercase hidden sm:inline-block">
          HOẠT ĐỘNG
        </span>
      </section>

      {/* Shared 2-Tab Irrigation Modal */}
      <IrrigateModal
        isOpen={showIrrigateModal}
        onClose={() => setShowIrrigateModal(false)}
      />
    </div>
  );
}
