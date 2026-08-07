"use client";

import { useState, useEffect } from "react";
import { QuickToggleCard } from "@/components/controls/QuickToggleCard";
import { RangeSliderCard } from "@/components/controls/RangeSliderCard";
import { useGarden } from "@/context/GardenContext";

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

export default function ControlsPage() {
  const { controls, updateControls } = useGarden();
  const [sendingCmd, setSendingCmd] = useState<string | null>(null);
  const [activeToast, setActiveToast] = useState<string | null>(null);
  const [commandLogs, setCommandLogs] = useState<CommandLog[]>([]);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [arduinoStatus, setArduinoStatus] = useState<ArduinoStatus>({
    connected: false,
    port: "Đang dò cổng Serial...",
    baudRate: 9600,
    pointCount: 6,
    statusMessage: "Đang kiểm tra thiết bị qua cổng Serial...",
    lastPingTime: "--:--:--",
  });

  const fetchArduinoStatus = async () => {
    try {
      const res = await fetch("/api/arduino/status");
      if (res.ok) {
        const data = await res.json();
        setArduinoStatus(data);
        if (data.lastLogs) {
          setCommandLogs(data.lastLogs);
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

  useEffect(() => {
    fetchArduinoStatus();
  }, []);

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
        setCommandLogs((prev) => [
          {
            timestamp: data.status?.lastPingTime || new Date().toLocaleTimeString("vi-VN"),
            command: "PING",
            label: "Kiểm tra kết nối Arduino thực tế (PING)",
          },
          ...prev.slice(0, 4),
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
        setCommandLogs((prev) => [
          {
            timestamp: data.timestamp || new Date().toLocaleTimeString("vi-VN"),
            command: data.command,
            label: labelName,
          },
          ...prev.slice(0, 4),
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
          Tích hợp mã v2.mjs điều khiển Arduino, quét sâu AI và tự động hóa nhà kính
        </p>
      </div>

      {/* REAL ARDUINO CONNECTION STATUS BANNER */}
      <section className="bg-surface-container-lowest rounded-2xl p-lg border border-primary/20 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-md">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-3xl">developer_board</span>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                  Trạng Thái Kết Nối Arduino Thực Tế
                </h2>
                {arduinoStatus.connected ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    ĐÃ KẾT NỐI
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    CHƯA KẾT NỐI
                  </span>
                )}
              </div>
              <p className="font-body-sm text-xs text-on-surface-variant">
                {arduinoStatus.statusMessage}
              </p>
            </div>
          </div>

          <button
            onClick={handleCheckConnection}
            disabled={checkingStatus}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-xl font-semibold text-body-sm hover:bg-primary-container transition-all active:scale-95 disabled:opacity-50 shrink-0"
          >
            {checkingStatus ? (
              <>
                <span className="material-symbols-outlined text-lg animate-spin">
                  progress_activity
                </span>
                Đang quét cổng Serial...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg">sync_lock</span>
                Kiểm tra kết nối (Ping Test)
              </>
            )}
          </button>
        </div>

        {/* Detailed Hardware Specs Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-sm p-md bg-surface-container-low rounded-xl border border-outline-variant/20 text-xs">
          <div>
            <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase">
              CỔNG SERIAL THỰC TẾ
            </span>
            <span className="font-bold text-on-surface text-body-sm">
              {arduinoStatus.port}
            </span>
          </div>
          <div>
            <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase">
              TỐC ĐỘ BAUD
            </span>
            <span className="font-bold text-on-surface text-body-sm">
              {arduinoStatus.baudRate} Baud
            </span>
          </div>
          <div>
            <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase">
              SỐ ĐIỂM QUÉT
            </span>
            <span className="font-bold text-on-surface text-body-sm">
              {arduinoStatus.pointCount} Điểm kiểm tra
            </span>
          </div>
          <div>
            <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase">
              LẦN PING CUỐI
            </span>
            <span className="font-bold text-primary text-body-sm">
              {arduinoStatus.lastPingTime || "Chưa gửi"}
            </span>
          </div>
        </div>
      </section>

      {/* Robot v2.mjs Control Panel */}
      <section className="bg-surface-container-lowest rounded-2xl p-lg border border-primary/20 shadow-md">
        <div className="flex items-center gap-3 mb-md pb-sm border-b border-outline-variant/15">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-2xl">smart_toy</span>
          </div>
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
              Bộ Điều Khiển Robot (v2.mjs)
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
              Chụp 6 điểm bằng camera & phân tích hình ảnh qua AI Gemini (v2.mjs)
            </p>
          </button>

          {/* Homing (h) */}
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

          {/* Ping Connection (ping) */}
          <button
            onClick={() => sendRobotCommand("ping", "Ping Arduino (ping)")}
            disabled={sendingCmd === "ping"}
            className="flex flex-col p-4 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200 rounded-2xl text-left transition-all active:scale-[0.98] group"
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="material-symbols-outlined text-3xl text-indigo-700 group-hover:scale-110 transition-transform">
                sensors
              </span>
              <span className="font-mono text-xs px-2 py-0.5 bg-indigo-200 text-indigo-800 rounded font-bold">
                ping
              </span>
            </div>
            <h3 className="font-headline-sm text-body-lg font-bold text-indigo-900">
              Kiểm tra kết nối (Ping)
            </h3>
            <p className="font-body-sm text-xs text-indigo-700/90 mt-1">
              Gửi tín hiệu PING kiểm tra phản hồi PONG từ mạch Arduino
            </p>
          </button>
        </div>

        {/* Command Log Terminal */}
        {commandLogs.length > 0 && (
          <div className="mt-md p-md bg-zinc-900 rounded-xl text-zinc-100 font-mono text-xs space-y-1">
            <div className="flex items-center justify-between text-zinc-400 border-b border-zinc-700 pb-1 mb-2">
              <span>LỊCH SỬ GỬI LỆNH V2.MJS (SERIAL LOG)</span>
              <span>PORT: SERIAL DETECTED</span>
            </div>
            {commandLogs.map((log, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-zinc-500">[{log.timestamp}]</span>
                <span className="text-emerald-400 font-bold">&gt; Node -&gt; Arduino:</span>
                <span className="text-amber-300">{log.command}</span>
                <span className="text-zinc-400">({log.label})</span>
              </div>
            ))}
          </div>
        )}
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
    </div>
  );
}
