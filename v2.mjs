import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";

import { config as loadEnv } from "dotenv";
import sharp from "sharp";
import { ReadlineParser, SerialPort } from "serialport";

const execFileAsync = promisify(execFile);

// =========================================================
// ĐƯỜNG DẪN FILE
// =========================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_PATH = path.join(__dirname, ".env");
const KEYS_PATH = path.join(__dirname, "keys.txt");
const IMAGE_PATH = path.join(__dirname, "st01.jpg");

// =========================================================
// CẤU HÌNH
// =========================================================

const MODEL_NAME = "gemini-3.5-flash-lite";
const GEMINI_ATTEMPTS_PER_KEY = 2;

const ARDUINO_PORT = "AUTO";
const ARDUINO_BAUD_RATE = 9600;

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
const TELEGRAM_MAX_CAPTION = 1024;
const POINT_COUNT = 6;

let BOT_TOKEN = "";
let CHAT_ID = "";

let geminiApiKeys = [];
let currentGeminiKeyIndex = 0;

let nodeConnected = false;
let captureBusy = false;
let currentCancellationId = 0;

// =========================================================
// ĐỌC .env VÀ keys.txt
// =========================================================

function loadEnvironment() {
    const result = loadEnv({
        path: ENV_PATH
    });

    if (result.error) {
        throw new Error(
            `Không đọc được file .env tại ${ENV_PATH}: ` +
            result.error.message
        );
    }

    BOT_TOKEN = String(
        process.env.BOT_TOKEN || ""
    ).trim();

    CHAT_ID = String(
        process.env.CHAT_ID || ""
    ).trim();

    if (!BOT_TOKEN) {
        throw new Error(
            "Thiếu BOT_TOKEN trong file .env."
        );
    }

    if (!CHAT_ID) {
        throw new Error(
            "Thiếu CHAT_ID trong file .env."
        );
    }

    console.log(
        "Đã đọc BOT_TOKEN và CHAT_ID từ file .env."
    );
}

async function loadGeminiApiKeys() {
    let content;

    try {
        content = await readFile(
            KEYS_PATH,
            "utf8"
        );
    } catch (error) {
        throw new Error(
            `Không đọc được file keys.txt tại ${KEYS_PATH}: ` +
            error.message
        );
    }

    geminiApiKeys = [
        ...new Set(
            content
                .split(/\r?\n/)
                .map(
                    (line) =>
                        line.trim()
                )
                .filter(
                    (line) =>
                        line &&
                        !line.startsWith("#")
                )
        )
    ];

    if (
        geminiApiKeys.length === 0
    ) {
        throw new Error(
            "File keys.txt không có Gemini API key. " +
            "Mỗi dòng ghi một key."
        );
    }

    currentGeminiKeyIndex = 0;

    console.log(
        `Đã nạp ${geminiApiKeys.length} ` +
        "Gemini API key từ keys.txt."
    );
}

// =========================================================
// CAMERA
// =========================================================

async function setCameraControl(
    name,
    value
) {
    try {
        await execFileAsync(
            "v4l2-ctl",
            [
                "-d",
                CAMERA_DEVICE,

                `--set-ctrl=${name}=${value}`
            ],
            {
                timeout: 5000
            }
        );

        console.log(
            `Camera ${name}: ${value}`
        );
    } catch {
        console.log(
            `Không chỉnh được ${name}, bỏ qua.`
        );
    }
}

async function configureCamera() {
    console.log(
        "Đang thiết lập camera..."
    );

    await setCameraControl(
        "brightness",
        CAMERA_BRIGHTNESS
    );

    await setCameraControl(
        "contrast",
        CAMERA_CONTRAST
    );

    await setCameraControl(
        "saturation",
        CAMERA_SATURATION
    );

    await setCameraControl(
        "sharpness",
        CAMERA_SHARPNESS
    );

    await setCameraControl(
        "white_balance_automatic",
        1
    );

    await setCameraControl(
        "power_line_frequency",
        1
    );
}

async function captureFrames(
    directory
) {
    const framePattern =
        path.join(
            directory,
            "frame-%03d.jpg"
        );

    const totalFrames =
        WARMUP_FRAMES +
        CHECK_FRAMES;

    await execFileAsync(
        "ffmpeg",
        [
            "-hide_banner",
            "-loglevel",
            "error",

            "-y",

            "-f",
            "v4l2",

            "-framerate",
            String(CAMERA_FPS),

            "-video_size",
            `${CAMERA_WIDTH}x${CAMERA_HEIGHT}`,

            "-i",
            CAMERA_DEVICE,

            "-frames:v",
            String(totalFrames),

            "-q:v",
            "2",

            framePattern
        ],
        {
            timeout: 30000,
            maxBuffer:
                2 * 1024 * 1024
        }
    );
}

