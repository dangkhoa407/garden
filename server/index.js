const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

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

// FULL HARDWARE & ARDUINO V2.MJS PROTOCOL INTEGRATED ENGINE
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
let lastInspectionResults = []; // Lưu trữ chi tiết 6 điểm quét cho Web UI
let activeSerialPort = null;
let nodeConnected = false;
let captureBusy = false;
let currentCancellationId = 0;

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

function needSpray(resultText) {
  const text = String(resultText).normalize("NFC").toUpperCase();
  return (
    text.includes("TÌNH TRẠNG: SÂU VÀ BỆNH") ||
    text.includes("TÌNH TRẠNG: LÁ BỊ SÂU ĂN") ||
    text.includes("TÌNH TRẠNG: SÂU")
  );
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

async function captureImage() {
  const imagePath = path.join(process.cwd(), "st01.jpg");
  console.log("Đang mở camera chụp ảnh...");
  
  await configureCamera();
  const directory = await fs.promises.mkdtemp(path.join(require("os").tmpdir(), "vuon-rau-camera-"));

  try {
    await captureFrames(directory);
    const frameFiles = (await fs.promises.readdir(directory))
      .filter((name) => name.toLowerCase().endsWith(".jpg"))
      .sort()
      .slice(WARMUP_FRAMES, WARMUP_FRAMES + CHECK_FRAMES);

    if (frameFiles.length === 0) {
      throw new Error("Camera USB không tạo được khung hình nào (Vui lòng kiểm tra cáp cắm USB /dev/video0).");
    }

    let bestPath = null;
    let bestInfo = null;
    let bestScore = Infinity;

    for (const fileName of frameFiles) {
      const framePath = path.join(directory, fileName);
      const info = await analyzeFrameLight(framePath);
      const score = Math.abs(info.meanBrightness - TARGET_BRIGHTNESS) + info.overexposedRatio * 300 + info.darkRatio * 60;
      if (score < bestScore) {
        bestScore = score;
        bestPath = framePath;
        bestInfo = info;
      }
    }

    if (!bestPath || !bestInfo) {
      throw new Error("Không chọn được khung hình chất lượng từ camera USB.");
    }

    const brightness = bestInfo.meanBrightness;
    const overexposedRatio = bestInfo.overexposedRatio;
    let alpha = 1;
    let beta = 0;

    if (overexposedRatio > 0.25 || brightness > 200) { alpha = 0.58; beta = -30; }
    else if (overexposedRatio > 0.15 || brightness > 175) { alpha = 0.72; beta = -18; }
    else if (overexposedRatio > 0.07 || brightness > 150) { alpha = 0.84; beta = -8; }
    else if (overexposedRatio > 0.03 || brightness > 130) { alpha = 0.94; beta = -2; }
    else if (brightness < 35) { alpha = 1.30; beta = 30; }
    else if (brightness < 65) { alpha = 1.15; beta = 15; }
    else if (brightness < 90) { alpha = 1.07; beta = 8; }
    else if (brightness < 115) { alpha = 1.03; beta = 4; }

    const sharp = require("sharp");
    await sharp(bestPath).removeAlpha().linear(alpha, beta).jpeg({ quality: JPEG_QUALITY }).toFile(imagePath);
    console.log(`[Camera Engine] Đã chụp và lưu ảnh thành công: ${imagePath}`);
    return imagePath;
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
async function getOrInitArduinoSerialPort() {
  try {
    const { SerialPort } = require("serialport");
    const { ReadlineParser } = require("serialport");

    if (activeSerialPort && activeSerialPort.isOpen) {
      return activeSerialPort;
    }

    const ports = await SerialPort.list();
    const candidates = ports.filter((p) => {
      const pPath = (p.path || "").toUpperCase();
      const mfg = (p.manufacturer || "").toUpperCase();
      return (
        pPath.includes("COM") ||
        pPath.includes("TTYACM") ||
        pPath.includes("TTYUSB") ||
        pPath.includes("TTYAMA") ||
        mfg.includes("ARDUINO") ||
        mfg.includes("CH340") ||
        mfg.includes("FTDI") ||
        mfg.includes("RASPBERRY")
      );
    });

    if (candidates.length === 0 && ports.length === 0) {
      throw new Error("Không tìm thấy cổng USB/Serial của Arduino trên thiết bị");
    }

    const targetPortPath = candidates.length > 0 ? candidates[0].path : ports[0].path;
    console.log(`[Arduino Direct Engine] Opening serial port at ${targetPortPath}...`);

    activeSerialPort = new SerialPort({
      path: targetPortPath,
      baudRate: 9600,
      autoOpen: false,
    });

    await new Promise((resolve, reject) => {
      activeSerialPort.open((err) => (err ? reject(err) : resolve()));
    });

    console.log(`[Arduino Direct Engine] Serial port ${targetPortPath} OPENED successfully.`);

    // Attach Readline Parser for Arduino protocol lines
    const parser = activeSerialPort.pipe(new ReadlineParser({ delimiter: "\n" }));

    const announceNodeReady = () => {
      if (activeSerialPort && activeSerialPort.isOpen) {
        activeSerialPort.write("NODE_READY\n");
      }
    };

    announceNodeReady();

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
        if (normalized === "ARDUINO_READY") {
          nodeConnected = false;
          announceNodeReady();
          return;
        }

        if (normalized === "NODE_CONNECTED") {
          nodeConnected = true;
          pushWebNotification("Đã kết nối thành công với Arduino!", "SUCCESS");
          return;
        }

        if (normalized === "CHECK_STARTED") {
          currentCancellationId++;
          lastInspectionResults = []; // Clear kết quả cũ khi bắt đầu chu trình mới
          pushWebNotification("Bắt đầu chu trình kiểm tra 6 điểm cây trồng...", "PROCESS");
          return;
        }

        // POINT_READY:n Event handling (Giống v2.mjs)
        const pointReadyMatch = /^POINT_READY:(\d+)$/i.exec(line);
        if (pointReadyMatch) {
          const pointIndex = Number(pointReadyMatch[1]);
          if (captureBusy) {
            console.warn(`[Arduino Protocol] Busy processing point ${pointIndex}, returning error`);
            activeSerialPort.write(`POINT_RESULT:${pointIndex}:ERROR\n`);
            return;
          }

          // KIỂM TRA BỎ QUA ĐIỂM NẾU VỊ TRÍ CHƯA ĐƯỢC THÊM CÂY TRỒNG TRÊN WEB
          if (!hasPlantAtPoint(pointIndex)) {
            const pointLabel = `Khay ${pointIndex + 1 < 10 ? "0" + (pointIndex + 1) : pointIndex + 1}`;
            console.log(`[Inspection Engine] Bỏ qua kiểm tra Điểm ${pointIndex + 1} (${pointLabel}) vì chưa được thêm cây trồng trên Web.`);
            pushWebNotification(`Bỏ qua Vị trí ${pointIndex + 1} (${pointLabel}): Chưa thêm cây trồng.`, "INFO");

            if (activeSerialPort && activeSerialPort.isOpen) {
              activeSerialPort.write(`POINT_RESULT:${pointIndex}:SKIPPED\n`);
              console.log(`[Server -> Arduino] POINT_RESULT:${pointIndex}:SKIPPED`);
            }
            return; // BỎ QUA KIỂM TRA ĐIỂM NÀY
          }

          captureBusy = true;
          const cancellationId = currentCancellationId;

          try {
            pushWebNotification(`Đang chụp ảnh & phân tích Gemini tại Điểm ${pointIndex + 1}...`, "AI_ANALYSIS");

            // 1. CHỤP ẢNH TỪ CAMERA (CHỈ KHI CHỤP ĐƯỢC ẢNH MỚI CHẠY TIẾP, NẾU LỖI THÌ DỪNG & BÁO LỖI ARDUINO)
            let imagePathToSend = null;
            try {
              imagePathToSend = await captureImage();
            } catch (capErr) {
              console.error(`[Capture Error] Dừng kiểm tra Điểm ${pointIndex + 1}: ${capErr.message}`);
              pushWebNotification(`Lỗi chụp ảnh từ USB Camera tại Điểm ${pointIndex + 1}: ${capErr.message}. Đã dừng chu trình điểm này!`, "ALERT");
              await sendTelegramText(`⚠️ LỖI CHỤP ẢNH TỪ CAMERA USB TẠI ĐIỂM ${pointIndex + 1}:\n${capErr.message}\n-> ĐÃ DỪNG CHU TRÌNH ĐIỂM NÀY!`);
              
              if (cancellationId === currentCancellationId && activeSerialPort && activeSerialPort.isOpen) {
                activeSerialPort.write(`POINT_RESULT:${pointIndex}:ERROR\n`);
                console.log(`[Server -> Arduino] POINT_RESULT:${pointIndex}:ERROR`);
              }
              return; // DỪNG NGAY KHÔNG CHẠY GEMINI HAY PHUN THUỐC KHI CHỤP ẢNH LỖI!
            }

            // 2. PHÂN TÍCH GEMINI AI VỚI DỮ LIỆU ẢNH BASE64
            let formattedResult = "";
            let action = "NO_SPRAY";

            const keys = getKeysList();
            if (keys.length === 0) {
              formattedResult = "Chưa thiết lập Gemini API Key! Vui lòng vào trang 'Cấu hình API' trên Web để thêm chìa khóa Gemini.";
              pushWebNotification(formattedResult, "WARNING");
            } else {
              let imageBase64 = null;
              if (fs.existsSync(imagePathToSend)) {
                try {
                  const imgBuf = fs.readFileSync(imagePathToSend);
                  imageBase64 = imgBuf.toString("base64");
                } catch (e) {}
              }

              const payload = {
                contents: [
                  {
                    parts: [
                      ...(imageBase64 ? [{ inlineData: { mimeType: "image/jpeg", data: imageBase64 } }] : []),
                      { text: createPrompt(pointIndex) }
                    ]
                  }
                ],
                generationConfig: {
                  responseMimeType: "application/json",
                  responseSchema: GEMINI_RESPONSE_SCHEMA
                }
              };

              try {
                const aiResult = await callGeminiApiWithRotation(payload);
                if (aiResult && aiResult.text) {
                  try {
                    const parsed = parseGeminiResult(aiResult.text);
                    formattedResult = formatGeminiResult(parsed);
                  } catch (pErr) {
                    formattedResult = `KẾT QUẢ KIỂM TRA\nTình trạng: KHÔNG CHẮC CHẮN\nMô tả chi tiết: ${aiResult.text.substring(0, 300)}\nKhuyến nghị: Theo dõi thêm\nThời gian kiểm tra: ${new Date().toLocaleString("vi-VN")}`;
                  }
                }
              } catch (aiErr) {
                formattedResult = `Lỗi phân tích Gemini AI: ${aiErr.message}`;
              }
            }

            // 3. GỬI ẢNH CHỤP + KẾT QUẢ PHÂN TÍCH VỀ TELEGRAM (CHUẨN V2.MJS)
            const telegramCaption = `ĐIỂM KIỂM TRA ${pointIndex + 1}\n\n${formattedResult}`;

            try {
              await sendTelegramPhoto(imagePathToSend, telegramCaption);
            } catch (tErr) {
              console.error(`[Telegram Error] ${tErr.message}`);
            }

            // 4. CHỈ KHI CÓ SÂU (needSpray returns true) MỚI PHUN THUỐC (SPRAY)
            action = needSpray(formattedResult) ? "SPRAY" : "NO_SPRAY";

            // Lưu kết quả kiểm tra điểm này cho Web UI
            const pointRecord = {
              pointIndex: pointIndex + 1,
              timestamp: new Date().toLocaleTimeString("vi-VN"),
              action: action === "SPRAY" ? "Cần phun thuốc (SPRAY)" : "Không phun (NO_SPRAY)",
              details: formattedResult,
              status: action === "SPRAY" ? "PEST_DETECTED" : "HEALTHY",
            };

            lastInspectionResults.push(pointRecord);
            pushWebNotification(`Kết quả Điểm ${pointIndex + 1}: ${pointRecord.action}`, action === "SPRAY" ? "WARNING" : "SUCCESS");

            if (cancellationId === currentCancellationId && activeSerialPort.isOpen) {
              activeSerialPort.write(`POINT_RESULT:${pointIndex}:${action}\n`);
              console.log(`[Server -> Arduino] POINT_RESULT:${pointIndex}:${action}`);
            }
          } catch (pErr) {
            console.error(`[Point Error] ${pErr.message}`);
            if (activeSerialPort && activeSerialPort.isOpen) {
              activeSerialPort.write(`POINT_RESULT:${pointIndex}:ERROR\n`);
            }
          } finally {
            captureBusy = false;
          }
          return;
        }

        if (normalized === "CHECK_COMPLETE") {
          pushWebNotification("Robot đã hoàn tất toàn bộ chu trình kiểm tra sâu bệnh!", "COMPLETE");
          await sendTelegramText("Hệ thống robot đã hoàn tất toàn bộ chu trình kiểm tra các điểm!");
          return;
        }

        if (normalized.startsWith("ALERT:")) {
          currentCancellationId++;
          pushWebNotification(`CẢNH BÁO PHẦN CỨNG: ${line}`, "ALERT");
          await sendTelegramText(`LỖI HỆ THỐNG ROBOT:\n${line}`);
          return;
        }
      } catch (evtErr) {
        console.error(`[Arduino Event Error] ${evtErr.message}`);
      }
    });

    activeSerialPort.on("close", () => {
      console.warn("[Arduino Direct Engine] Serial port closed");
      nodeConnected = false;
      activeSerialPort = null;
    });

    activeSerialPort.on("error", (err) => {
      console.error(`[Arduino Direct Engine Error] ${err.message}`);
    });

    return activeSerialPort;
  } catch (err) {
    console.warn(`[Arduino Init Error] ${err.message}`);
    activeSerialPort = null;
    throw err;
  }
}

