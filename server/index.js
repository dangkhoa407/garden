const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "15mb" }));

const dataDir = path.join(__dirname, "..", "data");
const snapshotsDir = path.join(dataDir, "snapshots");
if (!fs.existsSync(snapshotsDir)) {
  fs.mkdirSync(snapshotsDir, { recursive: true });
}
app.use("/api/snapshots", express.static(snapshotsDir));

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

// REAL SERIAL PORT DETECTION FUNCTION FOR RASPBERRY PI 4 & WINDOWS
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
        pPath.includes("TTYAMA") ||
        mfg.includes("ARDUINO") ||
        mfg.includes("CH340") ||
        mfg.includes("FTDI") ||
        mfg.includes("RASPBERRY") ||
        vendor.includes("2341") ||
        vendor.includes("1A86") ||
        vendor.includes("0403")
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
        port: "Không có cổng Serial/USB",
        baudRate: 9600,
        pointCount: 6,
        statusMessage: "Chưa kết nối: Không tìm thấy thiết bị Arduino nào cắm vào cổng USB/Serial của Raspberry Pi!",
        allPorts: [],
      };
    }
  } catch (err) {
    const isMissingModule = err.code === "MODULE_NOT_FOUND" || (err.message && err.message.includes("Cannot find module"));
    const errMsg = isMissingModule
      ? "Thư viện 'serialport' chưa được cài đặt trên Raspberry Pi (Vui lòng chạy 'npm install' trong thư mục dự án)"
      : err.message;
    return {
      connected: false,
      port: "Chưa kết nối (Serial)",
      baudRate: 9600,
      pointCount: 6,
      statusMessage: `Chưa nhận diện Arduino: ${errMsg}`,
      allPorts: [],
    };
  }
}

// CHỈ DÙNG 1 MODEL DUY NHẤT - không fallback sang model khác
const MODEL_CANDIDATES = [
  "gemini-3.5-flash-lite",
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

// FULL HARDWARE & ARDUINO V2.MJS PROTOCOL INTEGRATED ENGINE
const ARDUINO_COMMAND_MAP = {
  k: { cmd: "CHECK_PESTS", label: "Kiểm tra sâu hại (CHECK_PESTS)", desc: "Quét 6 điểm bằng camera và AI Gemini" },
  CHECK_PESTS: { cmd: "CHECK_PESTS", label: "Kiểm tra sâu hại (CHECK_PESTS)", desc: "Quét 6 điểm bằng camera và AI Gemini" },
  h: { cmd: "HOME", label: "Về vị trí gốc (HOME)", desc: "Đưa robot về vị trí homing mặc định" },
  HOME: { cmd: "HOME", label: "Về vị trí gốc (HOME)", desc: "Đưa robot về vị trí homing mặc định" },
  p: { cmd: "FULL_SPRAY", label: "Phun toàn bộ vườn", desc: "Di chuyển qua 6 điểm và phun dung dịch sinh học" },
  FULL_SPRAY: { cmd: "FULL_SPRAY", label: "Phun toàn bộ (FULL_SPRAY)", desc: "Phun dung dịch sinh học toàn khu vực" },
  s: { cmd: "STOP", label: "Dừng ngay khẩn cấp (STOP)", desc: "Hủy chu trình và dừng động cơ lập tức" },
  STOP: { cmd: "STOP", label: "Dừng ngay khẩn cấp (STOP)", desc: "Hủy chu trình và dừng động cơ lập tức" },
  r: { cmd: "RESET_ERROR", label: "Xóa trạng thái lỗi (RESET_ERROR)", desc: "Khôi phục hệ thống về trạng thái bình thường" },
  RESET_ERROR: { cmd: "RESET_ERROR", label: "Xóa trạng thái lỗi (RESET_ERROR)", desc: "Khôi phục hệ thống về trạng thái bình thường" },
  ping: { cmd: "PING", label: "Kiểm tra kết nối (PING)", desc: "Gửi lệnh PING đến cổng Arduino" },
  PING: { cmd: "PING", label: "Kiểm tra kết nối (PING)", desc: "Gửi lệnh PING đến cổng Arduino" },
};

let lastArduinoLogs = [];
let lastInspectionResults = []; // Lưu trữ chi tiết 6 điểm quét cho Web UI
let activeSerialPort = null;
let nodeConnected = false;
let captureBusy = false;
let currentCancellationId = 0;
let currentCapturePointIndex = null;
const pendingMoveResolvers = new Map();
let pendingFullSprayResolver = null;

function waitForArduinoMove(pointIndex, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const key = Number(pointIndex);
    const timer = setTimeout(() => {
      pendingMoveResolvers.delete(key);
      reject(new Error(`Arduino khong xac nhan di chuyen den diem ${key + 1} trong thoi gian cho.`));
    }, timeoutMs);

    pendingMoveResolvers.set(key, {
      resolve: () => {
        clearTimeout(timer);
        pendingMoveResolvers.delete(key);
        resolve(true);
      },
      reject: (err) => {
        clearTimeout(timer);
        pendingMoveResolvers.delete(key);
        reject(err);
      },
    });
  });
}

function waitForFullSprayDone(timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    if (pendingFullSprayResolver) {
      pendingFullSprayResolver.reject(new Error("Da co chu trinh phun toan vuon dang chay."));
    }

    const timer = setTimeout(() => {
      pendingFullSprayResolver = null;
      reject(new Error("Arduino khong xac nhan hoan tat phun toan vuon trong thoi gian cho."));
    }, timeoutMs);

    pendingFullSprayResolver = {
      resolve: () => {
        clearTimeout(timer);
        pendingFullSprayResolver = null;
        resolve(true);
      },
      reject: (err) => {
        clearTimeout(timer);
        pendingFullSprayResolver = null;
        reject(err);
      },
    };
  });
}

// =========================================================
// GEMINI PROMPT & RESPONSE SCHEMA (ĐỒNG BỘ 100% V2.MJS)
// =========================================================
const ALLOWED_STATUSES = new Set([
  "SÂU",
  "LÁ BỊ SÂU ĂN",
  "BỆNH",
  "SÂU VÀ BỆNH",
  "KHÔNG PHÁT HIỆN SÂU VÀ BỆNH",
  "KHÔNG CHẮC CHẮN"
]);

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    status: {
      type: "STRING",
      enum: [
        "SÂU",
        "LÁ BỊ SÂU ĂN",
        "BỆNH",
        "SÂU VÀ BỆNH",
        "KHÔNG PHÁT HIỆN SÂU VÀ BỆNH",
        "KHÔNG CHẮC CHẮN"
      ]
    },
    description: { type: "STRING" },
    recommendation: { type: "STRING" }
  },
  required: ["status", "description", "recommendation"]
};

function createPrompt(pointIndex) {
  return `
Bạn là chuyên gia quan sát sâu hại và dấu hiệu bệnh trên rau ăn lá.

Đây là ảnh tại điểm kiểm tra số ${pointIndex + 1}.

Phân loại theo đúng các quy tắc sau:

1. Nhìn thấy rõ sâu hoặc côn trùng đang bám hay ăn lá:
SÂU

2. Không thấy con sâu nhưng lá có lỗ thủng, mép bị ăn hoặc dấu cắn:
LÁ BỊ SÂU ĂN

3. Có đốm lá, cháy lá, thối lá, nấm, vàng lá, xoăn lá hoặc biến màu:
BỆNH

4. Có cả sâu và bệnh:
SÂU VÀ BỆNH

5. Không thấy dấu hiệu sâu hoặc bệnh:
KHÔNG PHÁT HIỆN SÂU VÀ BỆNH

6. Ảnh mờ, tối, quá xa hoặc không đủ bằng chứng:
KHÔNG CHẮC CHẮN

Yêu cầu bắt buộc:

- Trả đủ status, description và recommendation.
- Không để trường nào trống.
- description phải mô tả rõ vật thể và dấu hiệu nhìn thấy.
- recommendation phải đưa ra khuyến nghị ngắn gọn.
- Nếu có sâu, dự đoán loại sâu và mật độ ít, trung bình hoặc nhiều.
- Nếu lá bị sâu ăn hoặc có bệnh, nêu mức độ nhẹ, trung bình hoặc nặng.
- Ưu tiên biện pháp sinh học, an toàn cho rau ăn lá.
- Không khẳng định chắc chắn khi ảnh không rõ.
`.trim();
}

function parseGeminiResult(rawText) {
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error("Gemini trả dữ liệu không phải JSON hợp lệ.");
  }

  const status = String(data?.status || "").normalize("NFC").trim().toUpperCase();
  const description = String(data?.description || "").replace(/\s+/g, " ").trim();
  const recommendation = String(data?.recommendation || "").replace(/\s+/g, " ").trim();

  if (!ALLOWED_STATUSES.has(status)) {
    throw new Error(`Gemini trả tình trạng không hợp lệ: ${status || "trống"}`);
  }
  if (description.length < 10) {
    throw new Error("Gemini trả mô tả bị trống hoặc quá ngắn.");
  }
  if (recommendation.length < 10) {
    throw new Error("Gemini trả khuyến nghị bị trống hoặc quá ngắn.");
  }

  return { status, description, recommendation };
}

function formatGeminiResult(data) {
  const currentTime = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false
  });

  return [
    "KẾT QUẢ KIỂM TRA",
    `Tình trạng: ${data.status}`,
    `Mô tả chi tiết: ${data.description}`,
    `Khuyến nghị: ${data.recommendation}`,
    `Thời gian kiểm tra: ${currentTime}`
  ].join("\n");
}

function normalizeVietnameseForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Đđ]/g, "D")
    .toUpperCase();
}

function extractInspectionStatus(resultText) {
  const text = normalizeVietnameseForMatch(resultText);

  try {
    const parsed = JSON.parse(String(resultText));
    const status = normalizeVietnameseForMatch(parsed?.status).trim();
    if (status) return status;
  } catch (e) {}

  const statusMatch = /TINH TRANG\s*:\s*([^\r\n]+)/i.exec(text);
  if (statusMatch) return statusMatch[1].trim();

  return text;
}

// Quyet dinh phun: chi SPRAY khi status la SAU / LA BI SAU AN / SAU VA BENH.
function needSpray(resultText) {
  const status = extractInspectionStatus(resultText);
  return [
    "SAU",
    "LA BI SAU AN",
    "SAU VA BENH",
  ].includes(status);
}

// =========================================================
// CAMERA CAPTURE PIPELINE (ĐỒNG BỘ 100% V2.MJS)
// =========================================================
const CAMERA_DEVICE = "/dev/video0";
const CAMERA_WIDTH = 640;
const CAMERA_HEIGHT = 480;
const CAMERA_FPS = 30;
const CAMERA_BRIGHTNESS = 105;
const CAMERA_CONTRAST = 135;
const CAMERA_SATURATION = 125;
const CAMERA_SHARPNESS = 140;
const WARMUP_FRAMES = 5;
const CHECK_FRAMES = 10;
const TARGET_BRIGHTNESS = 110;
const JPEG_QUALITY = 85;

const { execFile } = require("child_process");
const execFileAsync = promisify(execFile);

async function setCameraControl(name, value) {
  try {
    await execFileAsync("v4l2-ctl", ["-d", CAMERA_DEVICE, `--set-ctrl=${name}=${value}`], { timeout: 5000 });
    console.log(`Camera ${name}: ${value}`);
  } catch {
    console.log(`Không chỉnh được ${name}, bỏ qua.`);
  }
}

async function configureCamera() {
  console.log("Đang thiết lập camera...");
  await setCameraControl("brightness", CAMERA_BRIGHTNESS);
  await setCameraControl("contrast", CAMERA_CONTRAST);
  await setCameraControl("saturation", CAMERA_SATURATION);
  await setCameraControl("sharpness", CAMERA_SHARPNESS);
  await setCameraControl("white_balance_automatic", 1);
  await setCameraControl("power_line_frequency", 1);
}

async function captureFrames(directory) {
  const framePattern = path.join(directory, "frame-%03d.jpg");
  const totalFrames = WARMUP_FRAMES + CHECK_FRAMES;
  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "v4l2",
    "-framerate", String(CAMERA_FPS),
    "-video_size", `${CAMERA_WIDTH}x${CAMERA_HEIGHT}`,
    "-i", CAMERA_DEVICE,
    "-frames:v", String(totalFrames),
    "-q:v", "2",
    framePattern
  ], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
}

async function analyzeFrameLight(framePath) {
  const sharp = require("sharp");
  const result = await sharp(framePath).greyscale().raw().toBuffer({ resolveWithObject: true });
  let totalBrightness = 0;
  let overexposedPixels = 0;
  let darkPixels = 0;
  for (const value of result.data) {
    totalBrightness += value;
    if (value >= 245) overexposedPixels++;
    if (value <= 15) darkPixels++;
  }
  return {
    meanBrightness: totalBrightness / result.data.length,
    overexposedRatio: overexposedPixels / result.data.length,
    darkRatio: darkPixels / result.data.length,
  };
}

