"use client";

import { useState, useEffect } from "react";
import { IrrigateModal } from "@/components/fertilizers/IrrigateModal";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

interface ArduinoStatus {
  connected: boolean;
  port: string;
  baudRate: number;
  pointCount: number;
  statusMessage: string;
  lastPingTime?: string;
  allPorts?: string[];
}

interface Esp32Status {
  connected: boolean;
  port: string;
  baudRate: number;
  tankCount: number;
  statusMessage: string;
  lastPingTime?: string;
  allPorts?: string[];
}


interface WifiStatus {
  connected: boolean;
  ssid: string;
  ipAddress: string;
  macAddress: string;
  rssi: number;
  signalPercent: number;
  security: string;
  lastUpdated?: string;
}

interface WifiNetwork {
  ssid: string;
  rssi: number;
  signalPercent: number;
  security: string;
  connected?: boolean;
}

interface SavedWifiNetwork {
  id: string;
  ssid: string;
  security: string;
  ipMode: string;
  lastConnected: string;
  isAutoConnect: boolean;
}

export default function DeviceSettingsPage() {
  const [activeTab, setActiveTab] = useState<"diagnostics" | "wifi" | "telegram">("diagnostics");

  // Telegram state
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);

  // Arduino state
  const [arduinoStatus, setArduinoStatus] = useState<ArduinoStatus>({
    connected: false,
    port: "Đang kiểm tra...",
    baudRate: 9600,
    pointCount: 6,
    statusMessage: "Đang kết nối backend...",
  });
  const [checkingArduino, setCheckingArduino] = useState(false);

  // ESP32 state
  const [esp32Status, setEsp32Status] = useState<Esp32Status>({
    connected: false,
    port: "Đang kiểm tra...",
    baudRate: 115200,
    tankCount: 4,
    statusMessage: "Đang phân biệt cổng với Arduino...",
  });
  const [checkingEsp32, setCheckingEsp32] = useState(false);
  const [showIrrigateModal, setShowIrrigateModal] = useState(false);


  // WiFi state
  const [wifiStatus, setWifiStatus] = useState<WifiStatus>({
    connected: false,
    ssid: "Đang kiểm tra...",
    ipAddress: "Đang lấy IP...",
    macAddress: "Đang lấy MAC...",
    rssi: 0,
    signalPercent: 0,
    security: "--",
  });
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [savedNetworks, setSavedNetworks] = useState<SavedWifiNetwork[]>([]);
  const [scanningWifi, setScanningWifi] = useState(false);
  const [connectingWifi, setConnectingWifi] = useState(false);

  // WiFi Form
  const [selectedSsid, setSelectedSsid] = useState("");
  const [customSsid, setCustomSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [ipMode, setIpMode] = useState<"dhcp" | "static">("dhcp");

  // Feedback Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Helper fetch an toàn tự động thử các gateway (Relative Proxy -> Configured BACKEND_URL -> Localhost fallback)
  const safeFetchJson = async (endpoint: string, options?: RequestInit) => {
    // 1. Thử Relative URL (Next.js rewrites)
    try {
      const res = await fetch(endpoint, options);
      if (res && res.ok) return await res.json();
    } catch (e) { }

    // 2. Thử BACKEND_URL được cấu hình
    if (BACKEND_URL) {
      try {
        const res = await fetch(`${BACKEND_URL}${endpoint}`, options);
        if (res && res.ok) return await res.json();
      } catch (e) { }
    }

    // 3. Fallback thử trực tiếp Localhost Backend (http://localhost:5000)
    try {
      const res = await fetch(`http://localhost:5000${endpoint}`, options);
      if (res && res.ok) return await res.json();
    } catch (e) { }

    return null;
  };

  // Fetch Arduino Status
  const fetchArduinoStatus = async () => {
    const data = await safeFetchJson("/api/arduino/status");
    if (data) {
      setArduinoStatus(data);
    } else {
      setArduinoStatus((prev) => ({
        ...prev,
        connected: false,
        statusMessage: "Không thể kết nối đến Backend Server",
      }));
    }
  };

  // Fetch ESP32 Status
  const fetchEsp32Status = async () => {
    const data = await safeFetchJson("/api/esp32/status");
    if (data) {
      setEsp32Status(data);
    } else {
      setEsp32Status((prev) => ({
        ...prev,
        connected: false,
        statusMessage: "Không thể kết nối đến Backend Server",
      }));
    }
  };

  // Ping Check Arduino
  const handlePingArduino = async () => {
    setCheckingArduino(true);
    try {
      const data = await safeFetchJson("/api/arduino/ping-check", { method: "POST" });
      if (data) {
        if (data.status) setArduinoStatus(data.status);
        showToast(data.message, data.success ? "success" : "error");
      } else {
        showToast("Không thể phản hồi từ máy chủ kiểm tra Arduino", "error");
      }
    } catch (err) {
      showToast("Lỗi kiểm tra Arduino: Không thể kết nối server", "error");
    } finally {
      setCheckingArduino(false);
    }
  };

  // Ping Check ESP32
  const handlePingEsp32 = async () => {
    setCheckingEsp32(true);
    try {
      const data = await safeFetchJson("/api/esp32/ping-check", { method: "POST" });
      if (data) {
        if (data.status) setEsp32Status(data.status);
        showToast(data.message, data.success ? "success" : "error");
      } else {
        showToast("Không thể phản hồi từ máy chủ kiểm tra ESP32", "error");
      }
    } catch (err) {
      showToast("Lỗi kiểm tra ESP32: Không thể kết nối server", "error");
    } finally {
      setCheckingEsp32(false);
    }
  };


  // Fetch WiFi Status
  const fetchWifiStatus = async () => {
    const data = await safeFetchJson("/api/wifi/status");
    if (data) {
      setWifiStatus(data);
      if (data.ssid) setSelectedSsid(data.ssid);
    }
  };

  // Fetch Saved WiFi Networks
  const fetchSavedWifiNetworks = async () => {
    const data = await safeFetchJson("/api/wifi/saved");
    if (data && data.networks) {
      setSavedNetworks(data.networks);
    }
  };

  // Delete Saved WiFi Network
  const handleDeleteSavedWifi = async (ssid: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa mạng Wi-Fi "${ssid}" khỏi danh sách đã lưu?`)) return;
    try {
      const data = await safeFetchJson("/api/wifi/saved/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssid }),
      });
      if (data && data.success) {
        setSavedNetworks(data.networks || []);
        showToast(data.message, "success");
      } else {
        showToast("Xóa mạng Wi-Fi thất bại!", "error");
      }
    } catch (e) {
      showToast("Lỗi khi gửi yêu cầu xóa Wi-Fi!", "error");
    }
  };

  // Scan WiFi Networks
  const handleScanWifi = async (showFeedback = false) => {
    setScanningWifi(true);
    try {
      const data = await safeFetchJson("/api/wifi/scan");
      if (data && data.networks) {
        setNetworks(data.networks);
        if (showFeedback) {
          showToast(`Đã làm mới! Tìm thấy ${data.networks.length} mạng Wi-Fi.`, "success");
        }
      } else if (showFeedback) {
        showToast("Không tìm thấy mạng Wi-Fi nào xung quanh", "error");
      }
    } catch (err) {
      if (showFeedback) {
        showToast("Lỗi khi làm mới danh sách Wi-Fi", "error");
      }
    } finally {
      setScanningWifi(false);
    }
  };

  // Connect to WiFi
  const handleConnectWifi = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSsid = customSsid.trim() || selectedSsid;
    if (!targetSsid) {
      showToast("Vui lòng chọn hoặc nhập tên mạng Wi-Fi!", "error");
      return;
    }

    setConnectingWifi(true);
    try {
      const data = await safeFetchJson("/api/wifi/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ssid: targetSsid,
          password: wifiPassword,
          ipMode,
        }),
      });

      if (data && data.success) {
        setWifiStatus(data.status);
        if (data.savedNetworks) setSavedNetworks(data.savedNetworks);
        else fetchSavedWifiNetworks();
        showToast(data.message, "success");
        setWifiPassword("");
        setCustomSsid("");
      } else if (data && data.error) {
        showToast(data.error, "error");
      } else {
        // Optimistic local update
        const updatedStatus = {
          ...wifiStatus,
          connected: true,
          ssid: targetSsid,
          lastUpdated: new Date().toLocaleTimeString("vi-VN"),
        };
        setWifiStatus(updatedStatus);
        showToast(`Đã lưu và gửi thông số kết nối Wi-Fi "${targetSsid}"!`, "success");
        setWifiPassword("");
        setCustomSsid("");
        fetchSavedWifiNetworks();
      }
    } catch (err) {
      showToast("Lỗi gửi thông tin Wi-Fi xuống thiết bị!", "error");
    } finally {
      setConnectingWifi(false);
    }
  };

  // Telegram Handlers
  const fetchTelegramSettings = async () => {
    const data = await safeFetchJson("/api/settings/telegram");
    if (data) {
      if (data.telegramBotToken) setTelegramBotToken(data.telegramBotToken);
      if (data.telegramChatId) setTelegramChatId(data.telegramChatId);
    }
  };

  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTelegram(true);
    try {
      const data = await safeFetchJson("/api/settings/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramBotToken,
          telegramChatId,
        }),
      });
      if (data && data.success) {
        showToast(data.message, "success");
        fetchTelegramSettings();
      } else {
        showToast(data?.error || "Không thể lưu cấu hình Telegram", "error");
      }
    } catch (err) {
      showToast("Lỗi kết nối tới máy chủ khi lưu Telegram", "error");
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      const data = await safeFetchJson("/api/settings/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramBotToken,
          telegramChatId,
        }),
      });
      if (data && data.success) {
        showToast(data.message, "success");
      } else {
        showToast(data?.error || "Lỗi kiểm tra kết nối Telegram", "error");
      }
    } catch (err) {
      showToast("Lỗi gửi tin nhắn thử nghiệm Telegram", "error");
    } finally {
      setTestingTelegram(false);
    }
  };

  useEffect(() => {
    fetchArduinoStatus();
    fetchEsp32Status();
    fetchWifiStatus();
    fetchSavedWifiNetworks();
    fetchTelegramSettings();
    handleScanWifi();

    // Auto scan Wi-Fi every 15 seconds silently
    const wifiInterval = setInterval(() => {
      handleScanWifi();
    }, 15000);

    return () => {
      clearInterval(wifiInterval);
    };
  }, []);

  return (
    <div className="space-y-xl max-w-5xl mx-auto pb-16">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display-lg text-display-lg font-bold text-on-surface mb-1 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-4xl">settings_suggest</span>
            Cài đặt thiết bị
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Quản lý kết nối phần cứng Arduino, ESP32 và cấu hình Wi-Fi mạng nội bộ
          </p>
        </div>
      </div>

      {/* Toast Banner */}
      {toast && (
        <div
          className={`p-4 rounded-2xl border text-body-sm flex items-center justify-between shadow-md animate-in fade-in slide-in-from-top-2 duration-200 ${toast.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
            : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
            }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-xl">
              {toast.type === "success" ? "check_circle" : "error"}
            </span>
            <span className="font-semibold">{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-outline-variant/20 gap-2">
        <button
          onClick={() => setActiveTab("diagnostics")}
          className={`flex items-center gap-2 px-6 py-3.5 font-headline-sm text-body-lg font-bold transition-all border-b-2 ${activeTab === "diagnostics"
            ? "border-primary text-primary bg-primary/5 rounded-t-xl"
            : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low/50 rounded-t-xl"
            }`}
        >
          <span className="material-symbols-outlined text-2xl">sensors</span>
          Chẩn Đoán Kết Nối
        </button>

        <button
          onClick={() => setActiveTab("wifi")}
          className={`flex items-center gap-2 px-6 py-3.5 font-headline-sm text-body-lg font-bold transition-all border-b-2 ${activeTab === "wifi"
            ? "border-primary text-primary bg-primary/5 rounded-t-xl"
            : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low/50 rounded-t-xl"
            }`}
        >
          <span className="material-symbols-outlined text-2xl">wifi</span>
          Cấu Hình Wi-Fi
        </button>

        <button
          onClick={() => setActiveTab("telegram")}
          className={`flex items-center gap-2 px-6 py-3.5 font-headline-sm text-body-lg font-bold transition-all border-b-2 ${activeTab === "telegram"
            ? "border-primary text-primary bg-primary/5 rounded-t-xl"
            : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low/50 rounded-t-xl"
            }`}
        >
          <span className="material-symbols-outlined text-2xl">send</span>
          Cấu Hình Telegram
        </button>
      </div>

      {/* TAB 1: HARDWARE DIAGNOSTICS (ARDUINO & CAMERA) */}
      {activeTab === "diagnostics" && (
        <div className="space-y-xl animate-in fade-in duration-200">
          {/* SECTION 1: ARDUINO CONNECTION DIAGNOSTICS */}
          <section className="bg-surface-container-lowest rounded-2xl p-lg border border-primary/20 shadow-md space-y-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-md border-b border-outline-variant/15">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <span className="material-symbols-outlined text-3xl">developer_board</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                      1. Chuẩn đoán Arduino
                    </h2>
                    {arduinoStatus.connected ? (
                      <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        ĐÃ KẾT NỐI (ONLINE)
                      </span>
                    ) : (
                      <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        CHƯA KẾT NỐI (OFFLINE)
                      </span>
                    )}
                  </div>
                  <p className="font-body-sm text-xs text-on-surface-variant">
                    {arduinoStatus.statusMessage}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePingArduino}
                  disabled={checkingArduino}
                  className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-xl font-semibold text-body-sm hover:bg-primary-container transition-all active:scale-95 disabled:opacity-50"
                >
                  {checkingArduino ? (
                    <>
                      <span className="material-symbols-outlined text-lg animate-spin">
                        progress_activity
                      </span>
                      Đang kiểm tra...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">sync_lock</span>
                      Kiểm tra
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Arduino Technical Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md pt-sm">
              <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                  CỔNG SERIAL THỰC TẾ
                </span>
                <span className="font-bold text-on-surface text-body-sm block truncate">
                  {arduinoStatus.port}
                </span>
              </div>

              <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                  TỐC ĐỘ BAUD RATE
                </span>
                <span className="font-bold text-on-surface text-body-sm block">
                  {arduinoStatus.baudRate} Baud
                </span>
              </div>

              <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                  SỐ ĐIỂM QUÉT SÂU
                </span>
                <span className="font-bold text-on-surface text-body-sm block">
                  {arduinoStatus.pointCount} Điểm chụp
                </span>
              </div>

              <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                  LẦN PHẢN HỒI CUỐI
                </span>
                <span className="font-bold text-primary text-body-sm block">
                  {arduinoStatus.lastPingTime || "Vừa kiểm tra"}
                </span>
              </div>
            </div>

            {/* Serial Ports Found */}
            {arduinoStatus.allPorts && arduinoStatus.allPorts.length > 0 && (
              <div className="p-3 bg-zinc-900 rounded-xl text-zinc-300 font-mono text-xs space-y-1">
                <div className="text-zinc-400 font-bold border-b border-zinc-700 pb-1 mb-1">
                  CÁC CỔNG SERIAL/USB PHÁT HIỆN TRÊN HỆ THỐNG:
                </div>
                {arduinoStatus.allPorts.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-emerald-400">►</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* SECTION 2: ESP32 CONNECTION DIAGNOSTICS */}
          <section className="bg-surface-container-lowest rounded-2xl p-lg border border-primary/20 shadow-md space-y-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-md border-b border-outline-variant/15">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <span className="material-symbols-outlined text-3xl">memory</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                      2. Chuẩn đoán ESP32
                    </h2>
                    {esp32Status.connected ? (
                      <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        ĐÃ KẾT NỐI (ONLINE)
                      </span>
                    ) : (
                      <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        CHƯA KẾT NỐI (OFFLINE)
                      </span>
                    )}
                  </div>
                  <p className="font-body-sm text-xs text-on-surface-variant">
                    {esp32Status.statusMessage}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePingEsp32}
                  disabled={checkingEsp32}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-body-sm hover:bg-emerald-700 transition-all active:scale-95 shadow-md disabled:opacity-50"
                >
                  {checkingEsp32 ? (
                    <>
                      <span className="material-symbols-outlined text-lg animate-spin">
                        progress_activity
                      </span>
                      Đang kiểm tra...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">sync</span>
                      Kiểm Tra
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* ESP32 Technical Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md pt-sm">
              <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                  CỔNG SERIAL ESP32
                </span>
                <span className="font-bold text-on-surface text-body-sm block truncate">
                  {esp32Status.port}
                </span>
              </div>

              <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                  TỐC ĐỘ BAUD RATE
                </span>
                <span className="font-bold text-on-surface text-body-sm block">
                  {esp32Status.baudRate} Baud
                </span>
              </div>

              <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                  SỐ BÌNH PHÂN ĐIỀU KHIỂN
                </span>
                <span className="font-bold text-on-surface text-body-sm block">
                  {esp32Status.tankCount} Bình (A, B, C, D)
                </span>
              </div>

              <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                  LẦN PHẢN HỒI CUỐI
                </span>
                <span className="font-bold text-emerald-600 text-body-sm block">
                  {esp32Status.lastPingTime || "Vừa kiểm tra"}
                </span>
              </div>
            </div>
          </section>


        </div>
      )}

      {/* TAB 2: WI-FI & NETWORK CONFIGURATION */}
      {activeTab === "wifi" && (
        <div className="space-y-xl animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
            {/* CARD BÊN TRÁI: THÊM & KẾT NỐI MẠNG WI-FI MỚI */}
            <section className="bg-surface-container-lowest rounded-2xl p-lg border border-primary/20 shadow-md space-y-md flex flex-col justify-between">
              <div className="space-y-md">
                <div className="flex items-center gap-3 pb-sm border-b border-outline-variant/15">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-2xl">wifi_password</span>
                  </div>
                  <div>
                    <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
                      Thêm & Kết Nối Mạng Wi-Fi Mới
                    </h3>
                    <p className="font-body-sm text-xs text-on-surface-variant">
                      Nhập thông số SSID & Mật khẩu để truyền dữ liệu xuống thiết bị
                    </p>
                  </div>
                </div>

                <form onSubmit={handleConnectWifi} className="space-y-md">
                  {/* Select from scanned or enter custom */}
                  <div>
                    <label className="block font-label-caps text-xs text-on-surface-variant font-semibold mb-1">
                      CHỌN MẠNG WI-FI (SSID)
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedSsid}
                        onChange={(e) => {
                          setSelectedSsid(e.target.value);
                          if (e.target.value !== "custom") {
                            setCustomSsid("");
                          }
                        }}
                        className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-body-sm font-medium focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-colors"
                      >
                        <option value="">-- Chọn mạng Wi-Fi đã tìm thấy --</option>
                        {networks.map((net, i) => (
                          <option key={i} value={net.ssid}>
                            {net.ssid} ({net.signalPercent}% - {net.security})
                          </option>
                        ))}
                        <option value="custom">+ Nhập tên Wi-Fi ẩn/khác...</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleScanWifi(true)}
                        disabled={scanningWifi}
                        title="Quét lại mạng Wi-Fi ngay"
                        className="p-2.5 bg-surface-container-low border border-outline-variant/30 text-on-surface hover:text-primary hover:bg-surface-container-high rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 shrink-0 flex items-center justify-center"
                      >
                        <span className={`material-symbols-outlined text-lg ${scanningWifi ? "animate-spin text-primary" : ""}`}>
                          refresh
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Custom SSID input if selected custom */}
                  {(selectedSsid === "custom" || networks.length === 0) && (
                    <div>
                      <label className="block font-label-caps text-xs text-on-surface-variant font-semibold mb-1">
                        TÊN MẠNG WI-FI TÙY CHỈNH (SSID)
                      </label>
                      <input
                        type="text"
                        value={customSsid}
                        onChange={(e) => setCustomSsid(e.target.value)}
                        placeholder="Nhập chính xác tên Wi-Fi..."
                        className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-body-sm focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-colors"
                      />
                    </div>
                  )}

                  {/* Password Input */}
                  <div>
                    <label className="block font-label-caps text-xs text-on-surface-variant font-semibold mb-1">
                      MẬT KHẨU WI-FI
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={wifiPassword}
                        onChange={(e) => setWifiPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-3 pr-10 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-body-sm focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary"
                      >
                        <span className="material-symbols-outlined text-lg">
                          {showPassword ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* IP Mode */}
                  <div>
                    <label className="block font-label-caps text-xs text-on-surface-variant font-semibold mb-1">
                      CHẾ ĐỘ CẤP ĐỊA CHỈ IP
                    </label>
                    <div className="grid grid-cols-2 gap-md">
                      <button
                        type="button"
                        onClick={() => setIpMode("dhcp")}
                        className={`p-3 rounded-xl border text-body-sm font-semibold flex items-center justify-center gap-2 transition-all ${ipMode === "dhcp"
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-surface-container-low border-outline-variant/30 text-on-surface-variant"
                          }`}
                      >
                        <span className="material-symbols-outlined text-lg">dynamic_form</span>
                        IP Động (DHCP)
                      </button>
                      <button
                        type="button"
                        onClick={() => setIpMode("static")}
                        className={`p-3 rounded-xl border text-body-sm font-semibold flex items-center justify-center gap-2 transition-all ${ipMode === "static"
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-surface-container-low border-outline-variant/30 text-on-surface-variant"
                          }`}
                      >
                        <span className="material-symbols-outlined text-lg">pin</span>
                        IP Tĩnh (Static)
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={connectingWifi}
                    className="w-full py-3 bg-primary text-on-primary font-semibold rounded-xl hover:bg-primary-container transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                  >
                    {connectingWifi ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-lg">
                          progress_activity
                        </span>
                        Đang kết nối Wi-Fi...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-lg">wifi_protected_setup</span>
                        Lưu & Kết Nối Mạng Wi-Fi
                      </>
                    )}
                  </button>
                </form>
              </div>
            </section>

            {/* CARD BÊN PHẢI: TRẠNG THÁI WI-FI HIỆN TẠI */}
            <section className="bg-surface-container-lowest rounded-2xl p-lg border border-primary/20 shadow-md space-y-md flex flex-col justify-between">
              <div className="space-y-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-sm border-b border-outline-variant/15">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <span className="material-symbols-outlined text-2xl">wifi</span>
                    </div>
                    <div>
                      <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
                        Trạng Thái Wi-Fi Hiện Tại
                      </h3>
                      <p className="font-body-sm text-xs text-on-surface-variant">
                        Thông số mạng thiết bị GrowHub đang kết nối
                      </p>
                    </div>
                  </div>

                  {wifiStatus.connected ? (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 self-start sm:self-center">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      ĐÃ KẾT NỐI
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5 self-start sm:self-center">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      CHƯA KẾT NỐI
                    </span>
                  )}
                </div>

                {/* Status Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-md pt-xs">
                  <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                    <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                      TÊN MẠNG (SSID)
                    </span>
                    <span className="font-bold text-primary text-body-sm block truncate">
                      {wifiStatus.ssid}
                    </span>
                  </div>

                  <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                    <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                      ĐỊA CHỈ IP LOCAL
                    </span>
                    <span className="font-bold text-on-surface text-body-sm block">
                      {wifiStatus.ipAddress}
                    </span>
                  </div>

                  <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                    <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                      CƯỜNG ĐỘ TÍN HIỆU
                    </span>
                    <span className="font-bold text-emerald-600 text-body-sm block">
                      {wifiStatus.signalPercent > 0
                        ? `${wifiStatus.signalPercent}% (${wifiStatus.rssi} dBm)`
                        : "--"}
                    </span>
                  </div>

                  <div className="p-md bg-surface-container-low rounded-xl border border-outline-variant/20">
                    <span className="text-on-surface-variant block font-label-caps text-[10px] font-semibold uppercase mb-1">
                      ĐỊA CHỈ MAC THIẾT BỊ
                    </span>
                    <span className="font-mono font-bold text-on-surface text-body-sm block">
                      {wifiStatus.macAddress}
                    </span>
                  </div>
                </div>
              </div>

              {/* Auto Scan Indicator at bottom of right card */}
              <div className="pt-md border-t border-outline-variant/15 flex items-center justify-between text-xs text-on-surface-variant">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Tự động quét mạng mỗi 15s</span>
                </div>
              </div>
            </section>
          </div>

          {/* SECTION 3: SAVED WI-FI NETWORKS TABLE */}
          <section className="bg-surface-container-lowest rounded-2xl p-lg border border-primary/20 shadow-md space-y-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-sm border-b border-outline-variant/15">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-2xl">bookmark_check</span>
                </div>
                <div>
                  <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
                    Danh Sách Mạng Wi-Fi Đã Lưu
                  </h3>
                  <p className="font-body-sm text-xs text-on-surface-variant">
                    Các cấu hình Wi-Fi được quét và lưu trữ trực tiếp từ thiết bị đang chạy hệ thống
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-3 py-1 bg-surface-container-high rounded-full text-on-surface-variant self-start sm:self-center">
                {savedNetworks.length} mạng đã lưu
              </span>
            </div>

            {savedNetworks.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant/70 text-body-sm">
                Chưa có mạng Wi-Fi nào được lưu. Hãy kết nối một mạng Wi-Fi ở trên để tự động lưu profile.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/20 bg-surface-container-low/50">
                      <th className="py-3 px-4 text-xs font-bold uppercase text-on-surface-variant font-label-caps">Tên Mạng (SSID)</th>
                      <th className="py-3 px-4 text-xs font-bold uppercase text-on-surface-variant font-label-caps">Bảo Mật</th>
                      <th className="py-3 px-4 text-xs font-bold uppercase text-on-surface-variant font-label-caps">Chế Độ IP</th>
                      <th className="py-3 px-4 text-xs font-bold uppercase text-on-surface-variant font-label-caps">Lần Kết Nối Cuối</th>
                      <th className="py-3 px-4 text-xs font-bold uppercase text-on-surface-variant font-label-caps">Trạng Thái</th>
                      <th className="py-3 px-4 text-xs font-bold uppercase text-on-surface-variant font-label-caps text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/15 text-body-sm">
                    {savedNetworks.map((net) => {
                      const isCurrent = wifiStatus.connected && wifiStatus.ssid.toLowerCase() === net.ssid.toLowerCase();
                      return (
                        <tr key={net.id || net.ssid} className="hover:bg-surface-container-low/40 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-on-surface flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-xl">wifi</span>
                            {net.ssid}
                          </td>
                          <td className="py-3.5 px-4 text-on-surface-variant font-medium">
                            {net.security || "WPA2-Personal"}
                          </td>
                          <td className="py-3.5 px-4 text-on-surface-variant">
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container-high text-on-surface">
                              {net.ipMode === "static" ? "IP Tĩnh" : "IP Động (DHCP)"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-on-surface-variant">
                            {net.lastConnected || "Gần đây"}
                          </td>
                          <td className="py-3.5 px-4">
                            {isCurrent ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Đang dùng
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container-high text-on-surface-variant">
                                Đã lưu
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {!isCurrent && (
                                <button
                                  onClick={() => {
                                    setSelectedSsid(net.ssid);
                                    setCustomSsid("");
                                    showToast(`Đã chọn Wi-Fi "${net.ssid}". Nhập mật khẩu và nhấn Kết nối!`);
                                  }}
                                  className="px-3 py-1 bg-primary/10 text-primary hover:bg-primary hover:text-on-primary rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-sm">wifi_protected_setup</span>
                                  Chọn kết nối
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteSavedWifi(net.ssid)}
                                title="Xóa mạng này khỏi danh sách đã lưu"
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: TELEGRAM BOT CONFIGURATION */}
      {activeTab === "telegram" && (
        <div className="space-y-xl animate-in fade-in duration-200">
          <section className="bg-surface-container-lowest rounded-2xl p-lg border border-primary/20 shadow-md space-y-md">
            <div className="flex items-center gap-3 pb-md border-b border-outline-variant/15">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-600">
                <span className="material-symbols-outlined text-3xl">send</span>
              </div>
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
                  Cấu Hình Telegram Bot & Báo Cáo Tự Động
                </h2>
                <p className="font-body-sm text-xs text-on-surface-variant">
                  Tự động nhận thông báo kết quả ảnh phân tích sâu bệnh và các cảnh báo hệ thống từ phần cứng qua Telegram
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveTelegram} className="space-y-md pt-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                {/* Bot Token Field */}
                <div className="space-y-1.5">
                  <label className="block text-body-sm font-bold text-on-surface">
                    Telegram Bot Token <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showTelegramToken ? "text" : "password"}
                      value={telegramBotToken}
                      onChange={(e) => setTelegramBotToken(e.target.value)}
                      placeholder="Ví dụ: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                      className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl font-mono text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTelegramToken(!showTelegramToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined text-xl">
                        {showTelegramToken ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">
                    Tạo Bot qua <span className="font-semibold text-primary">@BotFather</span> trên Telegram để lấy mã API Token này.
                  </p>
                </div>

                {/* Chat ID Field */}
                <div className="space-y-1.5">
                  <label className="block text-body-sm font-bold text-on-surface">
                    Telegram Chat ID / Group ID <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="Ví dụ: 987654321 hoặc -100123456789"
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl font-mono text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[11px] text-on-surface-variant">
                    Lấy ID tài khoản cá nhân qua <span className="font-semibold text-primary">@userinfobot</span> hoặc Chat ID nhóm Telegram.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-md border-t border-outline-variant/15">
                <button
                  type="submit"
                  disabled={savingTelegram}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-body-sm hover:bg-primary-container transition-all active:scale-95 disabled:opacity-50"
                >
                  {savingTelegram ? (
                    <>
                      <span className="material-symbols-outlined text-lg animate-spin">
                        progress_activity
                      </span>
                      Đang lưu...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">save</span>
                      Lưu Cấu Hình Telegram
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={testingTelegram}
                  className="flex items-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-xl font-bold text-body-sm hover:bg-sky-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  {testingTelegram ? (
                    <>
                      <span className="material-symbols-outlined text-lg animate-spin">
                        progress_activity
                      </span>
                      Đang kiểm tra...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">mark_email_read</span>
                      Gửi Tin Nhắn Thử (Test Connection)
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Instruction Box */}
            <div className="p-md bg-sky-500/5 rounded-xl border border-sky-500/20 text-xs text-on-surface space-y-2">
              <div className="flex items-center gap-2 font-bold text-sky-700 dark:text-sky-400">
                <span className="material-symbols-outlined text-lg">help_outline</span>
                Hướng dẫn khởi tạo Telegram Bot nhanh trong 3 bước:
              </div>
              <ol className="list-decimal list-inside space-y-1 text-on-surface-variant">
                <li>Mở ứng dụng Telegram, tìm kiếm <strong>@BotFather</strong> và gõ lệnh <code className="bg-surface-container-high px-1 rounded font-mono">/newbot</code> để tạo Bot mới.</li>
                <li>Sao chép dãy <strong>HTTP API Token</strong> thu được và dán vào ô <em>Telegram Bot Token</em> ở trên.</li>
                <li>Tìm kiếm <strong>@userinfobot</strong> trên Telegram và nhấn <strong>/start</strong> để lấy dãy số <strong>ID</strong> của bạn, dán vào ô <em>Telegram Chat ID</em>.</li>
              </ol>
            </div>
          </section>
        </div>
      )}
      {/* Shared 2-Tab Irrigation Modal */}
      <IrrigateModal
        isOpen={showIrrigateModal}
        onClose={() => setShowIrrigateModal(false)}
      />
    </div>
  );
}
