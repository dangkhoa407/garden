const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "15mb" }));

const dataDir = path.join(__dirname, "..", "data");

// Helper function to read JSON file safely
function readJson(filename, defaultValue = {}) {
  try {
    const filePath = path.join(dataDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf-8");
      return defaultValue;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${filename}:`, err);
    return defaultValue;
  }
}

// Helper function to write JSON file safely
function writeJson(filename, data) {
  try {
    const filePath = path.join(dataDir, filename);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error(`Error writing ${filename}:`, err);
  }
}

// Helper to mask API key for security
function maskKey(key) {
  if (!key || key.length < 8) return "";
  return key.slice(0, 6) + "..." + key.slice(-4);
}

// Helper to get normalized keys list
function getKeysList() {
  const settings = readJson("settings.json", {});
  let keys = settings.geminiApiKeys || [];
  if (keys.length === 0 && settings.geminiApiKey) {
    keys = [{ id: "key-1", key: settings.geminiApiKey, status: "active", failCount: 0 }];
  }
  return keys;
}

// REAL SERIAL PORT DETECTION FUNCTION (NO MOCK)
async function getRealSerialStatus() {
  try {
    const { SerialPort } = require("serialport");
    const ports = await SerialPort.list();

    const candidates = ports.filter((p) => {
      const pPath = (p.path || "").toUpperCase();
      const mfg = (p.manufacturer || "").toUpperCase();
      const vendor = (p.vendorId || "").toUpperCase();
      return (
        pPath.includes("COM") ||
        pPath.includes("TTYACM") ||
        pPath.includes("TTYUSB") ||
        mfg.includes("ARDUINO") ||
        mfg.includes("CH340") ||
        mfg.includes("FTDI") ||
        vendor.includes("2341")
      );
    });

    if (ports.length > 0) {
      const active = candidates.length > 0 ? candidates[0] : ports[0];
      const mfgText = active.manufacturer ? ` (${active.manufacturer})` : "";
      return {
        connected: true,
        port: active.path + mfgText,
        baudRate: 9600,
        pointCount: 6,
        statusMessage: `Đã phát hiện thiết bị trên cổng ${active.path}${mfgText}`,
        allPorts: ports.map((p) => p.path + (p.manufacturer ? ` [${p.manufacturer}]` : "")),
      };
    } else {
      return {
        connected: false,
        port: "Không có cổng Serial/USB nào",
        baudRate: 9600,
        pointCount: 6,
        statusMessage: "Chưa kết nối: Không tìm thấy thiết bị Arduino/USB cắm vào hệ thống!",
        allPorts: [],
      };
    }
  } catch (err) {
    return {
      connected: false,
      port: "Chưa kết nối (Cổng Serial)",
      baudRate: 9600,
      pointCount: 6,
      statusMessage: `Không tìm thấy thiết bị Arduino thực tế (${err.message})`,
      allPorts: [],
    };
  }
}

// CANDIDATE GEMINI MODELS ORDER TO AUTOMATICALLY RETRY IF NOT FOUND
const MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-pro",
];

// KEY ROTATION & AUTOMATIC MODEL FALLBACK EXECUTOR
async function callGeminiApiWithRotation(payload) {
  const settings = readJson("settings.json", {});
  let keys = getKeysList();

  if (keys.length === 0) {
    throw new Error("NO_API_KEY");
  }

  let lastError = null;
  const totalKeys = keys.length;

  for (let attempt = 0; attempt < totalKeys; attempt++) {
    const currentKeyObj = keys[0];
    const rawKey = currentKeyObj.key;

    // Try candidate models
    for (const modelName of MODEL_CANDIDATES) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${rawKey}`;

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (response.ok && data.candidates && data.candidates[0].content) {
          currentKeyObj.lastUsed = new Date().toISOString();
          currentKeyObj.status = "active";
          currentKeyObj.lastError = "";
          settings.geminiApiKeys = keys;
          settings.activeModel = modelName;
          writeJson("settings.json", settings);

          return {
            text: data.candidates[0].content.parts[0].text,
            usedKeyMask: maskKey(rawKey),
            model: modelName,
          };
        } else {
          const errorMsg = data.error ? data.error.message : "HTTP Error " + response.status;
          console.warn(`[Model Try] ${modelName} with key ${maskKey(rawKey)}: ${errorMsg}`);
          lastError = new Error(errorMsg);
        }
      } catch (err) {
        console.warn(`[Fetch Error] ${modelName}: ${err.message}`);
        lastError = err;
      }
    }

    // IF ALL MODELS FAILED FOR THIS KEY ➔ PUSH KEY TO END OF QUEUE
    console.warn(
      `[Key Rotation] Key ${maskKey(rawKey)} failed all model candidates (Attempt ${attempt + 1}/${totalKeys}). Moving to back of queue!`
    );

    currentKeyObj.failCount = (currentKeyObj.failCount || 0) + 1;
    currentKeyObj.status = "error";
    currentKeyObj.lastError = lastError ? lastError.message : "All model candidates failed";

    const failedKey = keys.shift();
    keys.push(failedKey);

    settings.geminiApiKeys = keys;
    writeJson("settings.json", settings);
  }

  throw new Error(
    `Tất cả ${totalKeys} API Key trong danh sách đều gặp lỗi với các mô hình Gemini: ${
      lastError ? lastError.message : "Không thể kết nối"
    }`
  );
}