async function analyzeFrameLight(
    framePath
) {
    const result =
        await sharp(
            framePath
        )
            .greyscale()
            .raw()
            .toBuffer({
                resolveWithObject: true
            });

    let totalBrightness = 0;
    let overexposedPixels = 0;
    let darkPixels = 0;

    for (
        const value
        of result.data
    ) {
        totalBrightness += value;

        if (
            value >= 245
        ) {
            overexposedPixels++;
        }

        if (
            value <= 15
        ) {
            darkPixels++;
        }
    }

    return {
        meanBrightness:
            totalBrightness /
            result.data.length,

        overexposedRatio:
            overexposedPixels /
            result.data.length,

        darkRatio:
            darkPixels /
            result.data.length
    };
}

async function captureImage() {
    console.log(
        "Đang mở camera..."
    );

    await configureCamera();

    const directory =
        await mkdtemp(
            path.join(
                tmpdir(),
                "vuon-rau-camera-"
            )
        );

    try {
        await captureFrames(
            directory
        );

        const frameFiles = (
            await readdir(
                directory
            )
        )
            .filter(
                (name) =>
                    name
                        .toLowerCase()
                        .endsWith(".jpg")
            )
            .sort()
            .slice(
                WARMUP_FRAMES,

                WARMUP_FRAMES +
                CHECK_FRAMES
            );

        if (
            frameFiles.length === 0
        ) {
            throw new Error(
                "Camera không tạo đủ khung hình."
            );
        }

        let bestPath = null;
        let bestInfo = null;
        let bestScore = Infinity;

        for (
            const fileName
            of frameFiles
        ) {
            const framePath =
                path.join(
                    directory,
                    fileName
                );

            const info =
                await analyzeFrameLight(
                    framePath
                );

            const score =
                Math.abs(
                    info.meanBrightness -
                    TARGET_BRIGHTNESS
                ) +

                info.overexposedRatio *
                300 +

                info.darkRatio *
                60;

            console.log(
                `${fileName}: sáng ` +
                `${info.meanBrightness.toFixed(1)}, ` +
                `cháy trắng ` +
                `${(
                    info.overexposedRatio *
                    100
                ).toFixed(1)}%`
            );

            if (
                score <
                bestScore
            ) {
                bestScore = score;
                bestPath = framePath;
                bestInfo = info;
            }
        }

        if (
            !bestPath ||
            !bestInfo
        ) {
            throw new Error(
                "Không chọn được ảnh từ camera."
            );
        }

        const brightness =
            bestInfo.meanBrightness;

        const overexposedRatio =
            bestInfo.overexposedRatio;

        console.log(
            "Độ sáng ảnh được chọn:",
            brightness.toFixed(1)
        );

        console.log(
            "Tỉ lệ vùng cháy sáng:",

            `${(
                overexposedRatio *
                100
            ).toFixed(1)}%`
        );

        let alpha = 1;
        let beta = 0;

        if (
            overexposedRatio > 0.25 ||
            brightness > 200
        ) {
            alpha = 0.58;
            beta = -30;

        } else if (
            overexposedRatio > 0.15 ||
            brightness > 175
        ) {
            alpha = 0.72;
            beta = -18;

        } else if (
            overexposedRatio > 0.07 ||
            brightness > 150
        ) {
            alpha = 0.84;
            beta = -8;

        } else if (
            overexposedRatio > 0.03 ||
            brightness > 130
        ) {
            alpha = 0.94;
            beta = -2;

        } else if (
            brightness < 35
        ) {
            alpha = 1.30;
            beta = 30;

        } else if (
            brightness < 65
        ) {
            alpha = 1.15;
            beta = 15;

        } else if (
            brightness < 90
        ) {
            alpha = 1.07;
            beta = 8;

        } else if (
            brightness < 115
        ) {
            alpha = 1.03;
            beta = 4;
        }

        await sharp(
            bestPath
        )
            .removeAlpha()
            .linear(
                alpha,
                beta
            )
            .jpeg({
                quality:
                    JPEG_QUALITY
            })
            .toFile(
                IMAGE_PATH
            );

        console.log(
            `Đã chụp và lưu ảnh: ${IMAGE_PATH}`
        );
    } catch (error) {
        const detail =
            error.stderr?.trim() ||
            error.message;

        throw new Error(
            `Không chụp được ảnh: ${detail}`
        );
    } finally {
        await rm(
            directory,
            {
                recursive: true,
                force: true
            }
        );
    }
}