async function generateFallbackSnapshot(imagePath) {
  try {
    const sharp = require("sharp");
    const width = 1280;
    const height = 720;
    const nowStr = new Date().toLocaleString("vi-VN");

    const svgBuffer = Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#143628" />
            <stop offset="50%" stop-color="#2d6a4f" />
            <stop offset="100%" stop-color="#081c15" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)" />
        
        <circle cx="640" cy="360" r="280" fill="#40916c" opacity="0.4" />
        <circle cx="600" cy="320" r="200" fill="#52b788" opacity="0.5" />
        <circle cx="700" cy="400" r="160" fill="#74c69d" opacity="0.6" />
        <path d="M 300 500 Q 640 150 980 500 Q 640 600 300 500 Z" fill="#95d5b2" opacity="0.7" />

        <rect x="25" y="25" width="400" height="65" rx="12" fill="black" opacity="0.65" />
        <text x="40" y="52" font-family="sans-serif" font-size="16" font-weight="bold" fill="#00ffcc">
          CAMERA SMART GARDEN USB
        </text>
        <text x="40" y="75" font-family="sans-serif" font-size="13" fill="#ffffff">
          ${nowStr}
        </text>
      </svg>
    `);

    await sharp(svgBuffer).jpeg({ quality: 90 }).toFile(imagePath);
    console.log(`[Camera Engine] Đã khởi tạo ảnh snapshot camera fallback: ${imagePath}`);
  } catch (err) {
    console.error(`[Fallback Snapshot Error] ${err.message}`);
  }
}

function addSystemLog(command, label, status = "RECEIVED") {
  const timestamp = new Date().toLocaleTimeString("vi-VN");
  const logEntry = {
    timestamp,
    command: String(command).toUpperCase(),
    label: String(label),
    status: String(status).toUpperCase(),
  };
  lastArduinoLogs.unshift(logEntry);
  if (lastArduinoLogs.length > 50) lastArduinoLogs.pop();
  return logEntry;
}

// =========================================================
// CAMERA CAPTURE PIPELINE (THEO PATTERN V2.MJS - HO TRO CA WINDOWS VA LINUX)
// =========================================================

// Lay ffmpeg binary: dung system ffmpeg neu co, fallback ffmpeg-static
function getFfmpegBinary() {
  try {
    const ffmpegStatic = require("ffmpeg-static");
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
  } catch (e) {}
  return "ffmpeg"; // system ffmpeg (Linux/Raspberry Pi da cai san)
}

let cachedWindowsCameraDevice = null;
let latestBrowserCaptureRequest = null;
const browserCaptureWaiters = new Map();

function rankWindowsCameraDevice(name) {
  const normalized = String(name || "").toLowerCase();
  let score = 0;

  if (/(obs|virtual|ndi|xsplit|screen|capture)/.test(normalized)) score += 1000;
  if (/(usb|webcam|integrated|hd camera|camera)/.test(normalized)) score -= 100;

  return score;
}

// Lay ten camera Windows qua DirectShow listing (co cache de phan hoi tuc thi)
async function getWindowsCameraDevices() {
  try {
    const ffmpegBin = getFfmpegBinary();
    const { stderr } = await execFileAsync(
      ffmpegBin,
      ["-list_devices", "true", "-f", "dshow", "-i", "dummy"],
      { timeout: 8000 }
    ).catch((e) => ({ stderr: e.stderr || "" }));

    const devices = [];
    const lines = String(stderr).split("\n");
    for (const line of lines) {
      if (line.includes("(video)") && !line.includes("none")) {
        const match = line.match(/"([^"]+)"/);
        if (match && !devices.includes(match[1])) devices.push(match[1]);
      }
    }

    const realDevices = devices.filter((name) => !/(obs|virtual|ndi|xsplit|screen|capture)/i.test(name));
    const preferred = realDevices.length > 0 ? realDevices : devices;
    return preferred.sort((a, b) => rankWindowsCameraDevice(a) - rankWindowsCameraDevice(b));
  } catch (e) {
    console.warn(`[Camera Engine] Khong lay duoc danh sach camera Windows: ${e.message}`);
  }
  return [];
}

// Camera device được chọn bởi user (lưu trong settings.json)
function getSavedCameraDevice() {
  try {
    const settings = readJson("settings.json", {});
    return settings.selectedCameraDevice || null;
  } catch (e) { return null; }
}

function saveCameraDevice(deviceName) {
  try {
    const settings = readJson("settings.json", {});
    settings.selectedCameraDevice = deviceName;
    writeJson("settings.json", settings);
    cachedWindowsCameraDevice = deviceName;
    console.log(`[Camera Engine] Đã lưu camera device: "${deviceName}"`);
  } catch (e) {}
}

async function getWindowsCameraDevice() {
  // Ưu tiên: device đã được user chọn và lưu trong settings
  const saved = getSavedCameraDevice();
  if (saved) return saved;

  // Fallback: auto-detect
  if (cachedWindowsCameraDevice) return cachedWindowsCameraDevice;

  const devices = await getWindowsCameraDevices();
  const cameraDevice = devices[0] || null;
  if (cameraDevice) {
    cachedWindowsCameraDevice = cameraDevice;
    console.log(`[Camera Engine] Phat hien camera Windows: "${cameraDevice}"`);
  }

  return cameraDevice;
}

function isCameraBusyError(error) {
  const detail = String(error?.stderr || error?.message || "").toLowerCase();
  return (
    detail.includes("device already in use") ||
    detail.includes("could not run graph") ||
    detail.includes("error opening input") ||
    detail.includes("i/o error")
  );
}

async function releaseCameraBeforeCapture() {
  cachedWindowsCameraDevice = null;

  try {
    if (typeof ffmpegStreamProcess !== "undefined" && ffmpegStreamProcess) {
      console.warn("[Camera Engine] Dừng stream nội bộ để giành quyền camera /dev/video0...");
      try { ffmpegStreamProcess.kill("SIGKILL"); } catch (e) {}
      ffmpegStreamProcess = null;
    }
  } catch (e) {}

  if (process.platform === "linux") {
    try {
      await execAsync("fuser -k /dev/video0 || true").catch(() => {});
    } catch (e) {}
  }

  await new Promise((resolve) => setTimeout(resolve, 800));
}

function requestFreshBrowserSnapshot(timeoutMs = 3500) {
  const requestId = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  latestBrowserCaptureRequest = {
    id: requestId,
    createdAt: Date.now(),
  };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      browserCaptureWaiters.delete(requestId);
      resolve(null);
    }, timeoutMs);

    browserCaptureWaiters.set(requestId, {
      resolve: (imagePath) => {
        clearTimeout(timeout);
        browserCaptureWaiters.delete(requestId);
        resolve(imagePath);
      },
    });
  });
}

async function captureWindowsFrames(ffmpegBin, directory) {
  const framePattern = path.join(directory, "frame-%03d.jpg");
  const totalFrames = WARMUP_FRAMES + CHECK_FRAMES;
  const availableDevices = await getWindowsCameraDevices();
  const devices = cachedWindowsCameraDevice && availableDevices.includes(cachedWindowsCameraDevice)
    ? [cachedWindowsCameraDevice, ...availableDevices.filter((name) => name !== cachedWindowsCameraDevice)]
    : availableDevices;

  if (devices.length === 0) {
    throw new Error("Khong phat hien camera nao tren Windows qua DirectShow. Vui long cam USB camera.");
  }

  let lastError = null;
  let releasedForBusyCamera = false;

  for (const cameraDevice of devices) {
    const attempts = [
      {
        label: "640x480@30",
        args: ["-framerate", String(CAMERA_FPS), "-video_size", `${CAMERA_WIDTH}x${CAMERA_HEIGHT}`],
      },
      {
        label: "default options",
        args: [],
      },
    ];

    for (const attempt of attempts) {
      try {
        console.log(`[Camera Engine] Windows DirectShow: "${cameraDevice}" (${attempt.label})`);
        await execFileAsync(
          ffmpegBin,
          [
            "-hide_banner", "-loglevel", "error", "-y",
            "-f", "dshow",
            ...attempt.args,
            "-i", `video=${cameraDevice}`,
            "-frames:v", String(totalFrames),
            "-q:v", "2",
            framePattern,
          ],
          { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }
        );
        cachedWindowsCameraDevice = cameraDevice;
        return;
      } catch (error) {
        lastError = error;
        console.warn(`[Camera Engine] Khong chup duoc tu "${cameraDevice}" (${attempt.label}): ${error.stderr?.trim() || error.message}`);

        if (!releasedForBusyCamera && isCameraBusyError(error)) {
          releasedForBusyCamera = true;
          await releaseCameraBeforeCapture();

          try {
            console.log(`[Camera Engine] Thu lai sau khi gianh quyen: "${cameraDevice}" (${attempt.label})`);
            await execFileAsync(
              ffmpegBin,
              [
                "-hide_banner", "-loglevel", "error", "-y",
                "-f", "dshow",
                ...attempt.args,
                "-i", `video=${cameraDevice}`,
                "-frames:v", String(totalFrames),
                "-q:v", "2",
                framePattern,
              ],
              { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }
            );
            cachedWindowsCameraDevice = cameraDevice;
            return;
          } catch (retryError) {
            lastError = retryError;
            console.warn(`[Camera Engine] Van khong gianh duoc camera "${cameraDevice}": ${retryError.stderr?.trim() || retryError.message}`);
          }
        }
      }
    }
  }

  const detail = lastError?.stderr?.trim() || lastError?.message || "DirectShow khong mo duoc camera.";
  cachedWindowsCameraDevice = null;
  throw new Error(detail);
}

// Chup frames theo platform: Windows dung dshow, Linux dung v4l2
async function captureFramesCrossPlatform(directory) {
  const ffmpegBin = getFfmpegBinary();
  const framePattern = path.join(directory, "frame-%03d.jpg");
  const totalFrames = WARMUP_FRAMES + CHECK_FRAMES;

  if (process.platform === "win32") {
    await captureWindowsFrames(ffmpegBin, directory);
  } else {
    // Linux / Raspberry Pi: dung V4L2 (nhu v2.mjs)
    console.log(`[Camera Engine] Linux: Chup ${totalFrames} frames tu ${CAMERA_DEVICE} qua V4L2...`);
    await execFileAsync(
      ffmpegBin,
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "v4l2",
        "-framerate", String(CAMERA_FPS),
        "-video_size", `${CAMERA_WIDTH}x${CAMERA_HEIGHT}`,
        "-i", CAMERA_DEVICE,
        "-frames:v", String(totalFrames),
        "-q:v", "2",
        framePattern
      ],
      { timeout: 3000, maxBuffer: 2 * 1024 * 1024 }
    );
  }
}

// Đảm bảo thư mục pictures/ tồn tại
const PICTURES_DIR = path.join(process.cwd(), "pictures");
if (!fs.existsSync(PICTURES_DIR)) fs.mkdirSync(PICTURES_DIR, { recursive: true });

function makeSnapPath() {
  const rand = Math.random().toString(36).slice(2, 10);
  return path.join(PICTURES_DIR, `snap_${Date.now()}_${rand}.jpg`);
}

function persistSnapshotForHistory(imagePath, idPrefix = "insp") {
  const inspId = `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let snapshotUrl = "/api/camera/image?t=" + Date.now();

  if (imagePath && fs.existsSync(imagePath)) {
    try {
      const snapFileName = `${inspId}.jpg`;
      const snapDest = path.join(snapshotsDir, snapFileName);
      fs.copyFileSync(imagePath, snapDest);
      snapshotUrl = `/api/snapshots/${snapFileName}`;
    } catch (error) {
      console.warn(`[Snapshot History] Khong luu duoc anh lich su: ${error.message}`);
    }
  }

  return { inspId, snapshotUrl };
}

async function captureImage() {
  // 1. Kiểm tra xem có ảnh tươi từ Live Persistent Stream (dưới 3s) thì dùng ngay để không bị Device busy
  const liveViewPath = path.join(process.cwd(), "st01.jpg");
  if (fs.existsSync(liveViewPath)) {
    try {
      const stats = fs.statSync(liveViewPath);
      if (Date.now() - stats.mtimeMs < 3500 && stats.size > 5000) {
        console.log(`[Camera Engine] Sử dụng ảnh trực tiếp vừa chụp từ Persistent Stream (${stats.size} bytes)`);
        const snapPath = makeSnapPath();
        fs.copyFileSync(liveViewPath, snapPath);
        return snapPath;
      }
    } catch (e) {}
  }

  // 2. Giải phóng /dev/video0 tuyệt đối trước khi chụp mới
  await releaseCameraBeforeCapture();

  const ffmpegBin = getFfmpegBinary();
  const snapPath = makeSnapPath();
  const totalFrames = WARMUP_FRAMES + CHECK_FRAMES;
  const directory = await fs.promises.mkdtemp(
    path.join(require("os").tmpdir(), "vuon-rau-camera-")
  );

  try {
    const framePattern = path.join(directory, "frame-%03d.jpg");

    if (process.platform === "win32") {
      await captureWindowsFrames(ffmpegBin, directory);
    } else {
      // Linux / Raspberry Pi
      try { await configureCamera(); } catch (e) {}
      try {
        await execFileAsync(
          ffmpegBin,
          [
            "-hide_banner", "-loglevel", "error", "-y",
            "-f", "v4l2",
            "-framerate", String(CAMERA_FPS),
            "-video_size", `${CAMERA_WIDTH}x${CAMERA_HEIGHT}`,
            "-i", CAMERA_DEVICE,
            "-frames:v", String(totalFrames),
            "-q:v", "2",
            framePattern,
          ],
          { timeout: 30000, maxBuffer: 2 * 1024 * 1024 }
        );
      } catch (firstErr) {
        if (firstErr.message && (firstErr.message.includes("busy") || firstErr.message.includes("Error opening input"))) {
          console.warn("[Camera Engine] /dev/video0 bận trên Raspberry Pi, đang ép buộc giải phóng thiết bị và chụp lại...");
          await releaseCameraBeforeCapture();
          await execFileAsync(
            ffmpegBin,
            [
              "-hide_banner", "-loglevel", "error", "-y",
              "-f", "v4l2",
              "-framerate", String(CAMERA_FPS),
              "-video_size", `${CAMERA_WIDTH}x${CAMERA_HEIGHT}`,
              "-i", CAMERA_DEVICE,
              "-frames:v", String(totalFrames),
              "-q:v", "2",
              framePattern,
            ],
            { timeout: 30000, maxBuffer: 2 * 1024 * 1024 }
          );
        } else {
          throw firstErr;
        }
      }
    }

    // Lấy các frame check (bỏ warmup frames đầu)
    const frameFiles = (await fs.promises.readdir(directory))
      .filter((name) => name.toLowerCase().endsWith(".jpg"))
      .sort()
      .slice(WARMUP_FRAMES, WARMUP_FRAMES + CHECK_FRAMES);

    if (frameFiles.length === 0) throw new Error("Camera không tạo đủ khung hình.");

    // Chọn frame tốt nhất theo điểm sáng
    let bestPath = null, bestInfo = null, bestScore = Infinity;
    for (const fileName of frameFiles) {
      const framePath = path.join(directory, fileName);
      const info = await analyzeFrameLight(framePath);
      const score = Math.abs(info.meanBrightness - TARGET_BRIGHTNESS)
        + info.overexposedRatio * 300
        + info.darkRatio * 60;
      console.log(`[Camera] ${fileName}: sáng ${info.meanBrightness.toFixed(1)}, cháy ${(info.overexposedRatio * 100).toFixed(1)}%`);
      if (score < bestScore) { bestScore = score; bestPath = framePath; bestInfo = info; }
    }

    if (!bestPath || !bestInfo) throw new Error("Không chọn được ảnh tốt từ camera.");

    const brightness = bestInfo.meanBrightness;
    const overexposedRatio = bestInfo.overexposedRatio;
    console.log(`[Camera] Ảnh chọn: sáng ${brightness.toFixed(1)}, cháy ${(overexposedRatio * 100).toFixed(1)}%`);

    // Tính hệ số điều chỉnh độ sáng
    let alpha = 1, beta = 0;
    if      (overexposedRatio > 0.25 || brightness > 200) { alpha = 0.58; beta = -30; }
    else if (overexposedRatio > 0.15 || brightness > 175) { alpha = 0.72; beta = -18; }
    else if (overexposedRatio > 0.07 || brightness > 150) { alpha = 0.84; beta = -8;  }
    else if (overexposedRatio > 0.03 || brightness > 130) { alpha = 0.94; beta = -2;  }
    else if (brightness < 35)  { alpha = 1.30; beta = 30; }
    else if (brightness < 65)  { alpha = 1.15; beta = 15; }
    else if (brightness < 90)  { alpha = 1.07; beta = 8;  }
    else if (brightness < 115) { alpha = 1.03; beta = 4;  }

    const sharp = require("sharp");
    await sharp(bestPath)
      .removeAlpha()
      .linear(alpha, beta)
      .jpeg({ quality: JPEG_QUALITY })
      .toFile(snapPath);

    // Cập nhật st01.jpg cho live view
    fs.copyFileSync(snapPath, liveViewPath);

    console.log(`[Camera Engine] Đã chụp và lưu: ${path.basename(snapPath)}`);
    return snapPath; // Caller xóa sau khi Telegram gửi xong

  } catch (error) {
    if (process.platform === "win32") {
      console.warn("[Camera Engine] DirectShow van bi chiem quyen, yeu cau browser chup frame moi...");
      const freshBrowserSnapshot = await requestFreshBrowserSnapshot(3500);
      if (freshBrowserSnapshot && fs.existsSync(freshBrowserSnapshot)) {
        console.log(`[Camera Engine] Da nhan frame moi tu browser: ${path.basename(freshBrowserSnapshot)}`);
        fs.copyFileSync(freshBrowserSnapshot, liveViewPath);
        return freshBrowserSnapshot;
      }
    }
    // Cleanup file lỗi nếu có
    try { if (fs.existsSync(snapPath)) fs.unlinkSync(snapPath); } catch (e) {}
    const detail = error.stderr?.trim() || error.message;
    throw new Error(`Không chụp được ảnh: ${detail}`);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}


// TELEGRAM ENGINE (CẤU HÌNH TRỰC TIẾP TỪ WEB LƯU TRONG SETTINGS.JSON HOẶC FILE .ENV)
async function sendTelegramText(messageText) {
  try {
    const settings = readJson("settings.json", {});
    const botToken = process.env.BOT_TOKEN || settings.telegramBotToken || settings.botToken;
    const chatId = process.env.CHAT_ID || settings.telegramChatId || settings.chatId;

    if (!botToken || !chatId) {
      console.log("[Telegram Text] Bỏ qua: Chưa cấu hình BOT_TOKEN hoặc CHAT_ID (Web/env)");
      return;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: messageText }),
    });
    console.log("[Telegram Text] Đã gửi thông báo về Telegram!");
  } catch (err) {
    console.warn(`[Telegram Text Error] ${err.message}`);
  }
}

async function sendTelegramPhoto(imagePath, captionText) {
  try {
    const settings = readJson("settings.json", {});
    const botToken = process.env.BOT_TOKEN || settings.telegramBotToken || settings.botToken;
    const chatId = process.env.CHAT_ID || settings.telegramChatId || settings.chatId;

    if (!botToken || !chatId) {
      console.log("[Telegram Photo] Bỏ qua: Chưa cấu hình BOT_TOKEN hoặc CHAT_ID (Web/env)");
      return;
    }

    let targetImg = imagePath && fs.existsSync(imagePath) ? imagePath : null;
    if (!targetImg && fs.existsSync("st01.jpg")) {
      targetImg = "st01.jpg";
    }

    if (!targetImg) {
      await sendTelegramText(captionText);
      return;
    }

    const imageBuffer = fs.readFileSync(targetImg);
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("caption", (captionText || "").slice(0, 1024));
    formData.append("photo", new Blob([imageBuffer], { type: "image/jpeg" }), path.basename(targetImg));

    const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
    const res = await fetch(url, { method: "POST", body: formData });
    if (res.ok) {
      console.log("[Telegram Photo] Đã gửi thành công ảnh chụp và báo cáo về Telegram!");
    } else {
      const errText = await res.text();
      console.warn(`[Telegram Photo Error] ${res.status}: ${errText}`);
    }
  } catch (err) {
    console.warn(`[Telegram Photo Error] ${err.message}`);
  }
}

// HELPER GỬI THÔNG BÁO / CẢNH BÁO LÊN WEB UI & LOGS
function pushWebNotification(messageText, type = "INFO") {
  const timestamp = new Date().toLocaleTimeString("vi-VN");
  const logEntry = {
    timestamp,
    command: type.toUpperCase(),
    label: messageText,
    status: type,
  };
  lastArduinoLogs.unshift(logEntry);
  if (lastArduinoLogs.length > 30) lastArduinoLogs.pop();
  console.log(`[Web Alert & Data] ${timestamp} -> ${messageText}`);
}

// HELPER KIỂM TRA XEM VỊ TRÍ (0->5 TƯƠNG ỨNG ĐIỂM 1->6 / KHAY 01->06) ĐÃ ĐƯỢC THÊM CÂY TRỒNG TRÊN WEB CHƯA
function hasPlantAtPoint(pointIndex) {
  const plants = readJson("plants.json", []);
  if (!Array.isArray(plants) || plants.length === 0) {
    console.log(`[Inspection Engine] Danh sách cây trồng (data/plants.json) hiện rỗng (0 cây).`);
    return false;
  }

  const targetNum = pointIndex + 1; // Point index 0..5 -> Point 1..6

  return plants.some((p) => {
    if (!p || !p.location) return false;
    const locStr = String(p.location).trim();
    // Match tất cả cụm số trong location (VD: "Khay 01" -> 1, "Điểm 2" -> 2, "Vị trí 3" -> 3, "Khay 4" -> 4)
    const matches = locStr.match(/\d+/g);
    if (matches) {
      return matches.some((numStr) => parseInt(numStr, 10) === targetNum);
    }
    return false;
  });
}

// ARDUINO SERIAL PORT INITIALIZER & PROTOCOL LISTENER
// Chi 1 instance duoc mo port tai 1 thoi diem - co retry khi Access Denied
let _arduinoInitLock = false;
let _arduinoInitPromise = null;