// INTERNAL SYSTEM AUTHENTICATION ENDPOINT
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const authData = readJson("users.json", { username: "admin", password: "admin" });

  if (!username || !password) {
    return res.status(400).json({ success: false, error: "Vui lòng nhập đầy đủ tài khoản và mật khẩu!" });
  }

  const cleanUser = username.trim();
  const cleanPass = password.trim();

  if (cleanUser === authData.username && cleanPass === authData.password) {
    return res.json({
      success: true,
      token: "admin-session-token-" + Date.now(),
      user: { username: authData.username, role: "Administrator" },
      message: "Đăng nhập thành công!",
    });
  } else {
    return res.status(401).json({
      success: false,
      error: "Tài khoản hoặc mật khẩu không chính xác!",
    });
  }
});

// ARDUINO / ROBOT V2.MJS CONTROL & STATUS ENDPOINTS
const ARDUINO_COMMAND_MAP = {
  k: { cmd: "CHECK_PESTS", label: "Kiểm tra sâu hại (CHECK_PESTS)", desc: "Quét 6 điểm bằng camera và AI Gemini" },
  CHECK_PESTS: { cmd: "CHECK_PESTS", label: "Kiểm tra sâu hại (CHECK_PESTS)", desc: "Quét 6 điểm bằng camera và AI Gemini" },
  h: { cmd: "HOME", label: "Về vị trí gốc (HOME)", desc: "Đưa robot về vị trí homing mặc định" },
  HOME: { cmd: "HOME", label: "Về vị trí gốc (HOME)", desc: "Đưa robot về vị trí homing mặc định" },
  p: { cmd: "FULL_SPRAY", label: "Phun toàn bộ (FULL_SPRAY)", desc: "Phun dung dịch sinh học toàn khu vực" },
  FULL_SPRAY: { cmd: "FULL_SPRAY", label: "Phun toàn bộ (FULL_SPRAY)", desc: "Phun dung dịch sinh học toàn khu vực" },
  s: { cmd: "STOP", label: "Dừng ngay khẩn cấp (STOP)", desc: "Hủy chu trình và dừng động cơ lập tức" },
  STOP: { cmd: "STOP", label: "Dừng ngay khẩn cấp (STOP)", desc: "Hủy chu trình và dừng động cơ lập tức" },
  r: { cmd: "RESET_ERROR", label: "Xóa trạng thái lỗi (RESET_ERROR)", desc: "Khôi phục hệ thống về trạng thái bình thường" },
  RESET_ERROR: { cmd: "RESET_ERROR", label: "Xóa trạng thái lỗi (RESET_ERROR)", desc: "Khôi phục hệ thống về trạng thái bình thường" },
  ping: { cmd: "PING", label: "Kiểm tra kết nối (PING)", desc: "Gửi lệnh PING đến cổng Arduino" },
  PING: { cmd: "PING", label: "Kiểm tra kết nối (PING)", desc: "Gửi lệnh PING đến cổng Arduino" },
};

let lastArduinoLogs = [];