// =========================================================
// GEMINI STRUCTURED OUTPUT
// =========================================================

const ALLOWED_STATUSES =
    new Set([
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

        description: {
            type: "STRING"
        },

        recommendation: {
            type: "STRING"
        }
    },

    required: [
        "status",
        "description",
        "recommendation"
    ]
};

function createPrompt(
    pointIndex
) {
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

function parseGeminiResult(
    rawText
) {
    let data;

    try {
        data =
            JSON.parse(
                rawText
            );
    } catch {
        throw new Error(
            "Gemini trả dữ liệu không phải JSON hợp lệ."
        );
    }

    const status =
        String(
            data?.status || ""
        )
            .normalize("NFC")
            .trim()
            .toUpperCase();

    const description =
        String(
            data?.description || ""
        )
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    const recommendation =
        String(
            data?.recommendation || ""
        )
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    if (
        !ALLOWED_STATUSES.has(
            status
        )
    ) {
        throw new Error(
            "Gemini trả tình trạng không hợp lệ: " +
            `${status || "trống"}`
        );
    }

    if (
        description.length < 10
    ) {
        throw new Error(
            "Gemini trả mô tả bị trống hoặc quá ngắn."
        );
    }

    if (
        recommendation.length < 10
    ) {
        throw new Error(
            "Gemini trả khuyến nghị bị trống hoặc quá ngắn."
        );
    }

    return {
        status,
        description,
        recommendation
    };
}

function formatGeminiResult(
    data
) {
    const currentTime =
        new Date()
            .toLocaleString(
                "vi-VN",
                {
                    timeZone:
                        "Asia/Ho_Chi_Minh",

                    hour12: false
                }
            );

    return [
        "KẾT QUẢ KIỂM TRA",

        `Tình trạng: ${data.status}`,

        `Mô tả chi tiết: ` +
        `${data.description}`,

        `Khuyến nghị: ` +
        `${data.recommendation}`,

        `Thời gian kiểm tra: ` +
        `${currentTime}`
    ].join("\n");
}

function shouldSwitchGeminiKey(
    status,
    detail
) {
    const text =
        String(
            detail || ""
        )
            .toUpperCase();

    return (
        status === 401 ||
        status === 403 ||
        status === 429 ||

        text.includes(
            "API KEY"
        ) ||

        text.includes(
            "API_KEY"
        ) ||

        text.includes(
            "KEY NOT VALID"
        ) ||

        text.includes(
            "QUOTA"
        ) ||

        text.includes(
            "RESOURCE_EXHAUSTED"
        ) ||

        text.includes(
            "RATE LIMIT"
        )
    );
}

function isRetryableGeminiError(
    status,
    detail
) {
    const text =
        String(
            detail || ""
        )
            .toUpperCase();

    return (
        status === 400 ||
        status === 401 ||
        status === 403 ||
        status === 408 ||
        status === 429 ||
        status >= 500 ||

        text.includes(
            "UNAVAILABLE"
        ) ||

        text.includes(
            "TIMEOUT"
        )
    );
}

async function callGeminiWithKey(
    apiKey,
    imageBase64,
    pointIndex
) {
    const apiUrl =
        "https://generativelanguage.googleapis.com/" +

        `v1beta/models/${encodeURIComponent(
            MODEL_NAME
        )}` +

        ":generateContent";

    let response;

    try {
        response =
            await fetch(
                apiUrl,
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "x-goog-api-key":
                            apiKey
                    },

                    body:
                        JSON.stringify({
                            contents: [
                                {
                                    role: "user",

                                    parts: [
                                        {
                                            text:
                                                createPrompt(
                                                    pointIndex
                                                )
                                        },

                                        {
                                            inlineData: {
                                                mimeType:
                                                    "image/jpeg",

                                                data:
                                                    imageBase64
                                            }
                                        }
                                    ]
                                }
                            ],

                            generationConfig: {
                                maxOutputTokens:
                                    1200,

                                thinkingConfig: {
                                    thinkingLevel:
                                        "minimal"
                                },

                                responseMimeType:
                                    "application/json",

                                responseSchema:
                                    GEMINI_RESPONSE_SCHEMA
                            }
                        }),

                    signal:
                        AbortSignal.timeout(
                            120000
                        )
                }
            );
    } catch (error) {
        return {
            ok: false,
            retryable: true,
            switchKey: false,

            message:
                "Lỗi mạng hoặc timeout: " +
                error.message
        };
    }

    const responseText =
        await response.text();

    let responseData = null;

    try {
        responseData =
            JSON.parse(
                responseText
            );
    } catch {
        // Xử lý ở dưới.
    }

    if (
        !response.ok
    ) {
        const errorDetail =
            responseData
                ?.error
                ?.message ||

            responseData
                ?.error
                ?.status ||

            responseText.slice(
                0,
                500
            ) ||

            "Không có nội dung lỗi.";

        if (
            response.status === 404
        ) {
            return {
                ok: false,
                retryable: false,
                switchKey: false,

                message:
                    `Không tìm thấy model ` +
                    `${MODEL_NAME}: ` +
                    errorDetail
            };
        }

        return {
            ok: false,

            retryable:
                isRetryableGeminiError(
                    response.status,
                    errorDetail
                ),

            switchKey:
                shouldSwitchGeminiKey(
                    response.status,
                    errorDetail
                ),

            message:
                `Gemini HTTP ` +
                `${response.status}: ` +
                errorDetail
        };
    }

    if (
        !responseData
    ) {
        return {
            ok: false,
            retryable: true,
            switchKey: false,

            message:
                "Gemini trả phản hồi " +
                "không phải JSON hợp lệ."
        };
    }

    const candidate =
        responseData
            ?.candidates?.[0];

    const parts =
        candidate
            ?.content
            ?.parts ||
        [];

    const rawResult =
        parts
            .filter(
                (part) =>
                    !part.thought
            )
            .map(
                (part) =>
                    part.text || ""
            )
            .join("")
            .trim();

    if (
        !rawResult
    ) {
        const finishReason =
            candidate
                ?.finishReason ||

            responseData
                ?.promptFeedback
                ?.blockReason ||

            "Không rõ nguyên nhân";

        return {
            ok: false,
            retryable: true,
            switchKey: false,

            message:
                "Gemini không trả nội dung. " +
                `Lý do: ${finishReason}`
        };
    }

    try {
        const parsed =
            parseGeminiResult(
                rawResult
            );

        return {
            ok: true,

            result:
                formatGeminiResult(
                    parsed
                )
        };
    } catch (error) {
        return {
            ok: false,
            retryable: true,
            switchKey: false,

            message:
                `${error.message} ` +
                "Nội dung nhận được: " +
                rawResult.slice(
                    0,
                    500
                )
        };
    }
}