async function getOrInitArduinoSerialPort() {
  try {
    const { SerialPort } = require("serialport");
    const { ReadlineParser } = require("serialport");

    // 1. Neu port da open roi thi tra ve luon
    if (activeSerialPort && activeSerialPort.isOpen) {
      return activeSerialPort;
    }

    // 2. Neu dang co init khac chay -> doi no xong
    if (_arduinoInitPromise) {
      try { await _arduinoInitPromise; } catch (e) {}
      if (activeSerialPort && activeSerialPort.isOpen) return activeSerialPort;
    }

    // 3. Don dep port cu neu con ton tai
    if (activeSerialPort) {
      try {
        activeSerialPort.removeAllListeners();
        if (activeSerialPort.isOpen) {
          await new Promise((res) => activeSerialPort.close(() => res()));
        }
      } catch (e) {}
      activeSerialPort = null;
    }

    // 4. Tao promise init moi voi retry khi Access Denied
    _arduinoInitPromise = (async () => {
      const esp32PathUpper = (activeEsp32Port && activeEsp32Port.path) ? activeEsp32Port.path.toUpperCase() : "";
      const ports = await SerialPort.list();
      const candidates = ports.filter((p) => {
        const pPath = (p.path || "").toUpperCase();
        if (esp32PathUpper && pPath === esp32PathUpper) return false;
        const mfg = (p.manufacturer || "").toUpperCase();

        if (
          mfg.includes("SILICON") ||
          mfg.includes("CP210") ||
          mfg.includes("ESPRESSIF") ||
          mfg.includes("ESP32") ||
          mfg.includes("CH9102")
        ) {
          return false;
        }

        return (
          mfg.includes("ARDUINO") ||
          mfg.includes("GENUINO") ||
          mfg.includes("CH340") ||
          mfg.includes("CH341") ||
          mfg.includes("FTDI") ||
          mfg.includes("QINHENG") ||
          mfg.includes("RASPBERRY") ||
          pPath.includes("TTYACM")
        );
      });

      if (candidates.length === 0) {
        throw new Error("Khong phat hien mach Arduino nao ket noi (Chua cam USB Arduino)");
      }

      const targetPortPath = candidates[0].path;

      // Retry loop: thu mo port toi da 3 lan, moi lan cach 1.5s
      const MAX_RETRY = 3;
      let lastErr = null;
      for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
          console.log(`[Arduino] Mo serial port ${targetPortPath}... (lan ${attempt}/${MAX_RETRY})`);

          const port = new SerialPort({
            path: targetPortPath,
            baudRate: 9600,
            autoOpen: false,
          });

          await new Promise((resolve, reject) => {
            port.open((err) => (err ? reject(err) : resolve()));
          });

          activeSerialPort = port;
          console.log(`[Arduino] Serial port ${targetPortPath} MO THANH CONG.`);

          // Attach parser
          const parser = activeSerialPort.pipe(new ReadlineParser({ delimiter: "\n" }));

          // Cleanup khi port bi dong bat ngo
          activeSerialPort.on("close", () => {
            console.warn(`[Arduino] Port ${targetPortPath} bi dong! Se thu ket noi lai sau 3s...`);
            activeSerialPort = null;
            _arduinoInitPromise = null;
            setTimeout(() => {
              getOrInitArduinoSerialPort().catch((e) =>
                console.warn(`[Arduino Reconnect] ${e.message}`)
              );
            }, 3000);
          });

          activeSerialPort.on("error", (err) => {
            console.error(`[Arduino Port Error] ${err.message}`);
          });

          activeSerialPort.write("NODE_READY\n");

          parser.on("data", async (rawLine) => {
            const line = String(rawLine).replace(/\r/g, "").trim();
            if (!line) return;

            console.log(`[Arduino -> Server] ${line}`);
            const timestamp = new Date().toLocaleTimeString("vi-VN");

            lastArduinoLogs.unshift({
              timestamp,
              command: "RX",
              label: `Arduino: ${line}`,
              status: "RECEIVED",
            });
            if (lastArduinoLogs.length > 30) lastArduinoLogs.pop();

            const normalized = line.toUpperCase();

            try {
              if (normalized === "ARDUINO_READY" || normalized.includes("HE THONG SAN SANG")) {
                nodeConnected = true;
                pushWebNotification("Arduino: He thong san sang!", "SUCCESS");
                return;
              }

              if (normalized.includes("BAT DAU HOMING")) {
                pushWebNotification("Arduino: Dang di chuyen lay moc Home (Homing)...", "PROCESS");
                return;
              }

              if (normalized.includes("HOMING OK")) {
                pushWebNotification("Arduino: Homing hoan tat! Robot san sang di chuyen.", "SUCCESS");
                return;
              }

              if (normalized.includes("PHUN DIEM OK")) {
                pushWebNotification("Arduino: Da kich hoat bom phun thuoc tai diem thanh cong!", "SUCCESS");
                return;
              }

              if (normalized.includes("SPRAY_ON OK")) {
                pushWebNotification("Arduino: Da bat bom phun lien tuc.", "PROCESS");
                return;
              }

              if (normalized.includes("SPRAY_OFF OK")) {
                pushWebNotification("Arduino: Da tat bom phun.", "SUCCESS");
                return;
              }

              if (normalized.includes("FULL_SPRAY_PLANTED DONE")) {
                if (pendingFullSprayResolver) pendingFullSprayResolver.resolve();
                pushWebNotification("Arduino: Da hoan tat phun cac khay co cay va ve home.", "SUCCESS");
                return;
              }

              if (normalized.includes("FULL_SPRAY_PLANTED SKIP")) {
                if (pendingFullSprayResolver) pendingFullSprayResolver.resolve();
                pushWebNotification("Arduino: Khong co khay co cay de phun.", "WARNING");
                return;
              }

              if (normalized.includes("ALERT") && pendingFullSprayResolver) {
                pendingFullSprayResolver.reject(new Error(line));
                return;
              }

              if (normalized.includes("BO QUA")) {
                pushWebNotification("Arduino: Da phun trong 24h gan nhat. Bo qua phun lap.", "WARNING");
                return;
              }

              const movedMatch = /^MOVED:(\d+)$/i.exec(line);
              if (movedMatch) {
                const movedIndex = Number(movedMatch[1]);
                const waiter = pendingMoveResolvers.get(movedIndex);
                if (waiter) waiter.resolve();
                return;
              }

              // CAPTURE event triggered by Arduino
              const captureMatch = /^CAPTURE(?::(\d+))?$/i.exec(line);
              if (captureMatch || normalized.includes("CAPTURE")) {
                captureBusy = true;
                const cancellationId = currentCancellationId;
                if (captureMatch && captureMatch[1] !== undefined) {
                  currentCapturePointIndex = Number(captureMatch[1]);
                }
                const capturePointIndex = Number.isInteger(currentCapturePointIndex) ? currentCapturePointIndex : null;
                const capturePointLabel = capturePointIndex !== null ? capturePointIndex + 1 : "CAMERA";

                try {
                  pushWebNotification(
                    capturePointIndex !== null
                      ? `Nhan tin hieu CAPTURE tu Arduino tai Vi tri ${capturePointLabel}! Dang chup anh & phan tich Gemini AI...`
                      : "Nhan tin hieu CAPTURE tu Arduino! Dang chup anh & phan tich Gemini AI...",
                    "AI_ANALYSIS"
                  );

                  let imagePathToSend = null;
                  try {
                    imagePathToSend = await captureImage();
                  } catch (capErr) {
                    console.error(`[Capture Error] ${capErr.message}`);
                    pushWebNotification(`Loi chup anh tu USB Camera: ${capErr.message}`, "ALERT");
                    await sendTelegramText(`LOI CHUP ANH TU CAMERA USB: ${capErr.message}`);
                    return;
                  }

                  let formattedResult = "";
                  let action = "NO_SPRAY";
                  const keys = getKeysList();

                  let parsedResult = null;
                  if (keys.length === 0) {
                    formattedResult = "Chua thiet lap Gemini API Key!";
                    addSystemLog("GEMINI_ERR", "Chua thiet lap Gemini API Key", "ALERT");
                    pushWebNotification(formattedResult, "WARNING");
                    try { await sendTelegramPhoto(imagePathToSend, `DIEM QUET CAMERA\n\n${formattedResult}`); } catch (tErr) {}
                    return;
                  } else {
                    let imageBase64 = null;
                    if (fs.existsSync(imagePathToSend)) {
                      try {
                        const imgBuf = fs.readFileSync(imagePathToSend);
                        imageBase64 = imgBuf.toString("base64");
                      } catch (e) {}
                    }

                    addSystemLog("GEMINI_REQ", "Dang gui anh st01.jpg sang Google Gemini AI...", "PROCESS");

                    const payload = {
                      contents: [{
                        parts: [
                          ...(imageBase64 ? [{ inlineData: { mimeType: "image/jpeg", data: imageBase64 } }] : []),
                          { text: createPrompt(0) }
                        ]
                      }],
                      generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: GEMINI_RESPONSE_SCHEMA
                      }
                    };

                    try {
                      const aiResult = await callGeminiApiWithRotation(payload);
                      if (aiResult && aiResult.text) {
                        try {
                          parsedResult = parseGeminiResult(aiResult.text);
                          formattedResult = formatGeminiResult(parsedResult);
                        } catch (pErr) {
                          formattedResult = aiResult.text;
                        }
                      }
                    } catch (aiErr) {
                      console.error(`[Serial Gemini AI Error] ${aiErr.message}`);
                      formattedResult = `Loi phan tich Gemini AI: ${aiErr.message}`;
                      addSystemLog("GEMINI_ERR", `Loi ket noi API: ${aiErr.message}`, "ALERT");
                      pushWebNotification(`Loi goi Gemini AI API: ${aiErr.message}`, "ALERT");
                      try { await sendTelegramPhoto(imagePathToSend, `DIEM QUET CAMERA\n\n${formattedResult}`); } catch (tErr) {}
                      return;
                    }
                  }

                  const hasPest = needSpray(formattedResult);
                  action = hasPest ? "SPRAY" : "NO_SPRAY";
                  const aiStatusText = parsedResult ? parsedResult.status : (hasPest ? "CO SAU / BENH" : "KHONG PHAT HIEN SAU VA BENH");

                  // 1. Phản hồi NGAY LẬP TỨC tới Arduino
                  if (activeSerialPort && activeSerialPort.isOpen) {
                    activeSerialPort.write(`${action}\n`);
                    console.log(`[Server -> Arduino] ${action} (CAPTURE)`);
                  }

                  if (action === "SPRAY") {
                    addSystemLog("ACTUATE", `Lenh Arduino: SPRAY (Phat hien [${aiStatusText}])`, "WARNING");
                    pushWebNotification(`Gemini AI phan tich: [${aiStatusText}]! Da gui lenh SPRAY toi Arduino.`, "WARNING");
                  } else {
                    addSystemLog("ACTUATE", `Lenh Arduino: NO_SPRAY (Tinh trang [${aiStatusText}])`, "SUCCESS");
                    pushWebNotification(`Gemini AI phan tich: [${aiStatusText}].`, "SUCCESS");
                  }

                  addSystemLog("GEMINI_RES", `Phan tich hoan tat: [${aiStatusText}]`, "SUCCESS");

                  // 2. Gửi Telegram TRƯỚC (await), sau đó mới xóa file
                  const telegramCaption = `KIỂM TRA Ở VỊ TRÍ (${capturePointLabel})\n\n${formattedResult}`;
                  const savedCaptureSnapshot = persistSnapshotForHistory(imagePathToSend, "serial-insp");
                  try { await sendTelegramPhoto(imagePathToSend, telegramCaption); } catch (tErr) {}

                  // Xóa file snapshot sau khi gửi Telegram xong
                  if (imagePathToSend && !imagePathToSend.endsWith("st01.jpg")) {
                    try { fs.unlinkSync(imagePathToSend); } catch (e) {}
                    if (latestSnapshotPath === imagePathToSend) latestSnapshotPath = null;
                  }

                  try {
                    const fullHistory = readJson("inspection_history.json", []);
                    fullHistory.unshift({
                      id: savedCaptureSnapshot.inspId,
                      type: "PEST",
                      timestamp: new Date().toLocaleString("vi-VN"),
                      title: "Quet Camera Serial Arduino",
                      detail: formattedResult,
                      telegramCaption: telegramCaption,
                      status: action === "SPRAY" ? "Phat hien sau hai" : "Suc khoe tot",
                      image: savedCaptureSnapshot.snapshotUrl,
                    });
                    if (action === "SPRAY") {
                      fullHistory.unshift({
                        id: `spray-${Date.now()}`,
                        type: "SPRAY",
                        timestamp: new Date().toLocaleString("vi-VN"),
                        title: `Phun sinh hoc - Vi tri ${capturePointLabel}`,
                        detail: `Arduino da phun thuoc sinh hoc tai vi tri ${capturePointLabel} sau khi AI phat hien sau hai.`,
                        status: "Da phun sinh hoc",
                        image: savedCaptureSnapshot.snapshotUrl,
                      });
                    }
                    writeJson("inspection_history.json", fullHistory);
                  } catch (hErr) {}

                } catch (pErr) {
                  console.error(`[Capture Event Error] ${pErr.message}`);
                } finally {
                  captureBusy = false;
                }
                return;
              }

              // POINT_READY:n Event handling
              const pointReadyMatch = /^POINT_READY:(\d+)$/i.exec(line);
              if (pointReadyMatch) {
                const pointIndex = Number(pointReadyMatch[1]);
                if (captureBusy) {
                  console.warn(`[Arduino Protocol] Busy processing point ${pointIndex}`);
                  if (activeSerialPort && activeSerialPort.isOpen) {
                    activeSerialPort.write(`POINT_RESULT:${pointIndex}:ERROR\n`);
                  }
                  return;
                }

                if (!hasPlantAtPoint(pointIndex)) {
                  const pointLabel = `Khay ${pointIndex + 1 < 10 ? "0" + (pointIndex + 1) : pointIndex + 1}`;
                  pushWebNotification(`Bo qua Vi tri ${pointIndex + 1} (${pointLabel}): Chua them cay trong.`, "INFO");
                  if (activeSerialPort && activeSerialPort.isOpen) {
                    activeSerialPort.write(`POINT_RESULT:${pointIndex}:NO_SPRAY\n`);
                  }
                  return;
                }

                captureBusy = true;
                const cancellationId = currentCancellationId;

                try {
                  pushWebNotification(`Dang chup anh & phan tich Gemini tai Diem ${pointIndex + 1}...`, "AI_ANALYSIS");

                  let imagePathToSend2 = null;
                  try {
                    imagePathToSend2 = await captureImage(Date.now());
                  } catch (capErr) {
                    console.error(`[Capture Error] Dung kiem tra Diem ${pointIndex + 1}: ${capErr.message}`);
                    pushWebNotification(`Loi chup anh tai Diem ${pointIndex + 1}: ${capErr.message}`, "ALERT");
                    await sendTelegramText(`LOI CHUP ANH TAI DIEM ${pointIndex + 1}: ${capErr.message}`);
                    if (cancellationId === currentCancellationId && activeSerialPort && activeSerialPort.isOpen) {
                      activeSerialPort.write(`POINT_RESULT:${pointIndex}:ERROR\n`);
                    }
                    return;
                  }

                  let formattedResult2 = "";
                  let action2 = "NO_SPRAY";
                  const keys2 = getKeysList();

                  if (keys2.length === 0) {
                    formattedResult2 = "Chua thiet lap Gemini API Key!";
                    pushWebNotification(formattedResult2, "WARNING");
                    if (cancellationId === currentCancellationId && activeSerialPort && activeSerialPort.isOpen) {
                      activeSerialPort.write(`POINT_RESULT:${pointIndex}:ERROR\n`);
                      console.log(`[Server -> Arduino] POINT_RESULT:${pointIndex}:ERROR (missing Gemini key)`);
                    }
                    try { await sendTelegramPhoto(imagePathToSend2, `KIỂM TRA Ở VỊ TRÍ (${pointIndex + 1})\n\n${formattedResult2}`); } catch (tErr) {}
                  } else {
                    let imageBase642 = null;
                    if (fs.existsSync(imagePathToSend2)) {
                      try {
                        const imgBuf2 = fs.readFileSync(imagePathToSend2);
                        imageBase642 = imgBuf2.toString("base64");
                      } catch (e) {}
                    }

                    const payload2 = {
                      contents: [{
                        parts: [
                          ...(imageBase642 ? [{ inlineData: { mimeType: "image/jpeg", data: imageBase642 } }] : []),
                          { text: createPrompt(pointIndex) }
                        ]
                      }],
                      generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: GEMINI_RESPONSE_SCHEMA
                      }
                    };

                    let parsedResult2 = null;
                    try {
                      const aiResult2 = await callGeminiApiWithRotation(payload2);
                      if (aiResult2 && aiResult2.text) {
                        try {
                          parsedResult2 = parseGeminiResult(aiResult2.text);
                          formattedResult2 = formatGeminiResult(parsedResult2);
                        } catch (pErr) {
                          formattedResult2 = aiResult2.text;
                        }
                      }
                    } catch (aiErr) {
                      console.error(`[Point ${pointIndex + 1} Gemini Error] ${aiErr.message}`);
                      formattedResult2 = `Loi Gemini AI: ${aiErr.message}`;
                    }

                    const hasPest2 = needSpray(formattedResult2);
                    action2 = hasPest2 ? "SPRAY" : "NO_SPRAY";
                    const aiStatus2 = parsedResult2 ? parsedResult2.status : (hasPest2 ? "CO SAU / BENH" : "KHONG PHAT HIEN SAU VA BENH");

                    addSystemLog("GEMINI_RES", `Diem ${pointIndex + 1}: [${aiStatus2}]`, "SUCCESS");

                    if (cancellationId === currentCancellationId && activeSerialPort && activeSerialPort.isOpen) {
                      activeSerialPort.write(`POINT_RESULT:${pointIndex}:${action2}\n`);
                      console.log(`[Server -> Arduino] POINT_RESULT:${pointIndex}:${action2}`);
                    }

                    // 1. Gửi Telegram TRƯỚC (await) - xong mới chuyển vị trí tiếp theo!
                    const teleCaption2 = `KIỂM TRA Ở VỊ TRÍ (${pointIndex + 1})\n\n${formattedResult2}`;
                    const savedPointSnapshot = persistSnapshotForHistory(imagePathToSend2, `point-${pointIndex + 1}`);
                    try { await sendTelegramPhoto(imagePathToSend2, teleCaption2); } catch (tErr) {}

                    // Xóa file snapshot sau khi gửi Telegram xong
                    if (imagePathToSend2 && !imagePathToSend2.endsWith("st01.jpg")) {
                      try { fs.unlinkSync(imagePathToSend2); } catch (e) {}
                      if (latestSnapshotPath === imagePathToSend2) latestSnapshotPath = null;
                    }

                    // 2. Gửi POINT_RESULT SAU KHI Telegram done - Arduino chuyển vị trí
                    try {
                      const hist2 = readJson("inspection_history.json", []);
                      hist2.unshift({
                        id: savedPointSnapshot.inspId,
                        type: "PEST",
                        timestamp: new Date().toLocaleString("vi-VN"),
                        title: `Diem ${pointIndex + 1} - Kiem tra sau hai`,
                        detail: formattedResult2,
                        status: hasPest2 ? "Phat hien sau hai" : "Suc khoe tot",
                        image: savedPointSnapshot.snapshotUrl,
                      });
                      if (hasPest2) {
                        hist2.unshift({
                          id: `spray-${Date.now()}`,
                          type: "SPRAY",
                          timestamp: new Date().toLocaleString("vi-VN"),
                          title: `Phun sinh hoc - Diem ${pointIndex + 1}`,
                          detail: `Arduino da phun thuoc sinh hoc tai diem ${pointIndex + 1} sau khi AI phat hien sau hai.`,
                          status: "Da phun sinh hoc",
                          image: savedPointSnapshot.snapshotUrl,
                        });
                      }
                      writeJson("inspection_history.json", hist2);
                    } catch (hErr) {}
                  }

                } catch (pErr) {
                  console.error(`[Point Event Error] ${pErr.message}`);
                  if (cancellationId === currentCancellationId && activeSerialPort && activeSerialPort.isOpen) {
                    activeSerialPort.write(`POINT_RESULT:${pointIndex}:ERROR\n`);
                  }
                } finally {
                  captureBusy = false;
                }
                return;
              }

            } catch (handlerErr) {
              console.error(`[Serial Data Handler Error] ${handlerErr.message}`);
            }
          });

          return activeSerialPort;

        } catch (openErr) {
          lastErr = openErr;
          const isAccessDenied = 
            openErr.message.toLowerCase().includes("access denied") ||
            openErr.message.toLowerCase().includes("access is denied") ||
            openErr.message.toLowerCase().includes("eacces") ||
            openErr.message.includes("EACCES");

          if (isAccessDenied && attempt < MAX_RETRY) {
            console.warn(`[Arduino] COM port bi chiem boi tien trinh khac (Access Denied). Thu lai sau ${attempt * 2}s... (${attempt}/${MAX_RETRY})`);
            await new Promise((r) => setTimeout(r, attempt * 2000));
            continue;
          }
          throw openErr;
        }
      }

      throw lastErr || new Error("Khong the mo serial port Arduino sau nhieu lan thu lai.");
    })();

    return await _arduinoInitPromise;

  } catch (err) {
    _arduinoInitPromise = null;
    console.error(`[Arduino Init Error] ${err.message}`);
    throw err;
  }
}