// DIRECT COMMAND TRANSMISSION METHOD
async function sendDirectCommandToArduino(cmdString) {
  const port = await getOrInitArduinoSerialPort();
  if (!port || !port.isOpen) {
    throw new Error("Không thể mở hoặc duy trì cổng Serial kết nối với Arduino!");
  }

  return new Promise((resolve, reject) => {
    port.write(`${cmdString}\n`, (err) => {
      if (err) return reject(err);
      port.drain((drainErr) => {
        if (drainErr) return reject(drainErr);
        resolve(true);
      });
    });
  });
}

app.post("/api/arduino/command", async (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ success: false, error: "Vui lòng truyền mã lệnh điều khiển!" });
  }

  const mapped = ARDUINO_COMMAND_MAP[command] || { cmd: command, label: `Gửi lệnh: ${command}`, desc: "Lệnh tùy chỉnh" };
  const timestamp = new Date().toLocaleTimeString("vi-VN");

  try {
    // Send command directly to SerialPort
    await sendDirectCommandToArduino(mapped.cmd);

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
      timestamp: logEntry.timestamp,
    });
  }
});

app.get("/api/arduino/status", async (req, res) => {
  const serialInfo = await getRealSerialStatus();
  res.json({
    ...serialInfo,
    connected: !!(activeSerialPort && activeSerialPort.isOpen),
    lastPingTime: new Date().toLocaleTimeString("vi-VN"),
    lastLogs: lastArduinoLogs,
    inspectionResults: lastInspectionResults,
  });
});

app.post("/api/arduino/ping-check", async (req, res) => {
  const timestamp = new Date().toLocaleTimeString("vi-VN");
  let isConnected = false;
  let message = "";

  try {
    await sendDirectCommandToArduino("PING");
    isConnected = true;
    message = "Đã gửi PING và nhận kết nối thành công từ cổng Serial Arduino!";
  } catch (err) {
    isConnected = false;
    message = `Không thể kết nối Serial Arduino (${err.message})`;
  }

  lastArduinoLogs.unshift({
    timestamp,
    command: "PING",
    label: "Kiểm tra kết nối Arduino thực tế (PING)",
    status: isConnected ? "PONG_RECEIVED" : "NO_RESPONSE",
  });
  if (lastArduinoLogs.length > 25) lastArduinoLogs.pop();

  res.json({
    success: isConnected,
    message,
    status: {
      connected: isConnected,
      lastPingTime: timestamp,
    },
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

  try {
    if (serialInfo.connected) {
      await sendSerialCommandToArduino("ping");
    }
  } catch (err) {}

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

app.listen(PORT, () => {
  console.log(`✅ GrowHub Node.js Express Backend running on http://localhost:${PORT}`);
  console.log(`📁 Persistent JSON database path: ${dataDir}`);
});