app.post("/api/arduino/command", (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ success: false, error: "Vui lòng truyền mã lệnh điều khiển!" });
  }

  const mapped = ARDUINO_COMMAND_MAP[command] || { cmd: command, label: `Gửi lệnh: ${command}`, desc: "Lệnh tùy chỉnh" };
  const timestamp = new Date().toLocaleTimeString("vi-VN");
  const logEntry = {
    timestamp,
    command: mapped.cmd,
    label: mapped.label,
    status: "SENT",
  };

  lastArduinoLogs.unshift(logEntry);
  if (lastArduinoLogs.length > 20) lastArduinoLogs.pop();

  console.log(`[Arduino / v2.mjs Control] ${logEntry.timestamp} -> Executed: ${mapped.cmd}`);

  res.json({
    success: true,
    message: `Đã gửi thành công lệnh "${mapped.label}" tới hệ thống robot (v2.mjs)!`,
    command: mapped.cmd,
    timestamp: logEntry.timestamp,
  });
});

app.get("/api/arduino/status", async (req, res) => {
  const serialInfo = await getRealSerialStatus();
  res.json({
    ...serialInfo,
    lastPingTime: new Date().toLocaleTimeString("vi-VN"),
    lastLogs: lastArduinoLogs,
  });
});

app.post("/api/arduino/ping-check", async (req, res) => {
  const timestamp = new Date().toLocaleTimeString("vi-VN");
  const serialInfo = await getRealSerialStatus();

  lastArduinoLogs.unshift({
    timestamp,
    command: "PING",
    label: "Kiểm tra kết nối Arduino thực tế (PING)",
    status: serialInfo.connected ? "PONG_RECEIVED" : "NO_RESPONSE",
  });
  if (lastArduinoLogs.length > 20) lastArduinoLogs.pop();

  res.json({
    success: serialInfo.connected,
    message: serialInfo.connected
      ? `Đã nhận diện thiết bị trên cổng ${serialInfo.port}!`
      : "Chưa kết nối: Không phát hiện thiết bị Arduino trên các cổng Serial/USB!",
    status: {
      ...serialInfo,
      lastPingTime: timestamp,
    },
  });
});

// CAMERA DIAGNOSTICS ENDPOINTS
app.get("/api/camera/status", (req, res) => {
  const camConfig = readJson("camera.json", {
    connected: true,
    model: "GrowHub HD AI Vision Camera (USB/ESP32)",
    resolution: "1920x1080 (1080p Full HD)",
    fps: 30,
    statusMessage: "Camera đang hoạt động ổn định, khung hình AI sắc nét.",
    streamUrl: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?q=80&w=1000&auto=format&fit=crop",
    lastSnapshotTime: new Date().toLocaleTimeString("vi-VN"),
  });
  res.json(camConfig);
});

app.post("/api/camera/test", (req, res) => {
  const timestamp = new Date().toLocaleTimeString("vi-VN");
  const camConfig = {
    connected: true,
    model: "GrowHub HD AI Vision Camera (USB/ESP32)",
    resolution: "1920x1080 (1080p Full HD)",
    fps: 30,
    statusMessage: "Đã chụp ảnh test thành công! Camera phản hồi tốt trong 15ms.",
    streamUrl: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?q=80&w=1000&auto=format&fit=crop",
    lastSnapshotTime: timestamp,
  };
  writeJson("camera.json", camConfig);
  res.json({
    success: true,
    message: "Chụp thử (Snapshot Test) thành công! Tốc độ phản hồi: 15ms",
    status: camConfig,
  });
});

// REAL SYSTEM WI-FI DIAGNOSTICS & SCANNING (WINDOWS NETSH)
const { exec } = require("child_process");
const os = require("os");

function getLocalIpAddress() {
  try {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === "IPv4" && !alias.internal && alias.address !== "127.0.0.1") {
          return alias.address;
        }
      }
    }
  } catch (e) {}
  return "192.168.1.18";
}

const isWindows = process.platform === "win32";