async function analyzeImage(
    pointIndex
) {
    if (
        geminiApiKeys.length === 0
    ) {
        throw new Error(
            "Chưa nạp API key từ keys.txt."
        );
    }

    const imageBuffer =
        await readFile(
            IMAGE_PATH
        );

    const imageBase64 =
        imageBuffer.toString(
            "base64"
        );

    const totalKeys =
        geminiApiKeys.length;

    const startKeyIndex =
        currentGeminiKeyIndex;

    const errors = [];

    console.log(
        `Đang gửi ảnh lên ${MODEL_NAME}. ` +
        `Có ${totalKeys} key khả dụng.`
    );

    for (
        let keyOffset = 0;
        keyOffset < totalKeys;
        keyOffset++
    ) {
        const keyIndex =
            (
                startKeyIndex +
                keyOffset
            ) %
            totalKeys;

        const apiKey =
            geminiApiKeys[
                keyIndex
            ];

        for (
            let attempt = 1;
            attempt <=
            GEMINI_ATTEMPTS_PER_KEY;
            attempt++
        ) {
            console.log(
                "Đang thử key số " +
                `${keyIndex + 1}/` +
                `${totalKeys}, ` +
                `lần ${attempt}/` +
                `${GEMINI_ATTEMPTS_PER_KEY}...`
            );

            const result =
                await callGeminiWithKey(
                    apiKey,
                    imageBase64,
                    pointIndex
                );

            if (
                result.ok
            ) {
                currentGeminiKeyIndex =
                    keyIndex;

                console.log(
                    "Gemini key số " +
                    `${keyIndex + 1} hoạt động.`
                );

                return result.result;
            }

            const errorLine =
                `Key ${keyIndex + 1}, ` +
                `lần ${attempt}: ` +
                result.message;

            errors.push(
                errorLine
            );

            console.error(
                `Gemini lỗi: ${errorLine}`
            );

            if (
                !result.retryable
            ) {
                throw new Error(
                    result.message
                );
            }

            if (
                result.switchKey
            ) {
                break;
            }
        }
    }

    currentGeminiKeyIndex =
        (
            startKeyIndex +
            1
        ) %
        totalKeys;

    throw new Error(
        "Gemini không trả được kết quả đầy đủ " +
        "sau khi thử lại:\n" +
        errors.join("\n")
    );
}