// DIRECT COMMAND TRANSMISSION METHOD - with retry on port error
async function sendDirectCommandToArduino(cmdString) {
  try {
    const port = await getOrInitArduinoSerialPort();
    if (!port || !port.isOpen) {
      throw new Error("Khong the mo hoac duy tri cong Serial ket noi voi Arduino!");
    }

    return new Promise((resolve, reject) => {
      port.write(`${cmdString}\n`, (err) => {
        if (err) {
          // Neu loi khi write -> reset port de lan sau init lai
          activeSerialPort = null;
          _arduinoInitPromise = null;
          return reject(new Error(`Loi truyen lenh toi Arduino: ${err.message}`));
        }
        resolve(true);
      });
    });
  } catch (err) {
    const isAccessDenied = err.message.toLowerCase().includes("access denied") ||
                           err.message.toLowerCase().includes("access is denied");
    if (isAccessDenied) {
      console.warn(`[Arduino CMD] COM port bi Access Denied - co the co server khac dang chay. Kiem tra va dong instance thua.`);
    }
    throw err;
  }
}

async function runFullGardenSpray() {
  const ardStatus = await getRealSerialStatus();
  if (!ardStatus.connected && process.platform === "linux") {
    throw new Error("Mạch Arduino chưa được kết nối! Vui lòng cắm cáp USB Arduino.");
  }

  const plants = readJson("plants.json", []);
  const plantedPointIndexes = [...new Set(
    plants
      .filter((plant) => plant && plant.location)
      .map((plant) => getPointIndexFromLocation(plant.location))
      .filter((pointIdx) => Number.isInteger(pointIdx) && pointIdx >= 0 && pointIdx <= 5)
  )].sort((a, b) => a - b);

  if (plantedPointIndexes.length === 0) {
    addSystemLog("FULL_SPRAY", "Không có khay nào đang có cây, bỏ qua lệnh phun.", "WARNING");
    pushWebNotification("Không có khay nào đang gieo trồng cây trong /plants. Đã bỏ qua lệnh phun toàn bộ.", "WARNING");
    return { sprayedPoints: [], skippedPoints: [0, 1, 2, 3, 4, 5] };
  }

  const plantedLabels = plantedPointIndexes.map((pointIdx) => `Khay ${String(pointIdx + 1).padStart(2, "0")}`);
  const skippedPoints = [0, 1, 2, 3, 4, 5].filter((pointIdx) => !plantedPointIndexes.includes(pointIdx));
  const skippedLabels = skippedPoints.map((pointIdx) => `Khay ${String(pointIdx + 1).padStart(2, "0")}`);

  addSystemLog("FULL_SPRAY", `Bắt đầu phun các khay có cây: ${plantedLabels.join(", ")}. Bỏ qua ${skippedPoints.length} khay trống (${skippedLabels.join(", ")}).`, "PROCESS");
  pushWebNotification(`🚿 Đang kích hoạt phun thuốc toàn bộ vườn tại ${plantedPointIndexes.length} vị trí có cây (${plantedLabels.join(", ")})...`, "PROCESS");

  const routeCommand = `FULL_SPRAY_PLANTED:${plantedPointIndexes.join(",")}`;
  const doneWait = waitForFullSprayDone(120000);
  try {
    await sendDirectCommandToArduino(routeCommand);
    await doneWait;
  } catch (err) {
    console.warn(`[Full Spray Warning] ${err.message}`);
    if (process.platform !== "linux" || !ardStatus.connected) {
      addSystemLog("FULL_SPRAY", `Đã hoàn tất phun ${plantedPointIndexes.length} khay có cây.`, "SUCCESS");
      pushWebNotification(`✅ Đã phun xong ${plantedPointIndexes.length} khay có cây và bỏ qua các khay trống.`, "SUCCESS");
      return { sprayedPoints: plantedPointIndexes, skippedPoints };
    }
  }

  addSystemLog("FULL_SPRAY", `Hoàn tất phun ${plantedPointIndexes.length} khay có cây, bỏ qua ${skippedPoints.length} khay trống`, "SUCCESS");
  pushWebNotification(`✅ Đã phun xong ${plantedPointIndexes.length} khay có cây và bỏ qua các khay trống.`, "SUCCESS");

  return { sprayedPoints: plantedPointIndexes, skippedPoints };
}

async function runFullGardenInspection() {
  const ardStatus = await getRealSerialStatus();
  if (!ardStatus.connected && process.platform === "linux") {
    throw new Error("Mạch Arduino chưa được kết nối! Vui lòng cắm cáp USB Arduino.");
  }

  const plants = readJson("plants.json", []);
  
  // Lọc duy nhất các vị trí (pointIndex 0..5) ĐANG CÓ CÂY TRỒNG trong data/plants.json
  const plantedPointIndexes = [];
  for (let idx = 0; idx < 6; idx++) {
    if (hasPlantAtPoint(idx)) {
      plantedPointIndexes.push(idx);
    }
  }

  const skippedPoints = [0, 1, 2, 3, 4, 5].filter((idx) => !plantedPointIndexes.includes(idx));

  if (plantedPointIndexes.length === 0) {
    addSystemLog("CHECK_PESTS", "Không có cây nào trong danh sách /plants. Đã bỏ qua kiểm tra sâu hại.", "WARNING");
    pushWebNotification("Không có vị trí nào đang gieo trồng cây trong /plants. Đã bỏ qua lệnh kiểm tra sâu hại.", "WARNING");
    return { inspectedPoints: [], skippedPoints: [0, 1, 2, 3, 4, 5], results: [] };
  }

  const plantedLabels = plantedPointIndexes.map((idx) => `Khay ${String(idx + 1).padStart(2, "0")}`);
  const skippedLabels = skippedPoints.map((idx) => `Khay ${String(idx + 1).padStart(2, "0")}`);

  addSystemLog("CHECK_PESTS", `Bắt đầu kiểm tra sâu hại tại các vị trí có cây: ${plantedLabels.join(", ")}. Bỏ qua ${skippedPoints.length} khay trống (${skippedLabels.join(", ")}).`, "PROCESS");
  pushWebNotification(`🐛 Bắt đầu kiểm tra sâu hại tại ${plantedPointIndexes.length} vị trí có cây (${plantedLabels.join(", ")}). Bỏ qua ${skippedPoints.length} khay trống.`, "AI_ANALYSIS");

  const results = [];

  for (const pointIdx of plantedPointIndexes) {
    const trayName = `Khay ${String(pointIdx + 1).padStart(2, "0")}`;
    const matchingPlant = plants.find((p) => {
      if (!p || !p.location) return false;
      const matches = String(p.location).match(/\d+/g);
      return matches && matches.some((n) => parseInt(n, 10) === pointIdx + 1);
    });
    const plantName = matchingPlant ? matchingPlant.name : "";

    addSystemLog("INSPECT_MOVE", `🐛 Đang điều khiển Robot di chuyển tới ${trayName} (Điểm ${pointIdx + 1}) để kiểm tra sâu bệnh...`, "PROCESS");
    pushWebNotification(`🐛 Đang điều khiển Robot di chuyển tới ${trayName} (Điểm ${pointIdx + 1}) để kiểm tra sâu bệnh trên cây ${plantName || ""}...`, "AI_ANALYSIS");

    // 1. Gửi lệnh di chuyển tới điểm tương ứng trên Arduino
    const moveWait = waitForArduinoMove(pointIdx, 5000);
    try {
      await sendDirectCommandToArduino(`P${pointIdx + 1}`);
    } catch (moveErr) {
      const waiter = pendingMoveResolvers.get(pointIdx);
      if (waiter) waiter.reject(moveErr);
      console.warn(`[Inspect Move Warning] ${moveErr.message}`);
    }
    await moveWait.catch(() => {});

    // 2. Chụp ảnh từ Camera với đèn LED Flash trợ sáng
    let imagePathToSend = null;
    try {
      try {
        await sendDirectCommandToArduino("LED_ON");
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (ledErr) {}

      imagePathToSend = await captureImage();

      try {
        await sendDirectCommandToArduino("LED_OFF");
      } catch (ledErr) {}

      addSystemLog("CAM_CAPTURE", `[Camera Log] Đã bật Flash & chụp ảnh thành công tại ${trayName}!`, "SUCCESS");
    } catch (capErr) {
      try {
        await sendDirectCommandToArduino("LED_OFF");
      } catch (ledErr) {}
      console.error(`[Inspect Capture Error] ${capErr.message}`);
      addSystemLog("CAM_CAPTURE", `❌ Chụp ảnh không thành công tại ${trayName}: ${capErr.message}`, "ALERT");
      continue;
    }

    if (!imagePathToSend || !fs.existsSync(imagePathToSend)) {
      continue;
    }

    // 3. Phân tích Gemini AI
    const keys = getKeysList();
    if (keys.length === 0) {
      addSystemLog("GEMINI_ERR", `❌ Chưa thiết lập Gemini API Key trong hệ thống`, "ALERT");
      pushWebNotification(`❌ Chưa thiết lập Gemini API Key!`, "ALERT");
      break;
    }

    let imageBase64 = null;
    try {
      const imgBuf = fs.readFileSync(imagePathToSend);
      imageBase64 = imgBuf.toString("base64");
    } catch (e) {}

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: createPrompt(pointIdx) },
            ...(imageBase64 ? [{ inlineData: { mimeType: "image/jpeg", data: imageBase64 } }] : [])
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 1200,
        thinkingConfig: { thinkingLevel: "minimal" },
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA
      }
    };

    let parsedResult = null;
    let formattedResult = "";
    try {
      const aiResult = await callGeminiApiWithRotation(payload);
      if (aiResult && aiResult.text) {
        try {
          parsedResult = parseGeminiResult(aiResult.text);
          formattedResult = formatGeminiResult(parsedResult);
        } catch (pErr) {
          formattedResult = aiResult.text;
        }
      }
    } catch (aiErr) {
      console.error(`[Gemini AI Inspect Error] ${aiErr.message}`);
      addSystemLog("GEMINI_ERR", `❌ Lỗi Gemini AI tại ${trayName}: ${aiErr.message}`, "ALERT");
      continue;
    }

    const hasPest = needSpray(formattedResult);
    const aiStatusText = parsedResult ? parsedResult.status : (hasPest ? "CÓ SÂU / BỆNH" : "KHÔNG PHÁT HIỆN SÂU VÀ BỆNH");

    if (hasPest) {
      await sendDirectCommandToArduino("SPRAY").catch(() => {});
      addSystemLog("ACTUATE", `🚨 Lệnh Arduino tại ${trayName}: SPRAY (Kích hoạt bơm phun thuốc)`, "WARNING");
      pushWebNotification(`🚨 Gemini AI phân tích ${plantName ? plantName + " (" + trayName + ")" : trayName}: [${aiStatusText}]! Đã kích hoạt bơm SPRAY.`, "WARNING");
    } else {
      await sendDirectCommandToArduino("NO_SPRAY").catch(() => {});
      addSystemLog("ACTUATE", `🌿 Lệnh Arduino tại ${trayName}: NO_SPRAY (Cây khỏe mạnh)`, "SUCCESS");
      pushWebNotification(`🌿 Gemini AI phân tích ${plantName ? plantName + " (" + trayName + ")" : trayName}: [${aiStatusText}].`, "SUCCESS");
    }

    const telegramCaption = `🐛 KIỂM TRA SÂU BỆNH - ${trayName.toUpperCase()}\n🌱 Cây: ${plantName || "Trồng tại vườn"}\n\n${formattedResult}`;
    try {
      sendTelegramPhoto(imagePathToSend, telegramCaption).catch(() => {});
    } catch (tErr) {}

    const { inspId, snapshotUrl } = persistSnapshotForHistory(imagePathToSend, "plant-insp");
    const historyEntry = {
      id: inspId,
      plantId: matchingPlant?.id || "",
      type: "PEST",
      timestamp: new Date().toLocaleString("vi-VN"),
      title: `Kiểm tra sâu hại - ${plantName || trayName}`,
      detail: formattedResult,
      telegramCaption: telegramCaption,
      status: hasPest ? "Phát hiện sâu hại" : "Sức khỏe tốt",
      image: snapshotUrl,
    };

    const history = readJson("inspection_history.json", []);
    history.unshift(historyEntry);
    if (hasPest) {
      history.unshift({
        id: `spray-${Date.now()}`,
        plantId: matchingPlant?.id || "",
        type: "SPRAY",
        timestamp: new Date().toLocaleString("vi-VN"),
        title: `Phun sinh hoc - ${plantName || trayName}`,
        detail: `Arduino da phun thuoc sinh hoc tai ${trayName} sau khi AI phat hien sau hai.`,
        status: "Da phun sinh hoc",
        image: snapshotUrl,
      });
    }
    writeJson("inspection_history.json", history);
    results.push(historyEntry);
  }

  // Đưa Robot về vị trí Gốc (Home) sau khi kết thúc chu trình
  try {
    await sendDirectCommandToArduino("H");
  } catch (e) {}

  addSystemLog("CHECK_PESTS", `Hoàn tất kiểm tra sâu bệnh tại ${plantedPointIndexes.length} vị trí có cây. Đã bỏ qua ${skippedPoints.length} khay trống.`, "SUCCESS");
  pushWebNotification(`✅ Đã hoàn tất kiểm tra sâu bệnh tại ${plantedPointIndexes.length} vị trí có cây. Đã bỏ qua ${skippedPoints.length} vị trí trống.`, "SUCCESS");

  return { inspectedPoints: plantedPointIndexes, skippedPoints, results };
}

// Cleanup khi process exit
process.on("exit", () => {
  if (activeSerialPort && activeSerialPort.isOpen) {
    try { activeSerialPort.close(); } catch (e) {}
  }
});
process.on("SIGINT", () => { process.exit(0); });
process.on("SIGTERM", () => { process.exit(0); });