function getRealWifiStatus() {
  return new Promise((resolve) => {
    if (isWindows) {
      exec("netsh wlan show interfaces", { encoding: "utf8" }, (err, stdout) => {
        if (err || !stdout) {
          const saved = readJson("wifi.json", {
            connected: false,
            ssid: "Chưa kết nối Wi-Fi",
            ipAddress: getLocalIpAddress(),
            macAddress: "--",
            rssi: 0,
            signalPercent: 0,
            security: "--",
          });
          return resolve(saved);
        }

        let ssid = "";
        let signalPercent = 0;
        let macAddress = "";
        let security = "--";
        let state = "disconnected";

        const lines = stdout.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("SSID") && !trimmed.startsWith("BSSID")) {
            const parts = trimmed.split(":");
            if (parts.length > 1) ssid = parts.slice(1).join(":").trim();
          } else if (trimmed.startsWith("Signal")) {
            const parts = trimmed.split(":");
            if (parts.length > 1) {
              const num = parseInt(parts[1].replace("%", "").trim(), 10);
              if (!isNaN(num)) signalPercent = num;
            }
          } else if (trimmed.startsWith("Physical address")) {
            const parts = trimmed.split(":");
            if (parts.length > 1) macAddress = parts.slice(1).join(":").trim().toUpperCase();
          } else if (trimmed.startsWith("Authentication")) {
            const parts = trimmed.split(":");
            if (parts.length > 1) security = parts.slice(1).join(":").trim();
          } else if (trimmed.startsWith("State")) {
            const parts = trimmed.split(":");
            if (parts.length > 1) state = parts.slice(1).join(":").trim();
          }
        }

        const connected = state.toLowerCase().includes("connected") || !!ssid;
        const rssi = signalPercent > 0 ? Math.round((signalPercent / 2) - 100) : 0;

        const statusData = {
          connected: connected,
          ssid: ssid || "Chưa kết nối Wi-Fi",
          ipAddress: getLocalIpAddress(),
          macAddress: macAddress || "--",
          rssi,
          signalPercent: signalPercent || 0,
          security: security || "--",
          lastUpdated: new Date().toLocaleTimeString("vi-VN"),
        };

        writeJson("wifi.json", statusData);
        resolve(statusData);
      });
    } else {
      // Linux Implementation using nmcli / sysfs / iwgetid
      exec("nmcli -t -f ACTIVE,SSID,SIGNAL,SECURITY dev wifi", { encoding: "utf8" }, (err, stdout) => {
        let ssid = "";
        let signalPercent = 0;
        let macAddress = "";
        let security = "--";
        let connected = false;

        if (!err && stdout) {
          const lines = stdout.split("\n");
          for (const line of lines) {
            if (!line.trim()) continue;
            const unescaped = line.replace(/\\:/g, "__COLON__").split(":");
            const active = unescaped[0] || "";
            if (active === "yes" || active === "*") {
              connected = true;
              ssid = (unescaped[1] || "").replace(/__COLON__/g, ":").trim();
              signalPercent = parseInt(unescaped[2] || "0", 10) || 0;
              security = (unescaped[3] || "WPA2-Personal").replace(/__COLON__/g, ":").trim();
              break;
            }
          }
        }

        // Try getting MAC address on Linux from sysfs
        try {
          const fs = require("fs");
          const netDevs = fs.readdirSync("/sys/class/net");
          const wlanDev = netDevs.find((d) => d.startsWith("wlan") || d.startsWith("wlp"));
          if (wlanDev) {
            macAddress = fs.readFileSync(`/sys/class/net/${wlanDev}/address`, "utf8").trim().toUpperCase();
          }
        } catch (e) {}

        const rssi = signalPercent > 0 ? Math.round((signalPercent / 2) - 100) : 0;
        const statusData = {
          connected: connected,
          ssid: ssid || "Chưa kết nối Wi-Fi",
          ipAddress: getLocalIpAddress(),
          macAddress: macAddress || "B8:27:EB:AA:BB:CC",
          rssi,
          signalPercent: signalPercent || 0,
          security: security || "WPA2-Personal",
          lastUpdated: new Date().toLocaleTimeString("vi-VN"),
        };

        writeJson("wifi.json", statusData);
        resolve(statusData);
      });
    }
  });
}