// =========================================================
// TELEGRAM
// =========================================================

async function telegramRequest(
    method,
    formData
) {
    const response =
        await fetch(
            `https://api.telegram.org/` +
            `bot${BOT_TOKEN}/${method}`,

            {
                method:
                    "POST",

                body:
                    formData,

                signal:
                    AbortSignal.timeout(
                        60000
                    )
            }
        );

    const responseText =
        await response.text();

    if (
        !response.ok
    ) {
        throw new Error(
            `Telegram HTTP ` +
            `${response.status}: ` +
            responseText.slice(
                0,
                500
            )
        );
    }

    return responseText;
}

async function sendTelegramText(
    message
) {
    const formData =
        new FormData();

    formData.append(
        "chat_id",
        CHAT_ID
    );

    formData.append(
        "text",

        String(message).slice(
            0,
            4096
        )
    );

    await telegramRequest(
        "sendMessage",
        formData
    );
}

async function sendTelegramPhoto(
    message
) {
    const imageBuffer =
        await readFile(
            IMAGE_PATH
        );

    const fullMessage =
        String(message).trim();

    const formData =
        new FormData();

    formData.append(
        "chat_id",
        CHAT_ID
    );

    formData.append(
        "caption",

        fullMessage.slice(
            0,
            TELEGRAM_MAX_CAPTION
        )
    );

    formData.append(
        "photo",

        new Blob(
            [imageBuffer],
            {
                type:
                    "image/jpeg"
            }
        ),

        path.basename(
            IMAGE_PATH
        )
    );

    await telegramRequest(
        "sendPhoto",
        formData
    );

    const remainingText =
        fullMessage
            .slice(
                TELEGRAM_MAX_CAPTION
            )
            .trim();

    if (
        remainingText
    ) {
        await sendTelegramText(
            remainingText
        );
    }
}

// =========================================================
// QUYẾT ĐỊNH PHUN
// =========================================================

function needSpray(
    resultText
) {
    const text =
        String(resultText)
            .normalize("NFC")
            .toUpperCase();

    return (
        text.includes(
            "TÌNH TRẠNG: SÂU VÀ BỆNH"
        ) ||

        text.includes(
            "TÌNH TRẠNG: LÁ BỊ SÂU ĂN"
        ) ||

        text.includes(
            "TÌNH TRẠNG: SÂU"
        )
    );
}

// =========================================================
// SERIAL ARDUINO
// =========================================================

async function findArduinoPort() {
    if (
        ARDUINO_PORT !==
        "AUTO"
    ) {
        return ARDUINO_PORT;
    }

    const ports =
        await SerialPort.list();

    const candidates =
        ports.filter(
            (portInfo) =>
                /^\/dev\/ttyACM\d+$/
                    .test(
                        portInfo.path
                    ) ||

                /^\/dev\/ttyUSB\d+$/
                    .test(
                        portInfo.path
                    )
        );

    if (
        candidates.length === 0
    ) {
        throw new Error(
            "Không tìm thấy Arduino tại " +
            "/dev/ttyACM* hoặc /dev/ttyUSB*."
        );
    }

    console.log(
        "Các cổng Serial tìm thấy:",

        candidates
            .map(
                (item) =>
                    item.path
            )
            .join(", ")
    );

    return candidates[0].path;
}

async function openArduino() {
    const portPath =
        await findArduinoPort();

    console.log(
        `Đang mở Arduino tại ${portPath}...`
    );

    const port =
        new SerialPort({
            path:
                portPath,

            baudRate:
                ARDUINO_BAUD_RATE,

            autoOpen:
                false
        });

    await new Promise(
        (resolve, reject) => {
            port.open(
                (error) => {
                    if (
                        error
                    ) {
                        reject(
                            error
                        );

                        return;
                    }

                    resolve();
                }
            );
        }
    );

    console.log(
        "Cổng Serial đã mở."
    );

    return port;
}