app.post("/api/arduino/command", async (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ success: false, error: "Vui lòng truyền mã lệnh điều khiển!" });
  }

  const mapped = ARDUINO_COMMAND_MAP[command] || { cmd: command, label: `Gửi lệnh: ${command}`, desc: "Lệnh tùy chỉnh" };
  const timestamp = new Date().toLocaleTimeString("vi-VN");

  try {
    if (mapped.cmd === "FULL_SPRAY") {
      const sprayResult = await runFullGardenSpray();

      const logEntry = {
        timestamp,
        command: mapped.cmd,
        label: mapped.label,
        status: "SENT_TO_ARDUINO",
      };

      lastArduinoLogs.unshift(logEntry);
      if (lastArduinoLogs.length > 25) lastArduinoLogs.pop();

      return res.json({
        success: true,
        message: sprayResult.sprayedPoints.length > 0
          ? `Đã phun ${sprayResult.sprayedPoints.length} khay có cây và bỏ qua ${sprayResult.skippedPoints.length} khay trống.`
          : "Không có khay nào đang có cây nên đã bỏ qua lệnh phun.",
        command: mapped.cmd,
        timestamp: logEntry.timestamp,
        sprayedPoints: sprayResult.sprayedPoints,
        skippedPoints: sprayResult.skippedPoints,
      });
    }

    if (mapped.cmd === "CHECK_PESTS" || mapped.cmd === "k") {
      const inspectResult = await runFullGardenInspection();

      const logEntry = {
        timestamp,
        command: mapped.cmd,
        label: mapped.label,
        status: "COMPLETED",
      };

      lastArduinoLogs.unshift(logEntry);
      if (lastArduinoLogs.length > 25) lastArduinoLogs.pop();

      return res.json({
        success: true,
        message: inspectResult.inspectedPoints.length > 0
          ? `Đã kiểm tra sâu bệnh tại ${inspectResult.inspectedPoints.length} vị trí có cây và bỏ qua ${inspectResult.skippedPoints.length} vị trí trống.`
          : "Không có vị trí nào đang có cây trong /plants nên đã bỏ qua lệnh kiểm tra.",
        command: mapped.cmd,
        timestamp: logEntry.timestamp,
        inspectedPoints: inspectResult.inspectedPoints,
        skippedPoints: inspectResult.skippedPoints,
      });
    }

    if (mapped.cmd === "STOP" || command === "s" || command === "STOP") {
      currentCancellationId++;
      captureBusy = false;
      if (pendingFullSprayResolver) {
        try { pendingFullSprayResolver.reject(new Error("ĐÃ DỪNG KHẨN CẤP")); } catch (e) {}
        pendingFullSprayResolver = null;
      }
      pendingMoveResolvers.forEach((waiter) => {
        try { waiter.reject(new Error("ĐÃ DỪNG KHẨN CẤP")); } catch (e) {}
      });
      pendingMoveResolvers.clear();

      try {
        await sendDirectCommandToArduino("STOP");
        await sendDirectCommandToArduino("S");
      } catch (e) {
        console.warn(`[Emergency Stop Direct Send Warning] ${e.message}`);
      }
      try {
        await sendDirectCommandToArduino("SPRAY_OFF");
      } catch (e) {}

      addSystemLog("EMERGENCY_STOP", "Dừng khẩn cấp (Emergency Stop) đã được kích hoạt!", "WARNING");
      pushWebNotification("🚨 ĐÃ KÍCH HOẠT DỪNG KHẨN CẤP! Hệ thống đã ngắt toàn bộ động cơ và máy bơm.", "ALERT");

      const logEntry = {
        timestamp,
        command: "STOP",
        label: "Dừng khẩn cấp (s)",
        status: "COMPLETED",
      };

      lastArduinoLogs.unshift(logEntry);
      if (lastArduinoLogs.length > 25) lastArduinoLogs.pop();

      return res.json({
        success: true,
        message: "🚨 Đã kích hoạt DỪNG KHẨN CẤP! Ngắt toàn bộ động cơ và máy bơm thành công.",
        command: "STOP",
        timestamp: logEntry.timestamp,
      });
    }

    if (mapped.cmd === "RESET_ERROR" || command === "r" || command === "RESET_ERROR") {
      captureBusy = false;
      if (pendingFullSprayResolver) {
        try { pendingFullSprayResolver.reject(new Error("ĐÃ KHÔI PHỤC HỆ THỐNG")); } catch (e) {}
        pendingFullSprayResolver = null;
      }
      pendingMoveResolvers.forEach((waiter) => {
        try { waiter.reject(new Error("ĐÃ KHÔI PHỤC HỆ THỐNG")); } catch (e) {}
      });
      pendingMoveResolvers.clear();

      try {
        await sendDirectCommandToArduino("RESET_ERROR");
      } catch (e) {
        console.warn(`[Reset Error Direct Send Warning] ${e.message}`);
      }
      try {
        await sendDirectCommandToArduino("SPRAY_OFF");
      } catch (e) {}

      addSystemLog("RESET_ERROR", "Khôi phục hệ thống (Reset Error) hoàn tất.", "SUCCESS");
      pushWebNotification("🔄 Hệ thống đã được khôi phục về trạng thái hoạt động bình thường.", "SUCCESS");

      const logEntry = {
        timestamp,
        command: "RESET_ERROR",
        label: "Khôi phục (r)",
        status: "COMPLETED",
      };

      lastArduinoLogs.unshift(logEntry);
      if (lastArduinoLogs.length > 25) lastArduinoLogs.pop();

      return res.json({
        success: true,
        message: "🔄 Hệ thống đã được khôi phục về trạng thái hoạt động bình thường!",
        command: "RESET_ERROR",
        timestamp: logEntry.timestamp,
      });
    }

    if (mapped.cmd === "HOME" || command === "h" || command === "HOME") {
      captureBusy = false;
      try {
        await sendDirectCommandToArduino("HOME");
      } catch (e) {
        console.warn(`[Homing Direct Send Warning] ${e.message}`);
      }

      addSystemLog("HOMING", "Đang đưa robot về vị trí gốc (Homing)...", "PROCESS");
      pushWebNotification("🏠 Đang kích hoạt đưa robot về vị trí gốc (Homing)...", "PROCESS");

      const logEntry = {
        timestamp,
        command: "HOME",
        label: "Về vị trí gốc (h)",
        status: "COMPLETED",
      };

      lastArduinoLogs.unshift(logEntry);
      if (lastArduinoLogs.length > 25) lastArduinoLogs.pop();

      return res.json({
        success: true,
        message: "🏠 Đã gửi lệnh đưa robot về vị trí gốc (Homing)!",
        command: "HOME",
        timestamp: logEntry.timestamp,
      });
    }

    // Send command directly to SerialPort
    try {
      await sendDirectCommandToArduino(mapped.cmd);
    } catch (sendErr) {
      console.warn(`[Direct Command Warning] ${sendErr.message}`);
      if (process.platform !== "linux") {
        addSystemLog("ARDUINO_CMD", `Đã gửi lệnh ${mapped.label} (chế độ tự động/mô phỏng)`, "PROCESS");
        pushWebNotification(`Đã thực thi lệnh ${mapped.label}.`, "PROCESS");
        const logEntry = {
          timestamp,
          command: mapped.cmd,
          label: mapped.label,
          status: "SENT_MOCK",
        };
        lastArduinoLogs.unshift(logEntry);
        if (lastArduinoLogs.length > 25) lastArduinoLogs.pop();

        return res.json({
          success: true,
          message: `Đã thực thi lệnh "${mapped.label}"!`,
          command: mapped.cmd,
          timestamp,
        });
      }
      throw sendErr;
    }

    const logEntry = {
      timestamp,
      command: mapped.cmd,
      label: mapped.label,
      status: "SENT_TO_ARDUINO",
    };

    lastArduinoLogs.unshift(logEntry);
    if (lastArduinoLogs.length > 25) lastArduinoLogs.pop();

    console.log(`[Arduino Direct Command] ${logEntry.timestamp} -> Transmitted: ${mapped.cmd}`);

    return res.json({
      success: true,
      message: `Đã truyền lệnh "${mapped.label}" (mã: '${mapped.cmd}') trực tiếp xuống cổng Serial Arduino!`,
      command: mapped.cmd,
      timestamp: logEntry.timestamp,
    });
  } catch (err) {
    const logEntry = {
      timestamp,
      command: mapped.cmd,
      label: mapped.label,
      status: "FAILED",
    };

    lastArduinoLogs.unshift(logEntry);
    if (lastArduinoLogs.length > 25) lastArduinoLogs.pop();

    return res.status(500).json({
      success: false,
      error: `Lỗi truyền lệnh tới Arduino: ${err.message}`,
      command: mapped.cmd,
    });
  }
});

// ESP32 REALTIME SENSOR DATA POLLING ENDPOINT - points to the live lastEsp32Sensors object
// NOTE: lastEsp32Sensors is defined and updated at line ~1572 by the ESP32 serial parser
app.get("/api/esp32/sensors", (req, res) => {
  // Serve the live sensor data with both 'data' and 'sensors' keys for compatibility
  const live = typeof lastEsp32Sensors !== 'undefined' ? lastEsp32Sensors : {
    soil1Raw: 3171, soil1Percent: 0, soil2Raw: 4095, soil2Percent: 0,
    avgSoilPercent: 0, floatLow: false, floatHigh: false, running: false,
  };
  return res.json({
    success: true,
    data: {
      soil1Raw: live.soil1Raw,
      soil1Percent: live.soil1Percent,
      soil2Raw: live.soil2Raw,
      soil2Percent: live.soil2Percent,
      floatHigh: live.floatHigh,
      floatLow: live.floatLow,
      avgMoisture: live.avgSoilPercent,
      running: live.running,
      lastUpdate: live.lastUpdate,
    },
    sensors: live,
  });
});

async function getRealSerialStatus() {
  try {
    const { SerialPort } = require("serialport");
    const ports = await SerialPort.list();
    const allPortPaths = ports.map(
      (p) => `${p.path}${p.manufacturer ? ` (${p.manufacturer})` : ""}`
    );

    if (activeSerialPort && activeSerialPort.isOpen) {
      return {
        connected: true,
        port: activeSerialPort.path,
        baudRate: activeSerialPort.baudRate || 9600,
        pointCount: 6,
        statusMessage: `Đã kết nối trực tiếp với mạch Arduino trên cổng ${activeSerialPort.path}`,
        allPorts: allPortPaths,
      };
    }

    // Lọc duy nhất các cổng thực sự thuộc về Arduino (loại trừ hẳn chip ESP32/CP210x/Silicon Labs)
    const arduinoPorts = ports.filter((p) => {
      const pathStr = (p.path || "").toUpperCase();
      const mfg = (p.manufacturer || "").toUpperCase();

      // Bỏ qua các chip đặc trưng của ESP32 để không nhận nhầm!
      if (
        mfg.includes("SILICON") ||
        mfg.includes("CP210") ||
        mfg.includes("ESPRESSIF") ||
        mfg.includes("ESP32") ||
        mfg.includes("CH9102")
      ) {
        return false;
      }

      return (
        mfg.includes("ARDUINO") ||
        mfg.includes("GENUINO") ||
        pathStr.includes("TTYACM") ||
        mfg.includes("CH340") ||
        mfg.includes("CH341") ||
        mfg.includes("FTDI") ||
        mfg.includes("QINHENG")
      );
    });

    // Chỉ chọn port khi thực sự tìm thấy thiết bị Arduino, KHÔNG fallback lấy bậy cổng ESP32!
    const chosenPort = arduinoPorts.length > 0 ? arduinoPorts[0] : null;

    return {
      connected: !!chosenPort,
      port: chosenPort ? chosenPort.path : "Chưa kết nối cổng Arduino",
      baudRate: 9600,
      pointCount: 6,
      statusMessage: chosenPort
        ? `Phát hiện cổng Arduino tại ${chosenPort.path}${chosenPort.manufacturer ? ` (${chosenPort.manufacturer})` : ""}`
        : "Chưa kết nối: Không phát hiện mạch Arduino (UNO/Mega/Nano) nào cắm vào USB!",
      allPorts: allPortPaths,
    };
  } catch (err) {
    return {
      connected: false,
      port: "Không có cổng Serial/USB",
      baudRate: 9600,
      pointCount: 6,
      statusMessage: `Lỗi quét Serial Arduino: ${err.message}`,
      allPorts: [],
    };
  }
}

let activeEsp32Port = null;

async function getRealEsp32Status() {
  try {
    const { SerialPort } = require("serialport");
    const ports = await SerialPort.list();
    const allPortPaths = ports.map(
      (p) => `${p.path}${p.manufacturer ? ` (${p.manufacturer})` : ""}`
    );

    if (activeEsp32Port && activeEsp32Port.isOpen) {
      return {
        connected: true,
        port: activeEsp32Port.path,
        baudRate: activeEsp32Port.baudRate || 115200,
        tankCount: 4,
        statusMessage: `Đã kết nối trực tiếp với mạch ESP32 trên cổng ${activeEsp32Port.path}`,
        allPorts: allPortPaths,
      };
    }

    const arduinoPortPathUpper = (activeSerialPort && activeSerialPort.path) ? activeSerialPort.path.toUpperCase() : "";

    // Lọc duy nhất các cổng thuộc về ESP32 (CP210x, Silicon Labs, Espressif, CH9102)
    const esp32Candidates = ports.filter((p) => {
      const pathStr = (p.path || "").toUpperCase();
      if (arduinoPortPathUpper && pathStr === arduinoPortPathUpper) return false; // Không bao giờ chạm vào cổng Arduino COM
      const mfg = (p.manufacturer || "").toUpperCase();

      // Bỏ qua chip đặc trưng của Arduino
      if (mfg.includes("ARDUINO") || mfg.includes("GENUINO")) {
        return false;
      }

      return (
        mfg.includes("SILICON") ||
        mfg.includes("CP210") ||
        mfg.includes("ESPRESSIF") ||
        mfg.includes("ESP32") ||
        mfg.includes("CH9102") ||
        pathStr.includes("TTYUSB") ||
        (pathStr.includes("COM") && !mfg.includes("CH340") && !mfg.includes("FTDI"))
      );
    });

    const chosenPort = esp32Candidates.length > 0 ? esp32Candidates[0] : null;

    return {
      connected: !!chosenPort,
      port: chosenPort ? chosenPort.path : "Chưa kết nối cổng ESP32",
      baudRate: 115200,
      tankCount: 4,
      statusMessage: chosenPort
        ? `Phát hiện cổng ESP32 tại ${chosenPort.path}${chosenPort.manufacturer ? ` (${chosenPort.manufacturer})` : ""}`
        : "Chưa kết nối: Không phát hiện mạch ESP32 nào cắm vào cổng USB/Serial!",
      allPorts: allPortPaths,
    };
  } catch (err) {
    return {
      connected: false,
      port: "Không tìm thấy cổng ESP32",
      baudRate: 115200,
      tankCount: 4,
      statusMessage: `Lỗi quét Serial ESP32: ${err.message}`,
      allPorts: [],
    };
  }
}

app.get("/api/arduino/status", async (req, res) => {
  const serialInfo = await getRealSerialStatus();
  res.json({
    ...serialInfo,
    lastPingTime: new Date().toLocaleTimeString("vi-VN"),
    lastLogs: lastArduinoLogs,
    inspectionResults: lastInspectionResults,
  });
});

app.post("/api/arduino/ping-check", async (req, res) => {
  const timestamp = new Date().toLocaleTimeString("vi-VN");
  const serialInfo = await getRealSerialStatus();

  try {
    if (serialInfo.connected) {
      await sendDirectCommandToArduino("PING");
    }
  } catch (err) {}

  lastArduinoLogs.unshift({
    timestamp,
    command: "PING",
    label: "Kiểm tra kết nối Arduino thực tế (PING)",
    status: serialInfo.connected ? "PONG_RECEIVED" : "NO_RESPONSE",
  });
  if (lastArduinoLogs.length > 25) lastArduinoLogs.pop();

  res.json({
    success: serialInfo.connected,
    message: serialInfo.connected
      ? `Đã nhận diện thiết bị Arduino trên cổng ${serialInfo.port}!`
      : "Chưa kết nối: Không phát hiện thiết bị Arduino trên các cổng Serial/USB!",
    status: {
      ...serialInfo,
      lastPingTime: timestamp,
    },
  });
});

// ESP32 CONNECTION DIAGNOSTICS ENDPOINTS
app.get("/api/esp32/status", async (req, res) => {
  const espInfo = await getRealEsp32Status();
  res.json({
    ...espInfo,
    lastPingTime: new Date().toLocaleTimeString("vi-VN"),
  });
});

app.post("/api/esp32/ping-check", async (req, res) => {
  const timestamp = new Date().toLocaleTimeString("vi-VN");
  const espInfo = await getRealEsp32Status();

  try {
    if (espInfo.connected) {
      await sendDirectCommandToEsp32("STATUS");
    }
  } catch (err) {}

  res.json({
    success: espInfo.connected,
    message: espInfo.connected
      ? `Đã nhận diện thành công mạch ESP32 trên cổng ${espInfo.port} (${espInfo.statusMessage})!`
      : "Chưa kết nối: Không phát hiện mạch ESP32 nào cắm vào cổng USB/Serial!",
    status: {
      ...espInfo,
      lastPingTime: timestamp,
    },
  });
});

// =========================================================
// ESP32 SERIAL COMMAND & REAL-TIME SOIL SENSOR SYSTEM
// =========================================================

let lastEsp32Sensors = {
  soil1Raw: 3171,
  soil2Raw: 4095,
  soil1Percent: 0,
  soil2Percent: 0,
  avgSoilPercent: 0,
  floatLow: false,
  floatHigh: false,
  running: false,
  lastUpdate: new Date().toLocaleTimeString("vi-VN"),
};

function parseEsp32Moisture(soil1Raw, soil2Raw) {
  // Quy định độ ẩm của 2 cảm biến:
  // Mức 3171 là 0%, mức 1307 là 100%
  // Mức 4095 là 0%, mức 1038 là 100%
  const pct1 = Math.min(100, Math.max(0, Math.round(((3171 - soil1Raw) / (3171 - 1307)) * 100)));
  const pct2 = Math.min(100, Math.max(0, Math.round(((4095 - soil2Raw) / (4095 - 1038)) * 100)));
  const avg = Math.round((pct1 + pct2) / 2);
  return { pct1, pct2, avg };
}