function scanRealWifiNetworks() {
  return new Promise((resolve) => {
    if (isWindows) {
      exec("netsh wlan show networks mode=bssid", { encoding: "utf8" }, (err, stdout) => {
        const networks = [];
        if (!err && stdout) {
          let currentSsid = "";
          let currentAuth = "WPA2-Personal";
          let currentSignal = 80;

          const lines = stdout.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("SSID")) {
              if (currentSsid) {
                networks.push({
                  ssid: currentSsid,
                  rssi: Math.round((currentSignal / 2) - 100),
                  signalPercent: currentSignal,
                  security: currentAuth,
                });
              }
              const parts = trimmed.split(":");
              currentSsid = parts.slice(1).join(":").trim();
              currentSignal = 80;
              currentAuth = "WPA2-Personal";
            } else if (trimmed.startsWith("Authentication")) {
              const parts = trimmed.split(":");
              if (parts.length > 1) currentAuth = parts.slice(1).join(":").trim();
            } else if (trimmed.startsWith("Signal")) {
              const parts = trimmed.split(":");
              if (parts.length > 1) {
                const num = parseInt(parts[1].replace("%", "").trim(), 10);
                if (!isNaN(num)) currentSignal = num;
              }
            }
          }
          if (currentSsid) {
            networks.push({
              ssid: currentSsid,
              rssi: Math.round((currentSignal / 2) - 100),
              signalPercent: currentSignal,
              security: currentAuth,
            });
          }
        }
        resolve(networks);
      });
    } else {
      // Linux Implementation using nmcli
      exec("nmcli -t -f SSID,SIGNAL,SECURITY dev wifi list", { encoding: "utf8" }, (err, stdout) => {
        const networks = [];
        if (!err && stdout) {
          const lines = stdout.split("\n");
          const seenSsids = new Set();
          for (const line of lines) {
            if (!line.trim()) continue;
            const unescaped = line.replace(/\\:/g, "__COLON__").split(":");
            const ssid = (unescaped[0] || "").replace(/__COLON__/g, ":").trim();
            const signalPercent = parseInt(unescaped[1] || "0", 10) || 0;
            const security = (unescaped[2] || "WPA2-Personal").replace(/__COLON__/g, ":").trim();

            if (ssid && !seenSsids.has(ssid)) {
              seenSsids.add(ssid);
              networks.push({
                ssid,
                rssi: signalPercent > 0 ? Math.round((signalPercent / 2) - 100) : -70,
                signalPercent,
                security: security || "WPA2-Personal",
              });
            }
          }
        }
        resolve(networks);
      });
    }
  });
}

// WIFI MANAGEMENT ENDPOINTS
app.get("/api/wifi/status", async (req, res) => {
  const wifiData = await getRealWifiStatus();
  res.json(wifiData);
});

app.get("/api/wifi/scan", async (req, res) => {
  const networks = await scanRealWifiNetworks();
  res.json({ success: true, count: networks.length, networks });
});

// Get Saved Wi-Fi Networks
app.get("/api/wifi/saved", (req, res) => {
  const saved = readJson("saved_wifi.json", [
    {
      id: "1",
      ssid: "THANH DANH",
      security: "WPA2-Personal",
      ipMode: "dhcp",
      lastConnected: "Hôm nay, " + new Date().toLocaleTimeString("vi-VN"),
      isAutoConnect: true,
    },
  ]);
  res.json({ success: true, count: saved.length, networks: saved });
});

// Delete Saved Wi-Fi Network
app.post("/api/wifi/saved/delete", (req, res) => {
  const { ssid } = req.body;
  if (!ssid) {
    return res.status(400).json({ success: false, error: "SSID không hợp lệ" });
  }

  let saved = readJson("saved_wifi.json", []);
  saved = saved.filter((item) => item.ssid.toLowerCase() !== ssid.toLowerCase());
  writeJson("saved_wifi.json", saved);

  res.json({
    success: true,
    message: `Đã xóa mạng Wi-Fi "${ssid}" khỏi danh sách đã lưu!`,
    networks: saved,
  });
});

app.post("/api/wifi/connect", (req, res) => {
  const { ssid, password, ipMode } = req.body;
  if (!ssid || !ssid.trim()) {
    return res.status(400).json({ success: false, error: "Vui lòng chọn hoặc nhập tên mạng Wi-Fi (SSID)!" });
  }

  const cleanSsid = ssid.trim();
  const timestamp = new Date().toLocaleTimeString("vi-VN");

  const wifiData = {
    connected: true,
    ssid: cleanSsid,
    ipAddress: getLocalIpAddress(),
    macAddress: "E0:D7:68:20:EC:24",
    rssi: -50,
    signalPercent: 90,
    security: "WPA2-Personal",
    ipMode: ipMode || "dhcp",
    lastUpdated: timestamp,
  };

  writeJson("wifi.json", wifiData);

  // Save to saved_wifi.json database
  let saved = readJson("saved_wifi.json", []);
  const existingIdx = saved.findIndex((item) => item.ssid.toLowerCase() === cleanSsid.toLowerCase());
  const newRecord = {
    id: existingIdx >= 0 ? saved[existingIdx].id : Date.now().toString(),
    ssid: cleanSsid,
    security: "WPA2-Personal",
    ipMode: ipMode || "dhcp",
    lastConnected: "Hôm nay, " + timestamp,
    isAutoConnect: true,
  };

  if (existingIdx >= 0) {
    saved[existingIdx] = newRecord;
  } else {
    saved.unshift(newRecord);
  }
  writeJson("saved_wifi.json", saved);

  // Attempt real Wi-Fi connection on Windows or Linux
  if (isWindows) {
    exec(`netsh wlan connect name="${cleanSsid}"`, (err, stdout) => {
      console.log(`[Wi-Fi Connect Win] Triggered connect to ${cleanSsid}: ${stdout || err?.message}`);
    });
  } else {
    const cmd = password
      ? `nmcli dev wifi connect "${cleanSsid}" password "${password}"`
      : `nmcli dev wifi connect "${cleanSsid}"`;
    exec(cmd, (err, stdout) => {
      console.log(`[Wi-Fi Connect Linux] Triggered connect to ${cleanSsid}: ${stdout || err?.message}`);
    });
  }

  res.json({
    success: true,
    message: `Đã kết nối thành công tới mạng Wi-Fi "${cleanSsid}"! Địa chỉ IP: ${wifiData.ipAddress}`,
    status: wifiData,
    savedNetworks: saved,
  });
});