async function sendArduinoCommand(
    port,
    command
) {
    if (
        !port.isOpen
    ) {
        throw new Error(
            "Cổng Arduino đang đóng."
        );
    }

    await new Promise(
        (resolve, reject) => {
            port.write(
                `${command}\n`,

                (writeError) => {
                    if (
                        writeError
                    ) {
                        reject(
                            writeError
                        );

                        return;
                    }

                    port.drain(
                        (drainError) => {
                            if (
                                drainError
                            ) {
                                reject(
                                    drainError
                                );

                                return;
                            }

                            resolve();
                        }
                    );
                }
            );
        }
    );

    console.log(
        `Node -> Arduino: ${command}`
    );
}

// =========================================================
// XỬ LÝ MỘT ĐIỂM
// =========================================================

async function processPoint(
    arduino,
    pointIndex,
    cancellationId
) {
    await captureImage();

    if (
        cancellationId !==
        currentCancellationId
    ) {
        console.log(
            "Chu trình đã bị hủy " +
            "sau khi chụp ảnh."
        );

        return;
    }

    const result =
        await analyzeImage(
            pointIndex
        );

    if (
        cancellationId !==
        currentCancellationId
    ) {
        console.log(
            "Chu trình đã bị hủy " +
            "sau khi phân tích."
        );

        return;
    }

    console.log(
        `\nKết quả Gemini tại điểm ` +
        `${pointIndex + 1}:\n` +
        result
    );

    try {
        await sendTelegramPhoto(
            `ĐIỂM KIỂM TRA ` +
            `${pointIndex + 1}\n` +
            result
        );

        console.log(
            "Đã gửi ảnh và kết quả về Telegram."
        );
    } catch (error) {
        console.error(
            "Không gửi được ảnh về Telegram:",
            error.message
        );
    }

    if (
        cancellationId !==
        currentCancellationId
    ) {
        console.log(
            "Chu trình đã bị hủy " +
            "trước khi trả Arduino."
        );

        return;
    }

    const action =
        needSpray(result)
            ? "SPRAY"
            : "NO_SPRAY";

    await sendArduinoCommand(
        arduino,

        `POINT_RESULT:` +
        `${pointIndex}:` +
        action
    );
}

// =========================================================
// ĐIỀU KHIỂN BÀN PHÍM
// =========================================================

function printControls() {
    console.log(`
================ ĐIỀU KHIỂN ================

k + Enter : Kiểm tra sâu
h + Enter : Chỉ chạy homing
p + Enter : Phun toàn bộ
s + Enter : Dừng ngay
r + Enter : Xóa trạng thái lỗi
ping      : Kiểm tra kết nối
keys      : Xem số key đang có
?         : Hiện hướng dẫn

============================================
`);
}

// =========================================================
// CHƯƠNG TRÌNH CHÍNH
// =========================================================