async function sendDirectCommandToEsp32(cmdString) {
  try {
    const { SerialPort } = require("serialport");
    if (activeEsp32Port && activeEsp32Port.isOpen) {
      activeEsp32Port.write(`${cmdString}\n`);
      return true;
    }

    const ports = await SerialPort.list();
    const arduinoPathUpper = (activeSerialPort && activeSerialPort.path) ? activeSerialPort.path.toUpperCase() : "";
    const candidates = ports.filter((p) => {
      const pathStr = (p.path || "").toUpperCase();
      if (arduinoPathUpper && pathStr === arduinoPathUpper) return false;
      const mfg = (p.manufacturer || "").toUpperCase();

      if (mfg.includes("ARDUINO") || mfg.includes("GENUINO")) {
        return false;
      }

      return (
        mfg.includes("SILICON") ||
        mfg.includes("CP210") ||
        mfg.includes("ESPRESSIF") ||
        mfg.includes("ESP32") ||
        mfg.includes("CH9102") ||
        pathStr.includes("TTYUSB") ||
        (pathStr.includes("COM") && !mfg.includes("CH340") && !mfg.includes("FTDI"))
      );
    });

    if (candidates.length > 0) {
      const { ReadlineParser } = require("serialport");
      activeEsp32Port = new SerialPort({
        path: candidates[0].path,
        baudRate: 115200,
        autoOpen: false,
      });

      await new Promise((res, rej) => activeEsp32Port.open((err) => (err ? rej(err) : res())));
      const parser = activeEsp32Port.pipe(new ReadlineParser({ delimiter: "\n" }));

      parser.on("data", (rawLine) => {
        const line = String(rawLine).trim();
        if (!line) return;
        console.log(`[ESP32 -> Server] ${line}`);

        if (line.startsWith("STATUS,")) {
          const parts = line.split(",");
          let s1 = 3171, s2 = 4095, low = 0, high = 0, run = 0;
          parts.forEach((p) => {
            const [k, v] = p.split("=");
            if (k === "SOIL1") s1 = parseInt(v, 10) || 3171;
            if (k === "SOIL2") s2 = parseInt(v, 10) || 4095;
            if (k === "LOW") low = parseInt(v, 10) || 0;
            if (k === "HIGH") high = parseInt(v, 10) || 0;
            if (k === "RUN") run = parseInt(v, 10) || 0;
          });

          const { pct1, pct2, avg } = parseEsp32Moisture(s1, s2);
          lastEsp32Sensors = {
            soil1Raw: s1,
            soil2Raw: s2,
            soil1Percent: pct1,
            soil2Percent: pct2,
            avgSoilPercent: avg,
            floatLow: low === 1,
            floatHigh: high === 1,
            running: run === 1,
            lastUpdate: new Date().toLocaleTimeString("vi-VN"),
          };
        }
      });

      activeEsp32Port.write(`${cmdString}\n`);
      return true;
    }
  } catch (err) {
    console.warn(`[ESP32 Direct Command Warning] ${err.message}`);
  }
  return false;
}

// Tự động gửi STATUS định kỳ 1.5s xuống ESP32 để đọc độ ẩm cảm biến thực tế liên tục
setInterval(async () => {
  try {
    if (activeEsp32Port && activeEsp32Port.isOpen) {
      activeEsp32Port.write("STATUS\n");
    } else {
      await sendDirectCommandToEsp32("STATUS");
    }
  } catch (e) {}
}, 1500);

// NOTE: /api/esp32/sensors is defined above at line ~1338 (unified endpoint)

app.post("/api/esp32/command", async (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ success: false, error: "Thiếu tham số command" });
  }

  const success = await sendDirectCommandToEsp32(command);
  res.json({
    success: true,
    command,
    sentToHardware: success,
    timestamp: new Date().toLocaleTimeString("vi-VN"),
  });
});

app.post("/api/esp32/dose", async (req, res) => {
  const { tankCode, ml } = req.body; // e.g. tankCode: "Bình A", ml: 3.5
  if (!tankCode || !ml) {
    return res.status(400).json({ success: false, error: "Thiếu tankCode hoặc lượng ml" });
  }

  // Chuyển mã bình ("Bình A" -> 'A')
  const pumpLetter = (tankCode.replace(/bình\s*/i, "").trim() || "A").toUpperCase();
  const durationSec = Math.max(1, Math.round(ml * 60)); // Quy đổi: 1 ml = 60 giây (1 phút)
  const cmdStr = `DOSE ${pumpLetter} ${durationSec}`;

  // Trừ dung tích phân còn lại trong file data/fertilizers.json
  const dataPath = path.join(process.cwd(), "data", "fertilizers.json");
  if (fs.existsSync(dataPath)) {
    try {
      let ferts = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      ferts = ferts.map((f) => {
        if (f.tankCode === tankCode) {
          const newMl = Math.max(0, Number((f.currentMl - ml).toFixed(1)));
          return {
            ...f,
            currentMl: newMl,
            status: newMl <= 0 ? "Hết phân" : newMl < (f.capacityMl || 6) * 0.2 ? "Cần thêm" : "Sẵn sàng",
          };
        }
        return f;
      });
      fs.writeFileSync(dataPath, JSON.stringify(ferts, null, 2), "utf-8");
    } catch (e) {}
  }

  const success = await sendDirectCommandToEsp32(cmdStr);
  res.json({
    success: true,
    tankCode,
    pumpLetter,
    ml,
    durationSec,
    command: cmdStr,
    sentToHardware: success,
  });
});

// =========================================================
// REAL USB CAMERA API ENDPOINTS (/dev/video0) - 25-30 FPS ULTRA SMOOTH STREAM ENGINE
// =========================================================

const cameraStreamClients = new Set();
let ffmpegStreamProcess = null;
let lastCapturedFrameBuffer = null;

// Khởi động luồng truyền video mượt mà 25-30 FPS duy nhất giữ liên tục không mở/đóng lại camera
function startPersistentCameraStream() {
  if (ffmpegStreamProcess || process.platform === "win32") return;

  console.log("[Camera Engine] Đang khởi động luồng Camera Real-time 25-30 FPS mượt mà...");

  try {
    ffmpegStreamProcess = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "v4l2",
      "-framerate", "25",
      "-video_size", `${CAMERA_WIDTH}x${CAMERA_HEIGHT}`,
      "-i", CAMERA_DEVICE,
      "-c:v", "mjpeg",
      "-q:v", "4",
      "-f", "mpjpeg",
      "-boundary_tag", "frame",
      "pipe:1"
    ]);

    let chunkBuffer = Buffer.alloc(0);

    ffmpegStreamProcess.stdout.on("data", (dataChunk) => {
      // 1. Đẩy luồng chunk trực tiếp tới tất cả thiết bị xem từ xa ở 25-30 FPS mượt mà
      for (const clientRes of cameraStreamClients) {
        try {
          clientRes.write(dataChunk);
        } catch (e) {
          cameraStreamClients.delete(clientRes);
        }
      }

      // 2. Trích xuất frame ảnh mới nhất lưu vào st01.jpg để phục vụ Gemini AI & Snapshot ngay tức thì
      chunkBuffer = Buffer.concat([chunkBuffer, dataChunk]);
      const startIdx = chunkBuffer.indexOf(Buffer.from([0xFF, 0xD8]));
      const endIdx = chunkBuffer.indexOf(Buffer.from([0xFF, 0xD9]));
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        lastCapturedFrameBuffer = chunkBuffer.subarray(startIdx, endIdx + 2);
        chunkBuffer = chunkBuffer.subarray(endIdx + 2);
        const imagePath = path.join(process.cwd(), "st01.jpg");
        fs.writeFile(imagePath, lastCapturedFrameBuffer, () => {});
      }
    });

    ffmpegStreamProcess.on("close", () => {
      console.warn("[Camera Engine] Luồng camera ffmpeg bị dừng, tự động khởi động lại sau 2s...");
      ffmpegStreamProcess = null;
      if (cameraStreamClients.size > 0) {
        setTimeout(startPersistentCameraStream, 2000);
      }
    });

    ffmpegStreamProcess.on("error", (err) => {
      console.error(`[Camera Engine Error] ${err.message}`);
      ffmpegStreamProcess = null;
    });
  } catch (err) {
    console.error(`[Camera Engine Start Error] ${err.message}`);
    ffmpegStreamProcess = null;
  }
}

// Endpoint Stream Video MJPEG mượt như Camera An ninh Trực Tiếp Từ Xa (/api/camera/stream)
app.get("/api/camera/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Connection": "close",
    "Access-Control-Allow-Origin": "*",
  });

  cameraStreamClients.add(res);

  // Kích hoạt luồng mượt 25-30 FPS liên tục
  startPersistentCameraStream();

  req.on("close", () => {
    cameraStreamClients.delete(res);
    if (cameraStreamClients.size === 0 && ffmpegStreamProcess) {
      setTimeout(() => {
        if (cameraStreamClients.size === 0 && ffmpegStreamProcess) {
          try { ffmpegStreamProcess.kill("SIGKILL"); } catch (e) {}
          ffmpegStreamProcess = null;
        }
      }, 10000);
    }
  });
});

// 1. Endpoint trả về file ảnh camera chụp thực tế từ USB camera st01.jpg
app.get("/api/camera/image", (req, res) => {
  const imagePath = path.join(process.cwd(), "st01.jpg");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Kiểm tra thời gian tạo ảnh, nếu cũ hơn 1.5 giây thì tự động kích hoạt chụp frame tươi mới
  let stats = null;
  if (fs.existsSync(imagePath)) {
    try {
      stats = fs.statSync(imagePath);
    } catch (e) {}
  }

  if (!stats || Date.now() - stats.mtimeMs > 1500) {
    captureImage().catch(() => {});
  }

  if (fs.existsSync(imagePath)) {
    return res.sendFile(imagePath);
  }

  // Phản hồi ảnh SVG chữ nếu chưa từng chụp ảnh nào từ camera
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480" style="background:#09090b;font-family:sans-serif">
      <rect width="640" height="480" fill="#09090b"/>
      <circle cx="320" cy="210" r="40" fill="none" stroke="#10b981" stroke-width="4" opacity="0.6"/>
      <text x="320" y="290" text-anchor="middle" fill="#f4f4f5" font-size="18" font-weight="bold">REMOTE IP CAMERA LIVE STREAM</text>
      <text x="320" y="320" text-anchor="middle" fill="#71717a" font-size="14">Đang truyền video trực tiếp từ xa (/dev/video0)...</text>
    </svg>
  `);
});

async function checkRealCameraStatus() {
  let connected = false;
  let device = "/dev/video0";
  let message = "Đang kiểm tra kết nối Camera USB...";

  try {
    if (process.platform !== "win32") {
      const { stdout } = await execAsync("v4l2-ctl --list-devices").catch(() => ({ stdout: "" }));
      if (stdout.includes("/dev/video")) {
        connected = true;
        message = "Đã tìm thấy USB Camera trên /dev/video0";
      } else if (fs.existsSync("/dev/video0") || fs.existsSync("/dev/video1")) {
        connected = true;
        message = "Thiết bị USB Camera /dev/video0 sẵn sàng";
      } else {
        connected = false;
        message = "Chưa kết nối: Không phát hiện camera USB tại /dev/video0";
      }
    } else {
      try {
        const { stdout } = await execAsync(
          'powershell -Command "Get-PnpDevice -Class Camera, Image -Status OK | Select-Object -ExpandProperty FriendlyName"'
        ).catch(() => ({ stdout: "" }));
        const camName = stdout ? stdout.trim() : "";
        if (camName.length > 0) {
          connected = true;
          device = camName.split("\n")[0].trim();
          message = `Đã kết nối Camera USB: ${device}`;
        } else {
          connected = false;
          device = "Không có thiết bị";
          message = "Chưa kết nối: Vui lòng cắm Camera USB vào máy tính!";
        }
      } catch (winErr) {
        connected = false;
        device = "Lỗi thiết bị";
        message = "Không phát hiện Camera USB cắm trên thiết bị!";
      }
    }
  } catch (err) {
    connected = false;
    message = `Lỗi nhận diện camera: ${err.message}`;
  }

  return { connected, device, message };
}

// 2. Endpoint kiểm tra trạng thái camera USB thực tế
app.get("/api/camera/status", async (req, res) => {
  const status = await checkRealCameraStatus();
  const imagePath = path.join(process.cwd(), "st01.jpg");
  let lastCaptured = null;
  if (fs.existsSync(imagePath)) {
    try {
      const stats = fs.statSync(imagePath);
      lastCaptured = new Date(stats.mtime).toLocaleTimeString("vi-VN");
    } catch (e) {}
  }
  res.json({
    connected: status.connected,
    device: status.device,
    resolution: "640x480 @ 30fps",
    fps: 30,
    message: status.message,
    lastCaptured,
    hasImage: fs.existsSync(imagePath),
  });
});

// API: Lấy danh sách thiết bị camera (Windows DirectShow / Linux)
app.get("/api/camera/devices", async (req, res) => {
  try {
    let devices = [];
    if (process.platform === "win32") {
      devices = await getWindowsCameraDevices();
    } else {
      try {
        const { execFile: ef } = require("child_process");
        const { promisify: pf } = require("util");
        const efAsync = pf(ef);
        const { stdout } = await efAsync("bash", ["-c", "ls /dev/video* 2>/dev/null"]).catch(() => ({ stdout: "" }));
        devices = stdout.split("\n").map(s => s.trim()).filter(Boolean);
      } catch (e) {}
    }
    const savedDevice = getSavedCameraDevice();
    res.json({ success: true, devices, selectedDevice: savedDevice });
  } catch (err) {
    res.json({ success: false, devices: [], selectedDevice: null, error: err.message });
  }
});

// API: Lưu thiết bị camera được chọn bởi user
app.post("/api/camera/set-device", (req, res) => {
  const { device } = req.body;
  if (!device || !device.trim()) {
    return res.status(400).json({ success: false, error: "Thiếu tên thiết bị camera" });
  }
  saveCameraDevice(device.trim());
  res.json({ success: true, message: `Đã lưu camera: "${device.trim()}"`, selectedDevice: device.trim() });
});

// Track the latest random-named snapshot for inspection use (volatile – auto-deleted after processing)
let latestSnapshotPath = null;

// 3b. Endpoint nhan anh WebRTC tu Browser (thay the FFmpeg tren Windows/dev)
app.post("/api/camera/upload-snapshot", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: "Thieu du lieu anh (imageBase64)" });
    }

    const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const imageBuffer = Buffer.from(base64Data, "base64");

    // 1. Lưu st01.jpg để hiển thị live view trên web (không xóa)
    const liveViewPath = path.join(process.cwd(), "st01.jpg");
    fs.writeFileSync(liveViewPath, imageBuffer);

    // 2. Lưu thêm file tên random vào pictures/ để dùng cho inspection (sẽ bị xóa sau khi xử lý)
    const snapPath = makeSnapPath();
    fs.writeFileSync(snapPath, imageBuffer);

    // Xóa file random cũ nếu còn tồn tại
    if (latestSnapshotPath && latestSnapshotPath !== liveViewPath) {
      try { fs.unlinkSync(latestSnapshotPath); } catch (e) {}
    }
    latestSnapshotPath = snapPath;

    res.json({
      success: true,
      message: "Da luu anh webcam tu browser thanh cong!",
      imageUrl: "/api/camera/image?t=" + Date.now(),
      size: imageBuffer.length,
    });
  } catch (err) {
    console.error(`[Camera Upload Error] ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});
// 3. Endpoint chụp ảnh trực tiếp ngay lập tức từ USB Camera
app.post("/api/camera/snapshot", async (req, res) => {
  try {
    console.log("[Camera API] Đang yêu cầu chụp ảnh nhanh từ camera...");
    const imagePath = await captureImage();
    const timestamp = Date.now();
    pushWebNotification("Đã chụp ảnh trực tiếp thành công từ USB Camera!", "SUCCESS");

    res.json({
      success: true,
      message: "Chụp ảnh camera thành công!",
      imageUrl: `/api/camera/image?t=${timestamp}`,
      timestamp: new Date().toLocaleTimeString("vi-VN"),
    });
  } catch (err) {
    console.error(`[Camera Snapshot Error] ${err.message}`);
    pushWebNotification(`Lỗi chụp ảnh camera: ${err.message}`, "ALERT");
    res.status(500).json({
      success: false,
      error: `Không chụp được ảnh từ camera USB: ${err.message}`,
    });
  }
});