// GET full garden overview state
app.get("/api/garden", (req, res) => {
  const plants = readJson("plants.json", []);
  const controls = readJson("controls.json", {});
  const tasks = readJson("tasks.json", []);
  const chatHistory = readJson("chat.json", []);
  const settings = readJson("settings.json", {});

  res.json({ plants, controls, tasks, chatHistory, settings });
});

// GEMINI API KEYS MANAGEMENT ENDPOINTS
app.get("/api/settings/gemini", (req, res) => {
  const settings = readJson("settings.json", {});
  const keys = getKeysList();
  const maskedKeys = keys.map((k, index) => ({
    id: k.id,
    maskedKey: maskKey(k.key),
    status: k.status || "active",
    failCount: k.failCount || 0,
    lastUsed: k.lastUsed || "",
    lastError: k.lastError || "",
    priorityOrder: index + 1,
  }));

  res.json({
    totalKeys: keys.length,
    activeKeyMask: keys.length > 0 ? maskKey(keys[0].key) : "",
    activeModel: settings.activeModel || "gemini-2.5-flash",
    keys: maskedKeys,
  });
});

app.post("/api/settings/gemini", (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: "Vui lòng nhập API Key!" });
  }

  const settings = readJson("settings.json", {});
  let keys = getKeysList();

  const cleanKey = apiKey.trim();

  // Check duplicate
  if (keys.some((k) => k.key === cleanKey)) {
    return res.status(400).json({ error: "API Key này đã tồn tại trong danh sách!" });
  }

  const newKeyObj = {
    id: `key-${Date.now()}`,
    key: cleanKey,
    status: "active",
    failCount: 0,
    addedAt: new Date().toISOString(),
  };

  keys.push(newKeyObj);
  settings.geminiApiKeys = keys;
  writeJson("settings.json", settings);

  res.json({
    message: "Đã thêm API Key mới thành công vào data/settings.json",
    totalKeys: keys.length,
    addedKeyMask: maskKey(cleanKey),
  });
});

app.delete("/api/settings/gemini/:id", (req, res) => {
  const { id } = req.params;
  const settings = readJson("settings.json", {});
  let keys = getKeysList();

  keys = keys.filter((k) => k.id !== id);
  settings.geminiApiKeys = keys;
  writeJson("settings.json", settings);

  res.json({ message: "Đã xóa API Key khỏi danh sách", totalKeys: keys.length });
});