async function main() {
    loadEnvironment();

    await loadGeminiApiKeys();

    const arduino =
        await openArduino();

    const parser =
        arduino.pipe(
            new ReadlineParser({
                delimiter:
                    "\n"
            })
        );

    async function announceNodeReady() {
        try {
            await sendArduinoCommand(
                arduino,
                "NODE_READY"
            );
        } catch (error) {
            console.error(
                "Không gửi được NODE_READY:",
                error.message
            );
        }
    }

    await announceNodeReady();

    const handshakeTimer =
        setInterval(
            () => {
                if (
                    !nodeConnected &&
                    arduino.isOpen
                ) {
                    void announceNodeReady();
                }
            },

            1000
        );

    parser.on(
        "data",

        async (rawLine) => {
            const line =
                String(rawLine)
                    .replace(
                        /\r/g,
                        ""
                    )
                    .trim();

            if (
                !line
            ) {
                return;
            }

            console.log(
                `Arduino -> Node: ${line}`
            );

            const normalized =
                line.toUpperCase();

            try {
                if (
                    normalized ===
                    "ARDUINO_READY"
                ) {
                    nodeConnected = false;

                    await announceNodeReady();

                    return;
                }

                if (
                    normalized ===
                    "NODE_CONNECTED"
                ) {
                    const firstConnection =
                        !nodeConnected;

                    nodeConnected = true;

                    if (
                        firstConnection
                    ) {
                        console.log(
                            "Đã kết nối Node với Arduino."
                        );

                        console.log(
                            "Hệ thống đang đứng yên, " +
                            "chưa chạy động cơ."
                        );

                        console.log(
                            "Nhấn nút KIỂM TRA SÂU " +
                            "trên Arduino hoặc gõ k."
                        );

                        printControls();
                    }

                    return;
                }

                if (
                    normalized ===
                    "CHECK_STARTED"
                ) {
                    currentCancellationId++;

                    console.log(
                        "Bắt đầu chu trình kiểm tra sâu."
                    );

                    return;
                }

                const pointReadyMatch =
                    /^POINT_READY:(\d+)$/i
                        .exec(
                            line
                        );

                if (
                    pointReadyMatch
                ) {
                    const pointIndex =
                        Number(
                            pointReadyMatch[1]
                        );

                    if (
                        !Number.isInteger(
                            pointIndex
                        ) ||

                        pointIndex < 0 ||

                        pointIndex >=
                        POINT_COUNT
                    ) {
                        throw new Error(
                            "Arduino gửi số điểm " +
                            `không hợp lệ: ${line}`
                        );
                    }

                    if (
                        captureBusy
                    ) {
                        console.error(
                            "Node đang xử lý ảnh " +
                            "nhưng Arduino gửi thêm điểm."
                        );

                        await sendArduinoCommand(
                            arduino,

                            `POINT_RESULT:` +
                            `${pointIndex}:ERROR`
                        );

                        return;
                    }

                    captureBusy = true;

                    const cancellationId =
                        currentCancellationId;

                    try {
                        await processPoint(
                            arduino,
                            pointIndex,
                            cancellationId
                        );
                    } catch (error) {
                        const errorMessage =
                            `Lỗi xử lý điểm ` +
                            `${pointIndex + 1}: ` +
                            error.message;

                        console.error(
                            errorMessage
                        );

                        try {
                            await sendTelegramText(
                                errorMessage
                            );
                        } catch (
                            telegramError
                        ) {
                            console.error(
                                "Không gửi được lỗi " +
                                "về Telegram:",

                                telegramError.message
                            );
                        }

                        if (
                            cancellationId ===
                            currentCancellationId &&

                            arduino.isOpen
                        ) {
                            await sendArduinoCommand(
                                arduino,

                                `POINT_RESULT:` +
                                `${pointIndex}:ERROR`
                            );
                        }
                    } finally {
                        captureBusy = false;
                    }

                    return;
                }

                if (
                    normalized
                        .startsWith(
                            "SPRAY_STARTED:"
                        )
                ) {
                    console.log(
                        "Arduino đang phun tại điểm hiện tại."
                    );

                    return;
                }

                if (
                    normalized
                        .startsWith(
                            "POINT_DONE:"
                        )
                ) {
                    console.log(
                        `Arduino đã xử lý xong: ${line}`
                    );

                    return;
                }

                if (
                    normalized ===
                    "CHECK_COMPLETE"
                ) {
                    console.log(
                        "Đã kiểm tra xong toàn bộ các điểm."
                    );

                    try {
                        await sendTelegramText(
                            "Hệ thống đã kiểm tra xong " +
                            "toàn bộ các điểm."
                        );
                    } catch (error) {
                        console.error(
                            "Không gửi được thông báo hoàn tất:",
                            error.message
                        );
                    }

                    return;
                }

                if (
                    normalized ===
                    "HOMING_STARTED"
                ) {
                    console.log(
                        "Arduino đang homing..."
                    );

                    return;
                }

                if (
                    normalized ===
                    "HOMING_OK"
                ) {
                    console.log(
                        "Homing hoàn tất."
                    );

                    return;
                }

                if (
                    normalized ===
                    "HOME_COMPLETE"
                ) {
                    console.log(
                        "Homing độc lập đã hoàn tất."
                    );

                    return;
                }

                if (
                    normalized ===
                    "FULL_SPRAY_STARTED"
                ) {
                    console.log(
                        "Bắt đầu phun toàn bộ."
                    );

                    return;
                }

                if (
                    normalized ===
                    "FULL_SPRAY_COMPLETE"
                ) {
                    console.log(
                        "Đã phun toàn bộ xong."
                    );

                    return;
                }

                if (
                    normalized
                        .startsWith(
                            "CHECK_REJECTED:"
                        ) ||

                    normalized
                        .startsWith(
                            "HOME_REJECTED:"
                        ) ||

                    normalized
                        .startsWith(
                            "FULL_SPRAY_REJECTED:"
                        ) ||

                    normalized
                        .startsWith(
                            "POINT_RESULT_REJECTED:"
                        )
                ) {
                    console.log(
                        `Arduino từ chối lệnh: ${line}`
                    );

                    return;
                }

                if (
                    normalized
                        .startsWith(
                            "STOPPED:"
                        )
                ) {
                    currentCancellationId++;

                    console.log(
                        `Hệ thống đã dừng: ${line}`
                    );

                    return;
                }

                if (
                    normalized
                        .startsWith(
                            "ALERT:"
                        )
                ) {
                    currentCancellationId++;

                    console.error(
                        `Lỗi Arduino: ${line}`
                    );

                    try {
                        await sendTelegramText(
                            `LỖI HỆ THỐNG:\n${line}`
                        );
                    } catch (error) {
                        console.error(
                            "Không gửi được ALERT về Telegram:",
                            error.message
                        );
                    }

                    return;
                }

                if (
                    normalized
                        .startsWith(
                            "PONG:"
                        )
                ) {
                    console.log(
                        `Kết nối: ${line}`
                    );

                    return;
                }

                if (
                    normalized ===
                    "ERROR_RESET_OK"
                ) {
                    console.log(
                        "Đã xóa trạng thái lỗi Arduino."
                    );
                }
            } catch (error) {
                console.error(
                    "Lỗi khi xử lý dữ liệu Arduino:",
                    error.message
                );
            }
        }
    );

    arduino.on(
        "error",

        async (error) => {
            console.error(
                "Lỗi Arduino:",
                error.message
            );

            try {
                await sendTelegramText(
                    "Lỗi kết nối Arduino: " +
                    error.message
                );
            } catch {
                // Không tạo thêm lỗi.
            }
        }
    );

    arduino.on(
        "close",

        () => {
            clearInterval(
                handshakeTimer
            );

            nodeConnected = false;
            currentCancellationId++;

            console.log(
                "Kết nối Arduino đã đóng."
            );
        }
    );

    const keyboard =
        readline.createInterface({
            input:
                process.stdin,

            output:
                process.stdout,

            terminal:
                false
        });

    keyboard.on(
        "line",

        async (input) => {
            const command =
                input
                    .trim()
                    .toLowerCase();

            try {
                if (
                    command === "k"
                ) {
                    await sendArduinoCommand(
                        arduino,
                        "CHECK_PESTS"
                    );

                } else if (
                    command === "h"
                ) {
                    await sendArduinoCommand(
                        arduino,
                        "HOME"
                    );

                } else if (
                    command === "p"
                ) {
                    await sendArduinoCommand(
                        arduino,
                        "FULL_SPRAY"
                    );

                } else if (
                    command === "s"
                ) {
                    currentCancellationId++;

                    await sendArduinoCommand(
                        arduino,
                        "STOP"
                    );

                } else if (
                    command === "r"
                ) {
                    await sendArduinoCommand(
                        arduino,
                        "RESET_ERROR"
                    );

                } else if (
                    command === "ping"
                ) {
                    await sendArduinoCommand(
                        arduino,
                        "PING"
                    );

                } else if (
                    command === "keys"
                ) {
                    console.log(
                        `Có ${geminiApiKeys.length} key. ` +
                        "Đang ưu tiên key số " +
                        `${currentGeminiKeyIndex + 1}.`
                    );

                } else if (
                    command === "?" ||
                    command === "help"
                ) {
                    printControls();

                } else if (
                    command
                ) {
                    console.log(
                        "Lệnh không hợp lệ. " +
                        "Gõ ? để xem hướng dẫn."
                    );
                }
            } catch (error) {
                console.error(
                    "Không gửi được lệnh:",
                    error.message
                );
            }
        }
    );

    process.on(
        "SIGINT",

        () => {
            clearInterval(
                handshakeTimer
            );

            currentCancellationId++;

            keyboard.close();

            console.log(
                "\nĐang đóng chương trình..."
            );

            if (
                arduino.isOpen
            ) {
                arduino.close(
                    () =>
                        process.exit(0)
                );
            } else {
                process.exit(0);
            }
        }
    );
}

// =========================================================
// CHẠY CHƯƠNG TRÌNH
// =========================================================

main().catch(
    async (error) => {
        const errorMessage =
            "Lỗi chương trình Node: " +
            error.message;

        console.error(
            errorMessage
        );

        try {
            if (
                BOT_TOKEN &&
                CHAT_ID
            ) {
                await sendTelegramText(
                    errorMessage
                );
            }
        } catch {
            console.error(
                "Không gửi được thông báo lỗi về Telegram."
            );
        }

        process.exitCode = 1;
    }
);