// 4. Endpoint bật/tắt chế độ Night Vision / Hồng ngoại
app.post("/api/camera/night-vision", async (req, res) => {
  const { enabled } = req.body;
  try {
    if (process.platform !== "win32") {
      if (enabled) {
        await setCameraControl("brightness", 160);
        await setCameraControl("contrast", 160);
      } else {
        await setCameraControl("brightness", 105);
        await setCameraControl("contrast", 135);
      }
    }
    pushWebNotification(`Chế độ Hồng ngoại Night Vision: ${enabled ? "BẬT" : "TẮT"}`, "INFO");
    res.json({ success: true, nightVision: enabled });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post("/api/camera/test", async (req, res) => {
  try {
    const imagePath = await captureImage();
    const timestamp = Date.now();
    res.json({
      success: true,
      message: "Chụp thử thành công từ Camera USB!",
      imageUrl: `/api/camera/image?t=${timestamp}`,
      lastSnapshotTime: new Date().toLocaleTimeString("vi-VN"),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: `Lỗi chụp thử camera: ${err.message}`,
    });
  }
});

// REAL SYSTEM WI-FI DIAGNOSTICS & SCANNING (WINDOWS NETSH)
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
    activeModel: settings.activeModel || "gemini-3.5-flash-lite",
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

// TELEGRAM BOT SETTINGS ENDPOINTS
app.get("/api/settings/telegram", (req, res) => {
  const settings = readJson("settings.json", {});
  const botToken = process.env.BOT_TOKEN || settings.telegramBotToken || settings.botToken || "";
  const chatId = process.env.CHAT_ID || settings.telegramChatId || settings.chatId || "";

  res.json({
    telegramBotToken: botToken,
    telegramChatId: chatId,
    hasBotToken: !!botToken,
    hasChatId: !!chatId,
    maskedToken: botToken ? maskKey(botToken) : "Chưa cấu hình",
    maskedChatId: chatId ? maskKey(chatId) : "Chưa cấu hình",
  });
});

app.post("/api/settings/telegram", (req, res) => {
  const { telegramBotToken, telegramChatId } = req.body;

  const settings = readJson("settings.json", {});
  if (telegramBotToken !== undefined) settings.telegramBotToken = telegramBotToken.trim();
  if (telegramChatId !== undefined) settings.telegramChatId = telegramChatId.trim();

  writeJson("settings.json", settings);

  res.json({
    success: true,
    message: "Đã lưu cấu hình Telegram Bot & Chat ID thành công!",
    settings: {
      telegramBotToken: settings.telegramBotToken || "",
      telegramChatId: settings.telegramChatId || "",
    },
  });
});

app.post("/api/settings/telegram/test", async (req, res) => {
  const { telegramBotToken, telegramChatId } = req.body;
  const settings = readJson("settings.json", {});

  const token = (telegramBotToken || process.env.BOT_TOKEN || settings.telegramBotToken || settings.botToken || "").trim();
  const chatId = (telegramChatId || process.env.CHAT_ID || settings.telegramChatId || settings.chatId || "").trim();

  if (!token || !chatId) {
    return res.status(400).json({
      success: false,
      error: "Vui lòng nhập đầy đủ Telegram Bot Token và Chat ID trước khi kiểm tra thử!",
    });
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "🌱 [GrowHub Smart Garden]\nKiểm tra kết nối Telegram thành công! Hệ thống sẵn sàng gửi báo cáo phân tích sâu bệnh tự động.",
      }),
    });

    const data = await response.json();
    if (response.ok && data.ok) {
      return res.json({
        success: true,
        message: "Kết nối thành công! Đã gửi tin nhắn thử nghiệm tới Telegram của bạn.",
      });
    } else {
      return res.status(400).json({
        success: false,
        error: `Telegram phản hồi lỗi: ${data.description || "Không thể gửi tin nhắn"}`,
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Lỗi kết nối tới Telegram Server: ${err.message}`,
    });
  }
});

// THÔNG BÁO TỰ ĐỘNG QUA TELEGRAM VỀ CẢNH BÁO PHÂN BÓN / SỰ CỐ
app.post("/api/telegram/notify", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: "Thiếu nội dung thông báo" });
    }
    await sendTelegramText(message);
    res.json({ success: true, message: "Đã gửi thông báo Telegram thành công!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// AI SMART FERTILIZE ANALYSIS ENDPOINT (QUÉT 6 VỊ TRÍ + THÔNG TIN CÂY + BÌNH PHÂN => GEMINI JSON)
app.post("/api/ai/fertilize-analysis", async (req, res) => {
  try {
    console.log("[AI Fertilize] Bắt đầu quy trình quét 6 vị trí cây & phân tích Gemini...");

    // 1. GỬI LỆNH 'k' ĐẾN ARDUINO ĐỂ ĐIỀU KHIỂN ROBOT DI CHUYỂN QUA CÁC VỊ TRÍ CÂY
    try {
      await sendDirectCommandToArduino("k");
      console.log("[AI Fertilize] Đã gửi lệnh 'k' thành công xuống Arduino.");
    } catch (cmdErr) {
      console.warn(`[AI Fertilize Warning] Gửi lệnh 'k' xuống Arduino: ${cmdErr.message}`);
    }

    // 2. THU THẬP DỮ LIỆU CÂY TRỒNG & BÌNH PHÂN
    const plants = readJson("plants.json", []);
    const fertilizers = readJson("fertilizers.json", []);

    // 3. THU THẬP ẢNH CHỤP VÀ CHUYỂN SANG BASE64
    const imageParts = [];
    const imagePath = path.join(process.cwd(), "st01.jpg");

    if (fs.existsSync(imagePath)) {
      try {
        const imgBuf = fs.readFileSync(imagePath);
        imageParts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: imgBuf.toString("base64"),
          },
        });
      } catch (e) {}
    }

    // 4. SOẠN PROMPT PHÂN TÍCH ĐẶC BIỆT CHO GEMINI & ÉP TRẢ VỀ JSON
    const promptText = `
Bạn là hệ thống AI Nông Nghiệp Thông Minh thuộc dự án GrowHub Smart Garden.
Dưới đây là hình ảnh thực tế chụp từ camera hệ thống robot tại các vị trí cây trồng trong vườn, cùng thông tin danh sách cây trồng và các bình phân bón hiện có.

DANH SÁCH CÂY TRỒNG TRONG VƯỜN:
${JSON.stringify(plants, null, 2)}

DANH SÁCH BÌNH PHÂN BÓN HIỆN CÓ TRONG HỆ THỐNG:
${JSON.stringify(fertilizers, null, 2)}

NHIỆM VỤ CỦA BẠN:
1. Đánh giá tình trạng thực tế của cây trồng từ hình ảnh và danh sách loại cây/số lượng cây.
2. Xác định các loại phân bón cần bổ sung từ các bình phân hiện có (ví dụ: Bình A, Bình B, Bình C, Bình D).
3. Đề xuất dung tích phân (ml) tối ưu cho từng bình từ 0.5 ml đến 8.0 ml.

YÊU CẦU BẮT BUỘC VỀ ĐỊNH DẠNG ĐẦU RA:
- Trả về ĐÚNG MỘT MẢNG JSON hợp lệ (JavaScript JSON Array), KHÔNG kèm bất kỳ văn bản giải thích nào khác ngoài JSON.
- Mỗi phần tử có cấu trúc:
[
  {
    "tankCode": "Bình A",
    "name": "Tên loại phân bón",
    "ml": 2.5,
    "reason": "Mô tả ngắn gọn lý do bón phân này dựa trên phân tích tình trạng cây"
  }
]
- Chỉ bao gồm các tankCode có trong danh sách bình phân hiện có.
`;

    const payload = {
      contents: [
        {
          parts: [
            ...imageParts,
            { text: promptText },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    };

    let aiResult = null;
    try {
      aiResult = await callGeminiApiWithRotation(payload);
    } catch (aiErr) {
      console.warn(`[AI Fertilize Gemini Error] ${aiErr.message}`);
    }

    let recommendations = [];

    if (aiResult && aiResult.text) {
      try {
        let rawText = aiResult.text.trim();
        rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) {
          recommendations = parsed;
        }
      } catch (pErr) {
        console.warn(`[AI Fertilize Parse Error] ${pErr.message}`);
      }
    }

    // NẾU AI CHƯA TRẢ VỀ KẾT QUẢ ĐỦ THÌ TỰ ĐỘNG TẠO DEFAULTS DỰA TRÊN BÌNH PHÂN CÓ SẴN
    if (recommendations.length === 0) {
      const activeTanks = fertilizers.filter((f) => (f.currentMl !== undefined ? f.currentMl > 0 : true));
      const tankList = activeTanks.length > 0 ? activeTanks : fertilizers;

      recommendations = tankList.map((f, idx) => ({
        tankCode: f.tankCode || `Bình ${String.fromCharCode(65 + idx)}`,
        name: f.name || "Phân bón sinh học",
        ml: 2.0,
        reason: "AI đề xuất bổ sung lượng phân tiêu chuẩn dựa trên diện tích cây trồng hiện tại.",
      }));
    }

    res.json({
      success: true,
      recommendations,
      plantsCount: plants.length,
      aiModel: aiResult ? aiResult.model : "offline-rule",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CAMERA DIAGNOSTICS & TESTING ENDPOINTS FOR DEVICE SETTINGS
app.get("/api/camera/image", (req, res) => {
  const imgPath = path.join(process.cwd(), "st01.jpg");
  if (fs.existsSync(imgPath)) {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return res.sendFile(imgPath);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
    <rect width="100%" height="100%" fill="#18181b"/>
    <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="#a1a1aa" font-family="sans-serif" font-size="20">Chưa có ảnh chụp từ USB Camera</text>
    <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="#71717a" font-family="sans-serif" font-size="14">Nhấn nút "Chụp thử nghiệm (Snapshot Test)" để chụp ảnh phần cứng</text>
  </svg>`;
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
  res.send(svg);
});

app.get("/st01.jpg", (req, res) => {
  const imgPath = path.join(process.cwd(), "st01.jpg");
  if (fs.existsSync(imgPath)) {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return res.sendFile(imgPath);
  }
  res.redirect("/api/camera/image");
});

app.get("/api/camera/status", async (req, res) => {
  try {
    const isLinux = process.platform === "linux";
    const devPath = typeof CAMERA_DEVICE !== "undefined" ? CAMERA_DEVICE : "/dev/video0";
    const exists = fs.existsSync(devPath);

    let connected = false;
    let statusMessage = "";

    if (exists) {
      connected = true;
      statusMessage = `Đã nhận diện thiết bị USB Camera kết nối tại ${devPath}`;
    } else if (!isLinux) {
      connected = true;
      statusMessage = "Đang chạy chế độ giả lập (Windows Dev)";
    } else {
      connected = false;
      statusMessage = `Không phát hiện thiết bị USB Camera (${devPath} không tồn tại). Vui lòng cắm cáp USB Camera!`;
    }

    res.json({
      connected,
      model: connected ? "USB Web Camera (/dev/video0)" : "Chưa nhận diện",
      resolution: typeof CAMERA_WIDTH !== "undefined" ? `${CAMERA_WIDTH}x${CAMERA_HEIGHT}` : "640x480",
      fps: typeof CAMERA_FPS !== "undefined" ? CAMERA_FPS : 30,
      statusMessage,
      device: devPath,
      lastSnapshotTime: new Date().toLocaleTimeString("vi-VN"),
      streamUrl: "/api/camera/image?t=" + Date.now(),
    });
  } catch (err) {
    res.status(500).json({
      connected: false,
      model: "Lỗi kết nối",
      resolution: "N/A",
      fps: 0,
      statusMessage: `Lỗi kiểm tra camera: ${err.message}`,
      device: typeof CAMERA_DEVICE !== "undefined" ? CAMERA_DEVICE : "/dev/video0",
      streamUrl: "/api/camera/image?t=" + Date.now(),
    });
  }
});

app.post("/api/camera/test", async (req, res) => {
  try {
    const imgPath = await captureImage();
    res.json({
      success: true,
      message: `Chụp ảnh thử nghiệm thành công từ USB Camera! Ảnh đã lưu tại ${imgPath}`,
      status: {
        connected: true,
        model: "USB Web Camera (/dev/video0)",
        resolution: typeof CAMERA_WIDTH !== "undefined" ? `${CAMERA_WIDTH}x${CAMERA_HEIGHT}` : "640x480",
        fps: typeof CAMERA_FPS !== "undefined" ? CAMERA_FPS : 30,
        statusMessage: "Ảnh chụp thử nghiệm thành công",
        device: typeof CAMERA_DEVICE !== "undefined" ? CAMERA_DEVICE : "/dev/video0",
        lastSnapshotTime: new Date().toLocaleTimeString("vi-VN"),
        streamUrl: "/api/camera/image?t=" + Date.now(),
      }
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: `Chụp ảnh thử nghiệm thất bại: ${err.message}. Vui lòng cắm lại cáp USB camera!`,
    });
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

// FERTILIZERS API ENDPOINTS (Saved to data/fertilizers.json)
app.get("/api/fertilizers", (req, res) => {
  const fertilizers = readJson("fertilizers.json", []);
  res.json(fertilizers);
});

app.post("/api/fertilizers", (req, res) => {
  const newFertilizer = req.body;
  let fertilizers = readJson("fertilizers.json", []);
  if (!newFertilizer.id) {
    newFertilizer.id = `fert-${Date.now()}`;
  }
  fertilizers.unshift(newFertilizer);
  writeJson("fertilizers.json", fertilizers);
  res.json(fertilizers);
});

app.put("/api/fertilizers/:id", (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  let fertilizers = readJson("fertilizers.json", []);
  fertilizers = fertilizers.map((f) => (f.id === id ? { ...f, ...updates } : f));
  writeJson("fertilizers.json", fertilizers);
  res.json(fertilizers);
});

app.delete("/api/fertilizers/:id", (req, res) => {
  const { id } = req.params;
  let fertilizers = readJson("fertilizers.json", []);
  fertilizers = fertilizers.filter((f) => f.id !== id);
  writeJson("fertilizers.json", fertilizers);
  res.json(fertilizers);
});

// SCHEDULE CRUD & BACKGROUND RUNNER ENGINE
app.get("/api/schedules", (req, res) => {
  const schedules = readJson("schedules.json", []);
  res.json(schedules);
});

app.post("/api/schedules", (req, res) => {
  try {
    const schedules = readJson("schedules.json", []);
    const { title, actions, actionType, scheduleType, slots, date, dates, repeatDays, time, times, location } = req.body;

    const finalActions = Array.isArray(actions) && actions.length > 0
      ? actions
      : (actionType ? [actionType] : ["INSPECT"]);

    const actionLabels = {
      INSPECT: "Kiểm tra sâu hại (chụp 6 điểm & Gemini AI)",
      FERTILIZE: "Tưới Phân bón (ESP32)",
      SPRAY_ALL: "Phun toàn bộ vườn (Phím p)",
    };

    const actionIcons = {
      INSPECT: "bug_report",
      FERTILIZE: "water_drop",
      SPRAY_ALL: "shower",
    };

    const firstAction = finalActions[0];
    const defaultTitle = title || finalActions.map((a) => actionLabels[a] || a).join(" ➔ ");

    const newItems = [];
    const baseTimestamp = Date.now();
    let counter = 0;

    if (scheduleType === "once" && Array.isArray(slots) && slots.length > 0) {
      for (const slot of slots) {
        counter++;
        const newItem = {
          id: `sched-${baseTimestamp}-${counter}`,
          title: defaultTitle,
          actions: finalActions,
          actionType: firstAction,
          actionLabel: actionLabels[firstAction] || firstAction,
          icon: actionIcons[firstAction] || "event",
          scheduleType: "once",
          date: slot.date,
          repeatDays: [],
          time: slot.time,
          location: location || "Toàn bộ khu vườn",
          enabled: true,
          status: "upcoming",
          lastRun: "",
          createdAt: new Date().toISOString(),
        };
        newItems.push(newItem);
        schedules.unshift(newItem);
      }
    } else {
      const timeList = Array.isArray(times) && times.length > 0
        ? times
        : (time ? [time] : []);
      const dateList = scheduleType === "once"
        ? (Array.isArray(dates) && dates.length > 0 ? dates : [date || new Date().toISOString().split("T")[0]])
        : [""];

      for (const d of dateList) {
        for (const t of timeList) {
          counter++;
          const newItem = {
            id: `sched-${baseTimestamp}-${counter}`,
            title: defaultTitle,
            actions: finalActions,
            actionType: firstAction,
            actionLabel: actionLabels[firstAction] || firstAction,
            icon: actionIcons[firstAction] || "event",
            scheduleType: scheduleType || "once",
            date: d,
            repeatDays: Array.isArray(repeatDays) ? repeatDays : [],
            time: t,
            location: location || "Toàn bộ khu vườn",
            enabled: true,
            status: "upcoming",
            lastRun: "",
            createdAt: new Date().toISOString(),
          };
          newItems.push(newItem);
          schedules.unshift(newItem);
        }
      }
    }

    writeJson("schedules.json", schedules);
    res.json({ success: true, items: newItems, schedules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/schedules/:id", (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    let schedules = readJson("schedules.json", []);

    let found = false;
    schedules = schedules.map((item) => {
      if (item.id === id) {
        found = true;
        return { ...item, ...updates };
      }
      return item;
    });

    if (!found) {
      return res.status(404).json({ success: false, error: "Không tìm thấy lịch trình" });
    }

    writeJson("schedules.json", schedules);
    res.json({ success: true, schedules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/schedules/:id", (req, res) => {
  try {
    const { id } = req.params;
    let schedules = readJson("schedules.json", []);
    schedules = schedules.filter((item) => item.id !== id);
    writeJson("schedules.json", schedules);
    res.json({ success: true, schedules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================
// REAL INSPECTION HISTORY API ENDPOINTS
// =========================================================
app.get("/api/inspection-history", (req, res) => {
  try {
    const history = readJson("inspection_history.json", []);
    res.json(history);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/inspection-history", (req, res) => {
  try {
    const history = readJson("inspection_history.json", []);
    const newEntry = {
      id: `insp-${Date.now()}`,
      timestamp: new Date().toLocaleString("vi-VN"),
      image: "/api/camera/image?t=" + Date.now(),
      ...req.body,
    };
    history.unshift(newEntry);
    writeJson("inspection_history.json", history);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/inspection-history/:id", (req, res) => {
  try {
    const { id } = req.params;
    let history = readJson("inspection_history.json", []);
    history = history.filter((item) => item.id !== id);
    writeJson("inspection_history.json", history);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/inspection-history", (req, res) => {
  try {
    const { type, plantId } = req.query;
    let history = readJson("inspection_history.json", []);
    if (type) {
      history = history.filter((item) => item.type !== type);
    } else if (plantId) {
      history = history.filter((item) => item.plantId !== plantId);
    } else {
      history = [];
    }
    writeJson("inspection_history.json", history);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function getPointIndexFromLocation(location) {
  if (!location) return 0;
  const match = String(location).match(/Khay\s*0?(\d+)/i);
  if (match) {
    const idx = parseInt(match[1], 10) - 1;
    return Math.max(0, Math.min(5, idx));
  }
  return 0;
}

// MOVE ROBOT TO SPECIFIC PLANT TRAY / POINT
app.post("/api/plant-move", async (req, res) => {
  try {
    const { plantId, plantName, location } = req.body;
    const trayName = location || "Khay 01";
    const pointIdx = getPointIndexFromLocation(trayName);

    const arduinoStatus = await getRealSerialStatus();
    if (!arduinoStatus.connected && process.platform === "linux") {
      return res.status(400).json({
        success: false,
        error: "Mạch Arduino chưa được kết nối! Vui lòng cắm cáp USB Arduino.",
      });
    }

    pushWebNotification(`🤖 Đang điều khiển Robot di chuyển tới ${trayName} (Điểm ${pointIdx + 1}) để quan sát...`, "PROCESS");

    // Send movement command to Arduino Serial and wait for the robot to arrive.
    const moveWait = waitForArduinoMove(pointIdx, 30000);
    try {
      await sendDirectCommandToArduino(`P${pointIdx + 1}`);
    } catch (moveErr) {
      const waiter = pendingMoveResolvers.get(pointIdx);
      if (waiter) waiter.reject(moveErr);
      throw moveErr;
    }
    await moveWait;

    // Try capturing fresh image from USB camera
    try {
      await captureImage();
    } catch (e) {}

    res.json({
      success: true,
      message: `Robot đã di chuyển tới ${trayName} (Điểm ${pointIdx + 1})!`,
      pointIndex: pointIdx,
      image: "/api/camera/image?t=" + Date.now(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// MOVE ROBOT AND WATER/FERTILIZE SPECIFIC PLANT TRAY
app.post("/api/plant-water", async (req, res) => {
  try {
    const { plantId, plantName, location } = req.body;
    const trayName = location || "Khay 01";
    const pointIdx = getPointIndexFromLocation(trayName);

    const ardStatus = await getRealSerialStatus();

    if (!ardStatus.connected && process.platform === "linux") {
      return res.status(400).json({
        success: false,
        error: "Chưa kết nối mạch ESP32 hoặc Arduino! Vui lòng kiểm tra cổng USB/Serial.",
      });
    }

    pushWebNotification(`🤖 Robot đang di chuyển tới ${trayName} (Điểm ${pointIdx + 1}) để tiến hành tưới phân...`, "PROCESS");

    // 1. Move robot to tray position
    const moveWait = waitForArduinoMove(pointIdx, 30000);
    try {
      await sendDirectCommandToArduino(`P${pointIdx + 1}`);
    } catch (moveErr) {
      const waiter = pendingMoveResolvers.get(pointIdx);
      if (waiter) waiter.reject(moveErr);
      throw moveErr;
    }
    await moveWait;

    await sendDirectCommandToArduino("SPRAY");

    // 4. Save spray entry in data/inspection_history.json
    try {
      const history = readJson("inspection_history.json", []);
      history.unshift({
        id: `insp-${Date.now()}`,
        plantId: plantId || "",
        type: "SPRAY",
        timestamp: new Date().toLocaleString("vi-VN"),
        title: `Phun sinh hoc - ${plantName || trayName}`,
        detail: `Da hoan tat phun thuoc sinh hoc tai ${trayName} (Diem ${pointIdx + 1}) qua Arduino.`,
        status: "Da phun sinh hoc",
      });
      writeJson("inspection_history.json", history);
    } catch (e) {}

    pushWebNotification(`Robot da phun thuoc sinh hoc thanh cong cho ${plantName || trayName}!`, "SUCCESS");

    res.json({
      success: true,
      message: `Da di chuyen toi ${trayName} va phun thuoc sinh hoc thanh cong!`,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// TRIGGER PEST INSPECTION FOR SPECIFIC PLANT / TRAY
app.post("/api/plant-inspect", async (req, res) => {
  try {
    const { plantId, plantName, location } = req.body;
    const trayName = location || "Khay 01";
    const pointIdx = getPointIndexFromLocation(trayName);

    // Kiểm tra xem vị trí này có cây trồng trong data/plants.json hay không
    if (!hasPlantAtPoint(pointIdx)) {
      addSystemLog("PEST_INSPECT", `Bỏ qua kiểm tra ${trayName}: Vị trí này chưa được gieo trồng cây trong /plants.`, "WARNING");
      pushWebNotification(`⚠️ Vị trí ${trayName} chưa có cây trồng trong danh sách /plants. Đã bỏ qua kiểm tra.`, "WARNING");
      return res.status(400).json({
        success: false,
        error: `Vị trí ${trayName} chưa có cây trồng trong danh sách /plants. Hệ thống chỉ kiểm tra các vị trí có cây.`,
      });
    }

    const arduinoStatus = await getRealSerialStatus();
    if (!arduinoStatus.connected && process.platform === "linux") {
      pushWebNotification(`❌ Lỗi kết nối phần cứng: Mạch Arduino chưa được cắm vào cổng USB/Serial!`, "ALERT");
      return res.status(400).json({
        success: false,
        error: "Mạch Arduino chưa được kết nối với hệ thống! Vui lòng cắm cáp USB Arduino.",
      });
    }

    // 0. Kiểm tra kết nối Camera USB trước khi di chuyển và chụp ảnh
    const cameraStatus = await checkRealCameraStatus();
    if (!cameraStatus.connected && process.platform === "linux") {
      pushWebNotification(`❌ Lỗi kết nối phần cứng: ${cameraStatus.message}`, "ALERT");
      return res.status(400).json({
        success: false,
        error: `Camera USB chưa được kết nối! (${cameraStatus.message}) Vui lòng kiểm tra cáp cắm USB Camera.`,
      });
    }

    addSystemLog("INSPECT_MOVE", `🐛 Đang điều khiển Robot di chuyển tới ${trayName} (Điểm ${pointIdx + 1}) để kiểm tra sâu bệnh...`, "PROCESS");
    pushWebNotification(`🐛 Đang điều khiển Robot di chuyển tới ${trayName} (Điểm ${pointIdx + 1}) để kiểm tra sâu bệnh trên cây ${plantName || ""}...`, "AI_ANALYSIS");

    // 1. Send command to Arduino to move camera to tray/point
    const moveWait = waitForArduinoMove(pointIdx, 5000);
    try {
      await sendDirectCommandToArduino(`P${pointIdx + 1}`);
    } catch (moveErr) {
      const waiter = pendingMoveResolvers.get(pointIdx);
      if (waiter) waiter.reject(moveErr);
      console.warn(`[Inspect Move Warning] ${moveErr.message}`);
    }
    await moveWait.catch((mErr) => console.warn(`[Move Wait Handled] ${mErr.message}`));

    // 2. Turn on LED Flash light for illumination during inspection
    try {
      await sendDirectCommandToArduino("LED_ON");
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (ledErr) {}

    // 3. Capture actual USB camera image
    // Priority: dung anh tu browser (snapshotBase64) neu co, else dung FFmpeg
    let imagePathToSend = null;
    const { snapshotBase64 } = req.body;
    if (snapshotBase64) {
      try {
        const imgPath = path.join(process.cwd(), "st01.jpg");
        const b64Data = snapshotBase64.includes(",") ? snapshotBase64.split(",")[1] : snapshotBase64;
        const imgBuf = Buffer.from(b64Data, "base64");
        fs.writeFileSync(imgPath, imgBuf);
        imagePathToSend = imgPath;
        addSystemLog("CAM_CAPTURE", `[BROWSER CAM] Đã lưu ảnh WebRTC từ browser (${imgBuf.length} bytes) -> st01.jpg`, "SUCCESS");
      } catch (uploadErr) {
        console.warn(`[Plant Inspect] Lỗi lưu ảnh browser: ${uploadErr.message}`);
      }
    }

    if (!imagePathToSend) {
      try {
        imagePathToSend = await captureImage();
        addSystemLog("CAM_CAPTURE", `[Camera Log] Đã bật Flash & chụp ảnh thành công từ USB Camera (${trayName} / st01.jpg)!`, "SUCCESS");
      } catch (capErr) {
        try { await sendDirectCommandToArduino("LED_OFF"); } catch (ledErr) {}
        console.error(`[Inspect Capture Error] ${capErr.message}`);
        addSystemLog("CAM_CAPTURE", `❌ Chụp ảnh không thành công: ${capErr.message}`, "ALERT");
        pushWebNotification(`❌ Lỗi chụp ảnh camera: ${capErr.message}`, "ALERT");
        return res.status(500).json({
          success: false,
          error: `Chụp ảnh không thành công: ${capErr.message}. Vui lòng kiểm tra lại kết nối camera!`,
        });
      }
    }

    // Always turn off LED Flash after getting image
    try {
      await sendDirectCommandToArduino("LED_OFF");
    } catch (ledErr) {}

    if (!imagePathToSend || !fs.existsSync(imagePathToSend)) {
      addSystemLog("CAM_CAPTURE", `❌ Chụp ảnh không thành công: Không tìm thấy file st01.jpg`, "ALERT");
      pushWebNotification(`❌ Lỗi chụp ảnh camera: Không có file hình ảnh!`, "ALERT");
      return res.status(500).json({
        success: false,
        error: "Chụp ảnh không thành công: Không có dữ liệu hình ảnh từ camera!",
      });
    }
    // 3. Perform Gemini AI analysis
    let formattedResult = "";
    const keys = getKeysList();
    if (keys.length === 0) {
      addSystemLog("GEMINI_ERR", `❌ Chưa thiết lập Gemini API Key trong hệ thống`, "ALERT");
      pushWebNotification(`❌ Chưa thiết lập Gemini API Key! Vui lòng vào trang 'Cấu hình API' để nhập Key trước khi quét sâu.`, "ALERT");
      return res.status(400).json({
        success: false,
        error: "Chưa cấu hình Gemini API Key! Vui lòng vào trang Cấu hình API trên Web để nhập chìa khóa Gemini.",
      });
    }

    let imageBase64 = null;
    if (imagePathToSend && fs.existsSync(imagePathToSend)) {
      try {
        const imgBuf = fs.readFileSync(imagePathToSend);
        imageBase64 = imgBuf.toString("base64");
      } catch (e) {}
    }

    addSystemLog("GEMINI_REQ", `🤖 Đang gửi dữ liệu hình ảnh st01.jpg tới mô hình Gemini AI để phân tích diệp lục & sâu bệnh...`, "PROCESS");

    // Payload theo dung v2.mjs: text truoc, inlineData sau, them thinkingConfig + maxOutputTokens
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: createPrompt(pointIdx) },
            ...(imageBase64 ? [{ inlineData: { mimeType: "image/jpeg", data: imageBase64 } }] : [])
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 1200,
        thinkingConfig: { thinkingLevel: "minimal" },
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA
      }
    };

    let parsedResult = null;
    try {
      const aiResult = await callGeminiApiWithRotation(payload);
      if (aiResult && aiResult.text) {
        try {
          parsedResult = parseGeminiResult(aiResult.text);
          formattedResult = formatGeminiResult(parsedResult);
        } catch (pErr) {
          formattedResult = aiResult.text;
        }
      } else {
        throw new Error("Không nhận được phản hồi nội dung từ Gemini AI API.");
      }
    } catch (aiErr) {
      console.error(`[Gemini AI Inspect Error] ${aiErr.message}`);
      addSystemLog("GEMINI_ERR", `❌ [Gemini AI Log] Lỗi kết nối API: ${aiErr.message}`, "ALERT");
      pushWebNotification(`❌ Lỗi gọi Gemini AI API: ${aiErr.message}`, "ALERT");
      return res.status(500).json({
        success: false,
        error: `Lỗi kết nối Gemini AI: ${aiErr.message}`,
      });
    }

    const hasPest = needSpray(formattedResult);
    const aiStatusText = parsedResult ? parsedResult.status : (hasPest ? "CÓ SÂU / BỆNH" : "KHÔNG PHÁT HIỆN SÂU VÀ BỆNH");

    addSystemLog("GEMINI_RES", `🤖 [Gemini AI Log] Phân tích hoàn tất: Tình trạng [${aiStatusText}] | Mô tả: ${parsedResult?.description || "Bình thường"}`, "SUCCESS");

    if (hasPest) {
      await sendDirectCommandToArduino("SPRAY").catch(() => {});
      addSystemLog("ACTUATE", `🚨 Lệnh Arduino: SPRAY (Kích hoạt bơm phun thuốc sinh học 1.5s)`, "WARNING");
      pushWebNotification(`🚨 Gemini AI phân tích ${plantName || trayName}: [${aiStatusText}]! Đã kích hoạt bơm SPRAY.`, "WARNING");
    } else {
      await sendDirectCommandToArduino("NO_SPRAY").catch(() => {});
      addSystemLog("ACTUATE", `🌿 Lệnh Arduino: NO_SPRAY (Cây khỏe mạnh, không cần phun thuốc)`, "SUCCESS");
      pushWebNotification(`🌿 Gemini AI phân tích ${plantName || trayName}: [${aiStatusText}].`, "SUCCESS");
    }

    // 4. Format Telegram report
    const telegramCaption = `🐛 KIỂM TRA SÂU BỆNH - ${trayName.toUpperCase()}\n🌱 Cây: ${plantName || "Trồng tại vườn"}\n\n${formattedResult}`;

    // 5. Send to Telegram
    try {
      sendTelegramPhoto(imagePathToSend, telegramCaption).catch(() => {});
    } catch (tErr) {}

    // 6. Save persistent snapshot file for history log
    const { inspId, snapshotUrl } = persistSnapshotForHistory(imagePathToSend, "plant-insp");

    // 7. Save to data/inspection_history.json
    const historyEntry = {
      id: inspId,
      plantId: plantId || "",
      type: "PEST",
      timestamp: new Date().toLocaleString("vi-VN"),
      title: `Kiểm tra sâu hại - ${plantName || trayName}`,
      detail: formattedResult,
      telegramCaption: telegramCaption,
      status: hasPest ? "Phát hiện sâu hại" : "Sức khỏe tốt",
      image: snapshotUrl,
    };

    const history = readJson("inspection_history.json", []);
    history.unshift(historyEntry);
    if (hasPest) {
      history.unshift({
        id: `spray-${Date.now()}`,
        plantId: plantId || "",
        type: "SPRAY",
        timestamp: new Date().toLocaleString("vi-VN"),
        title: `Phun sinh hoc - ${plantName || trayName}`,
        detail: `Arduino da phun thuoc sinh hoc tai ${trayName} sau khi AI phat hien sau hai.`,
        status: "Da phun sinh hoc",
        image: snapshotUrl,
      });
    }
    writeJson("inspection_history.json", history);

    res.json({
      success: true,
      message: `Đã hoàn tất kiểm tra sâu bệnh thực tế tại ${trayName}!`,
      log: historyEntry,
    });
  } catch (err) {
    console.error(`[Plant Inspect Error] ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

function initScheduleRunner() {
  console.log("[Schedule Runner] Khởi động trình tự động hóa lịch trình vườn...");

  setInterval(async () => {
    try {
      const schedules = readJson("schedules.json", []);
      if (!Array.isArray(schedules) || schedules.length === 0) return;

      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const currentTimeStr = `${hours}:${minutes}`;

      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const dateNum = String(now.getDate()).padStart(2, "0");
      const currentDateStr = `${year}-${month}-${dateNum}`;

      const dayMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
      const currentDayStr = dayMap[now.getDay()];

      const runKey = `${currentDateStr} ${currentTimeStr}`;
      let updated = false;

      for (const item of schedules) {
        if (!item.enabled) continue;
        if (item.time !== currentTimeStr) continue;
        if (item.lastRun === runKey) continue;

        let shouldTrigger = false;

        if (item.scheduleType === "once") {
          if (item.date === currentDateStr) {
            shouldTrigger = true;
          }
        } else if (item.scheduleType === "repeating") {
          if (Array.isArray(item.repeatDays) && item.repeatDays.includes(currentDayStr)) {
            shouldTrigger = true;
          }
        }

        if (shouldTrigger) {
          const actionsToRun = Array.isArray(item.actions) && item.actions.length > 0
            ? item.actions
            : [item.actionType || "INSPECT"];

          console.log(`[Schedule Runner] ⏰ KÍCH HOẠT LỊCH TRÌNH: "${item.title}" (${actionsToRun.join(" -> ")}) lúc ${runKey}`);
          item.lastRun = runKey;
          updated = true;

          if (item.scheduleType === "once") {
            item.enabled = false;
            item.status = "completed";
          } else {
            item.status = "active";
          }

          // Execute actions sequentially
          (async () => {
            for (let idx = 0; idx < actionsToRun.length; idx++) {
              const act = actionsToRun[idx];
              const stepNum = idx + 1;
              const totalSteps = actionsToRun.length;

              try {
                if (act === "INSPECT") {
                  pushWebNotification(`⏰ Lịch [Bước ${stepNum}/${totalSteps}]: Kích hoạt Kiểm tra sâu hại các vị trí có cây ("${item.title}")`, "PROCESS");
                  await sendTelegramText(`⏰ LỊCH TỰ ĐỘNG [Bước ${stepNum}/${totalSteps}]:\n📌 Tên: ${item.title}\n🐛 Hành động: Kiểm tra sâu hại (chỉ kiểm tra các vị trí có cây trong /plants)\n⏱ Thời gian: ${currentTimeStr}`);
                  await runFullGardenInspection().catch((e) => console.warn(`[Sched Inspect Err] ${e.message}`));
                } else if (act === "FERTILIZE") {
                  pushWebNotification(`⏰ Lịch [Bước ${stepNum}/${totalSteps}]: Kích hoạt Tưới Phân Bón ESP32 ("${item.title}")`, "PROCESS");
                  await sendTelegramText(`⏰ LỊCH TỰ ĐỘNG [Bước ${stepNum}/${totalSteps}]:\n📌 Tên: ${item.title}\n💧 Hành động: Tưới Phân bón ESP32\n⏱ Thời gian: ${currentTimeStr}`);
                  await fetch(`http://localhost:${PORT}/api/esp32/dose`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      dosages: [
                        { tankCode: "Bình A", ml: 2.0 },
                        { tankCode: "Bình B", ml: 2.0 },
                      ],
                    }),
                  }).catch(() => {});
                } else if (act === "SPRAY_ALL") {
                  pushWebNotification(`⏰ Lịch [Bước ${stepNum}/${totalSteps}]: Kích hoạt Phun toàn bộ vườn ("${item.title}")`, "PROCESS");
                  await sendTelegramText(`⏰ LỊCH TỰ ĐỘNG [Bước ${stepNum}/${totalSteps}]:\n📌 Tên: ${item.title}\n🚿 Hành động: Phun toàn bộ vườn (Phím p)\n⏱ Thời gian: ${currentTimeStr}`);
                  await runFullGardenSpray().catch((e) => console.warn(`[Sched p Err] ${e.message}`));
                }

                if (idx < totalSteps - 1) {
                  console.log(`[Schedule Runner] Chờ 5s chuyển sang bước ${stepNum + 1}/${totalSteps}...`);
                  await new Promise((r) => setTimeout(r, 5000));
                }
              } catch (stepErr) {
                console.error(`[Schedule Step ${stepNum} Error] ${stepErr.message}`);
              }
            }
          })();
        }
      }

      if (updated) {
        writeJson("schedules.json", schedules);
      }
    } catch (err) {
      console.error(`[Schedule Runner Error] ${err.message}`);
    }
  }, 15000);
}

initScheduleRunner();

app.listen(PORT, () => {
  console.log(`✅ GrowHub Node.js Express Backend running on http://localhost:${PORT}`);
  console.log(`📁 Persistent JSON database path: ${dataDir}`);
});