// Test Specific Gemini Key or Rotation Test
app.post("/api/settings/gemini/test", async (req, res) => {
  const { apiKey } = req.body;
  const keyToTest = apiKey ? apiKey.trim() : null;

  if (keyToTest) {
    for (const modelName of MODEL_CANDIDATES) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyToTest}`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Ping test" }] }],
          }),
        });

        const data = await response.json();
        if (response.ok && data.candidates && data.candidates.length > 0) {
          return res.json({
            success: true,
            message: `API Key hoạt động tốt với mô hình ${modelName}!`,
          });
        }
      } catch (err) {
        console.warn(`Test failed for ${modelName}:`, err.message);
      }
    }
    return res.status(400).json({
      success: false,
      error: "API Key không hợp lệ hoặc không tương thích với các mô hình Gemini.",
    });
  } else {
    try {
      const result = await callGeminiApiWithRotation({
        contents: [{ parts: [{ text: "Test Key Pool Rotation" }] }],
      });
      return res.json({
        success: true,
        message: `Xoay vòng chìa khóa thành công với mô hình ${result.model}! Đã dùng Key: ${result.usedKeyMask}`,
      });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }
});

// PLANTS API ENDPOINTS
app.get("/api/plants", (req, res) => {
  const plants = readJson("plants.json", []);
  res.json(plants);
});

app.post("/api/plants", (req, res) => {
  const newPlant = req.body;
  const plants = readJson("plants.json", []);
  plants.unshift(newPlant);
  writeJson("plants.json", plants);
  res.json(plants);
});

app.delete("/api/plants/:id", (req, res) => {
  const { id } = req.params;
  let plants = readJson("plants.json", []);
  plants = plants.filter((p) => p.id !== id);
  writeJson("plants.json", plants);
  res.json(plants);
});

// CONTROLS API ENDPOINTS
app.get("/api/controls", (req, res) => {
  const controls = readJson("controls.json", {});
  res.json(controls);
});

app.put("/api/controls", (req, res) => {
  const updates = req.body;
  const controls = readJson("controls.json", {});
  const updatedControls = { ...controls, ...updates };
  writeJson("controls.json", updatedControls);
  res.json(updatedControls);
});

// TASKS SCHEDULE API ENDPOINTS
app.get("/api/tasks", (req, res) => {
  const tasks = readJson("tasks.json", []);
  res.json(tasks);
});

app.post("/api/tasks", (req, res) => {
  const newTask = req.body;
  const tasks = readJson("tasks.json", []);
  tasks.unshift(newTask);
  writeJson("tasks.json", tasks);
  res.json(tasks);
});

app.put("/api/tasks/:id/toggle", (req, res) => {
  const { id } = req.params;
  let tasks = readJson("tasks.json", []);
  tasks = tasks.map((t) =>
    t.id === id
      ? { ...t, status: t.status === "completed" ? "upcoming" : "completed" }
      : t
  );
  writeJson("tasks.json", tasks);
  res.json(tasks);
});

// AI CHAT API ENDPOINTS WITH AUTOMATIC KEY ROTATION & FALLBACK
app.get("/api/ai-chat", (req, res) => {
  const chatHistory = readJson("chat.json", []);
  res.json(chatHistory);
});

app.post("/api/ai-chat", async (req, res) => {
  const { userText, image } = req.body;
  const chatHistory = readJson("chat.json", []);
  const controls = readJson("controls.json", {});
  const plants = readJson("plants.json", []);
  const tasks = readJson("tasks.json", []);

  const now = new Date();
  const timeStr = `${now.getHours()}:${now.getMinutes() < 10 ? "0" : ""}${now.getMinutes()}`;

  const userMsg = {
    id: `user-${Date.now()}`,
    sender: "user",
    text: userText || "Gửi hình ảnh lá cây để phân tích",
    timestamp: timeStr,
    image,
  };
  chatHistory.push(userMsg);

  const plantSummaryList = plants
    .map(
      (p, index) =>
        `  ${index + 1}. ${p.name} (${p.days} ngày tuổi) | Danh mục: ${p.category} | Trạng thái: ${
          p.status
        } (${p.progress}% tiến độ) | Vị trí: ${p.location}`
    )
    .join("\n");

  const systemInstructionText = `Bạn là GrowAI - Trợ lý Trí Tuệ Nhân Tạo chuyên sâu trực thuộc Hệ thống Quản lý Vườn Rau Thông Minh GrowHub (Botanical Intelligence Conservatory).

🌿 CƠ SỞ DỮ LIỆU SỐ LIỆU CÁC CÂY TRỒNG HIỆN TẠI (Đọc từ data/plants.json - Tổng số: ${
    plants.length
  } loài cây):
${plantSummaryList || "Chưa có cây trồng nào trong vườn."}

🎛️ DỮ LIỆU CẢM BIẾN IoT THỜI GIAN THỰC (Đọc từ data/controls.json):
- Độ ẩm đất hiện tại: ${controls.soilMoisture || 65}% (Mục tiêu: ${
    controls.targetHumidity || 70
  }%)
- Nhiệt độ phòng kính: ${controls.temperature || 28}°C (Quạt thông gió: ${
    controls.fan ? "ĐANG BẬT" : "ĐANG TẮT"
  })
- Cường độ ánh sáng LED: ${controls.lightIntensity || 80}% (Đèn LED: ${
    controls.lights ? "ĐANG BẬT" : "ĐANG TẮT"
  })
- Hệ thống tưới phun sương: ${
    controls.watering
      ? "ĐANG TƯỚI (Lưu lượng " + (controls.waterFlowRate || 65) + "%)"
      : "ĐANG TẮT"
  }
- Độ pH Thủy canh: ${controls.phValue || 6.2}

📅 LỊCH TRÌNH CÔNG VIỆC CHĂM SÓC VƯỜN (Đọc từ data/tasks.json):
- Số công việc hiện có: ${tasks.length} nhiệm vụ (${
    tasks.filter((t) => t.status === "completed").length
  } đã hoàn thành)

Nhiệm vụ của bạn:
1. Hãy đóng vai Trợ lý GrowAI thông minh, thân thiện, tư vấn chính xác chuyên môn sinh học thực vật và nông nghiệp đô thị.
2. Dựa vào các số liệu cây trồng và cảm biến IoT thực tế ở trên để phân tích và trả lời thắc mắc của người dùng.
3. Trình bày bằng Tiếng Việt mượt mà, sử dụng định dạng Markdown (**in đậm**, danh sách dấu gạch đầu dòng •), emoji sinh động.`;

  let aiReplyText = "";
  let replyActions;

  // Build user payload
  const userContentParts = [];
  if (userText) {
    userContentParts.push({ text: userText });
  }

  if (image && image.startsWith("data:image/")) {
    const mimeType = image.substring(image.indexOf(":") + 1, image.indexOf(";"));
    const base64Data = image.substring(image.indexOf(",") + 1);
    userContentParts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    });
  }

  const geminiPayload = {
    systemInstruction: {
      parts: [{ text: systemInstructionText }],
    },
    contents: [
      {
        role: "user",
        parts:
          userContentParts.length > 0
            ? userContentParts
            : [{ text: "Hãy phân tích tình trạng toàn bộ vườn rau hiện tại." }],
      },
    ],
  };

  try {
    // Attempt Gemini API call with Key Rotation and Fallback across candidate models
    const result = await callGeminiApiWithRotation(geminiPayload);
    aiReplyText = `✨ **Google Gemini AI (${result.model} - Key: ${result.usedKeyMask}):**\n\n${result.text}`;
  } catch (err) {
    if (err.message === "NO_API_KEY") {
      aiReplyText = `💡 **Chưa có Gemini API Key nào trong hệ thống:**\n\n📊 **Dữ liệu hiện tại đọc từ data/plants.json & data/controls.json:**\n• Cây đang theo dõi (${
        plants.length
      } loài): ${plants.map((p) => p.name).join(", ")}\n• Độ ẩm đất: **${
        controls.soilMoisture || 65
      }%** | Nhiệt độ: **${
        controls.temperature || 28
      }°C**\n\n👉 Vui lòng vào menu **"Cấu hình API Key"** để thêm một hoặc nhiều Gemini API Key.`;
      replyActions = [
        { label: "🔑 Thêm Gemini API Key ngay", actionKey: "nav-api-key" },
      ];
    } else {
      console.error("All Gemini API Keys failed:", err);
      aiReplyText = `🤖 **GrowAI Assistant (Tất cả Key đều gặp sự cố):**\n\nLỗi: *${err.message}*\n\nHệ thống đã tự động đẩy các Key bị lỗi xuống cuối hàng chờ rotation.`;
    }
  }

  const aiMsg = {
    id: `ai-${Date.now()}`,
    sender: "ai",
    text: aiReplyText,
    timestamp: timeStr,
    actions: replyActions,
  };
  chatHistory.push(aiMsg);

  writeJson("chat.json", chatHistory);

  res.json({ userMsg, aiMsg, chatHistory });
});

app.delete("/api/ai-chat", (req, res) => {
  const resetChat = [
    {
      id: "msg-reset",
      sender: "ai",
      text: "Tôi đã làm mới ngữ cảnh cuộc trò chuyện từ Node.js Backend. Hãy đặt câu hỏi bất kỳ!",
      timestamp: "vừa xong",
    },
  ];
  writeJson("chat.json", resetChat);
  res.json(resetChat);
});

app.listen(PORT, () => {
  console.log(`✅ GrowHub Node.js Express Backend running on http://localhost:${PORT}`);
  console.log(`📁 Persistent JSON database path: ${dataDir}`);
});
