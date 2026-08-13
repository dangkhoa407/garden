"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useGarden } from "@/context/GardenContext";
import {
  CAMERA_INPUT_CHANGED_EVENT,
  getCameraStreamWithSavedInput,
} from "@/lib/cameraInput";

interface CameraViewProps {
  nightVision?: boolean;
}

export function CameraView({ nightVision = false }: CameraViewProps) {
  const { controls } = useGarden();
  const pathname = usePathname();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null); // giữ ref để stop từ bên ngoài useEffect
  const [timeStr, setTimeStr] = useState("");
  const [cameraInputVersion, setCameraInputVersion] = useState(0);
  const [camStatus, setCamStatus] = useState<{
    connected: boolean;
    device: string;
    message: string;
    fps: number;
  }>({
    connected: false,
    device: "Camera USB 1080P",
    message: "Đang kết nối luồng Live Stream...",
    fps: 60,
  });

  const [espMoisture, setEspMoisture] = useState<number | null>(null);

  // Real-time ESP32 Soil Moisture Polling
  useEffect(() => {
    const fetchEspSensors = async () => {
      try {
        const res = await fetch("/api/esp32/sensors");
        if (res.ok) {
          const json = await res.json();
          if (json.data?.avgMoisture !== undefined) {
            setEspMoisture(json.data.avgMoisture);
          } else if (json.sensors?.avgSoilPercent !== undefined) {
            setEspMoisture(json.sensors.avgSoilPercent);
          }
        }
      } catch (err) {}
    };

    fetchEspSensors();
    const interval = setInterval(fetchEspSensors, 2000);
    return () => clearInterval(interval);
  }, []);

  // Real-time clock HUD
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const date = now.toISOString().split("T")[0];
      const time = now.toTimeString().split(" ")[0];
      const ampm = now.getHours() >= 12 ? "PM" : "AM";
      setTimeStr(`${date} ${time} ${ampm}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleCameraInputChanged = () => setCameraInputVersion((version) => version + 1);
    window.addEventListener(CAMERA_INPUT_CHANGED_EVENT, handleCameraInputChanged);
    return () => window.removeEventListener(CAMERA_INPUT_CHANGED_EVENT, handleCameraInputChanged);
  }, []);

  // Native HTML5 WebRTC Video Stream - 60 FPS Direct Camera App Experience
  useEffect(() => {
    let localStream: MediaStream | null = null;
    let pageHidden = false;

    const startDirectCameraStream = async () => {
      try {
        const { stream, requestedInput, usedSavedInput } = await getCameraStreamWithSavedInput({
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60 },
        });

        localStream = stream;
        streamRef.current = stream; // lưu vào ref để có thể stop khi navigate
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();

        setCamStatus({
          connected: true,
          device: track.label || "Camera USB Web 1080P",
          message: "Phát trực tiếp 60FPS (Direct App Camera Stream)",
          fps: settings.frameRate || 60,
        });

        // Tự động đẩy khung hình MỚI sang server mỗi 1 giây để giữ st01.jpg luôn là ảnh chụp thực tế theo thời gian thực
        const pushFrameToServer = () => {
          if (videoRef.current && videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = videoRef.current.videoWidth;
              canvas.height = videoRef.current.videoHeight;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);
                fetch("/api/camera/upload-snapshot", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ imageBase64 }),
                }).catch(() => {});
              }
            } catch (e) {}
          }
        };

        // Đẩy 1 frame ngay lập tức khi vừa kết nối camera
        setTimeout(pushFrameToServer, 500);

        // Đẩy liên tục mỗi 300ms (3 lần / giây) để đảm bảo chụp tức thì ảnh mới khi tới vị trí
        const syncTimer = setInterval(pushFrameToServer, 300);

        // Cleanup timer khi unmount
        (localStream as any)._syncTimer = syncTimer;

        // Bắt sự kiện rút phích cắm Camera USB ngay lập tức
        track.onended = () => {
          clearInterval(syncTimer);
          setCamStatus({
            connected: false,
            device: "Không có thiết bị",
            message: "Đã rút Camera USB khỏi máy tính!",
            fps: 0,
          });
        };
      } catch (err: any) {
        setCamStatus({
          connected: false,
          device: "Chưa kết nối",
          message: "Không thể mở luồng Camera USB! Vui lòng cắm lại cáp USB.",
          fps: 0,
        });
      }
    };

    const stopLocalStream = () => {
      if (localStream) {
        if ((localStream as any)._syncTimer) clearInterval((localStream as any)._syncTimer);
        localStream.getTracks().forEach((track) => track.stop());
        localStream = null;
        streamRef.current = null;
      }
      // Cũng xóa srcObject khỏi video element
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        pageHidden = true;
        stopLocalStream();
      } else if (pageHidden) {
        pageHidden = false;
        void startDirectCameraStream();
      }
    };

    const handlePageHide = () => stopLocalStream();

    startDirectCameraStream();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      stopLocalStream();
    };
  }, [cameraInputVersion]);

  // Tắt camera NGAY KHI navigate sang trang khác (Next.js App Router)
  useEffect(() => {
    if (pathname !== "/camera") {
      // Không còn ở trang Camera → tắt stream ngay lập tức
      const stream = streamRef.current;
      if (stream) {
        if ((stream as any)._syncTimer) clearInterval((stream as any)._syncTimer);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCamStatus((prev) => ({ ...prev, connected: false, message: "Camera đã tắt" }));
      }
    }
  }, [pathname]);

  return (
    <div className="relative w-full h-[380px] sm:h-[480px] lg:h-full bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl flex flex-col group border border-zinc-800">
      {/* 60 FPS Direct App Camera Video Stream */}
      {camStatus.connected ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-all duration-500 ${
            nightVision
              ? "brightness-125 contrast-125 hue-rotate-90 grayscale"
              : "brightness-100 group-hover:brightness-105"
          }`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-400 p-6 text-center space-y-3">
          <span className="material-symbols-outlined text-6xl text-rose-500 animate-bounce">
            videocam_off
          </span>
          <div>
            <p className="font-bold text-white text-lg">MẤT KẾT NỐI CAMERA USB</p>
            <p className="text-sm text-zinc-400 mt-1">{camStatus.message}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
          >
            <span className="material-symbols-outlined text-base">refresh</span>
            Tải Lại Luồng Camera
          </button>
        </div>
      )}

      {/* Night vision indicator */}
      {nightVision && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-emerald-950/90 text-emerald-400 text-xs px-3.5 py-1.5 rounded-full border border-emerald-500/40 flex items-center gap-2 font-mono shadow-lg backdrop-blur-md z-10">
          <span className="material-symbols-outlined text-sm animate-pulse">visibility</span>
          CHẾ ĐỘ HỒNG NGOẠI (NIGHT VISION IR ACTIVE)
        </div>
      )}

      {/* Overlay Top HUD Bar */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none z-10">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-black/70 px-3.5 py-1.5 rounded-full backdrop-blur-md border border-emerald-500/30 shadow-md">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                camStatus.connected ? "bg-emerald-500 animate-ping" : "bg-rose-500"
              }`}
            />
            <span className="font-mono text-xs text-emerald-400 font-bold tracking-widest uppercase">
              {camStatus.connected ? "APP CAMERA FEED (LIVE 60FPS)" : "CAMERA OFFLINE"}
            </span>
          </div>
        </div>

        <div className="text-right bg-black/70 px-3.5 py-1.5 rounded-xl backdrop-blur-md border border-white/10 shadow-md">
          <p className="text-xs text-white font-bold tracking-wider font-mono">
            {timeStr || "REAL-TIME"}
          </p>
          <p className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider mt-0.5">
            {camStatus.device} | {camStatus.connected ? "ONLINE (60 FPS)" : "OFFLINE"}
          </p>
        </div>
      </div>

      {/* Overlay Bottom Sensor HUD */}
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 sm:gap-3 pointer-events-none z-10">
        <div className="bg-black/70 backdrop-blur-md px-3.5 py-1.5 rounded-xl flex items-center gap-2 shadow-lg border border-white/10 text-white">
          <span className="material-symbols-outlined text-rose-400 text-base">device_thermostat</span>
          <span className="font-mono text-xs font-bold">{controls.temperature || 26.5}°C</span>
        </div>
        <div className="bg-black/70 backdrop-blur-md px-3.5 py-1.5 rounded-xl flex items-center gap-2 shadow-lg border border-white/10 text-white">
          <span className="material-symbols-outlined text-cyan-400 text-base">water_drop</span>
          <span className="font-mono text-xs font-bold">
            {espMoisture !== null ? `${espMoisture}%` : `${controls.targetHumidity || 0}%`}
          </span>
        </div>
        <div className="bg-black/70 backdrop-blur-md px-3.5 py-1.5 rounded-xl flex items-center gap-2 shadow-lg border border-white/10 text-white">
          <span className="material-symbols-outlined text-amber-400 text-base">light_mode</span>
          <span className="font-mono text-xs font-bold">
            {controls.lightIntensity ? controls.lightIntensity * 10 : 850} PPFD
          </span>
        </div>
      </div>
    </div>
  );
}
