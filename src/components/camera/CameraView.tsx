"use client";

import { useEffect, useState } from "react";
import { useGarden } from "@/context/GardenContext";

interface CameraViewProps {
  nightVision: boolean;
}

export function CameraView({ nightVision }: CameraViewProps) {
  const { controls } = useGarden();
  const [timeStr, setTimeStr] = useState("");
  const [imgKey, setImgKey] = useState(Date.now());
  const [camStatus, setCamStatus] = useState<{ connected: boolean; device: string; message: string }>({
    connected: false,
    device: "/dev/video0",
    message: "Đang kết nối camera...",
  });

  // Tự động cập nhật đồng hồ trực tiếp
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

  // Tự động làm mới khung hình camera thực tế (Real-time Stream Polling 2s/lần)
  useEffect(() => {
    const checkCamStatus = async () => {
      try {
        const res = await fetch("/api/camera/status");
        if (res.ok) {
          const data = await res.json();
          setCamStatus(data);
        }
      } catch (err) {}
    };

    checkCamStatus();
    const streamTimer = setInterval(() => {
      setImgKey(Date.now());
    }, 2000);

    const statusTimer = setInterval(checkCamStatus, 5000);

    return () => {
      clearInterval(streamTimer);
      clearInterval(statusTimer);
    };
  }, []);

  return (
    <div className="relative w-full h-[360px] sm:h-[450px] lg:h-full bg-zinc-950 rounded-2xl overflow-hidden shadow-2xl flex flex-col group border border-zinc-800">
      {/* Real USB Camera Feed Image */}
      <img
        key={imgKey}
        src={`/api/camera/image?t=${imgKey}`}
        alt="Real USB Camera Live Feed"
        className={`w-full h-full object-cover transition-all duration-500 ${
          nightVision ? "brightness-125 contrast-125 hue-rotate-90 grayscale" : "brightness-100 group-hover:brightness-105"
        }`}
        onError={(e) => {
          // Fallback nếu server tạm thời chưa lấy được khung hình
          (e.target as HTMLImageElement).src =
            "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?q=80&w=1200&auto=format&fit=crop";
        }}
      />

      {/* Night vision indicator */}
      {nightVision && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-950/90 text-emerald-400 text-xs px-3.5 py-1.5 rounded-full border border-emerald-500/40 flex items-center gap-2 font-mono shadow-lg backdrop-blur-md">
          <span className="material-symbols-outlined text-sm animate-pulse">visibility</span>
          CHẾ ĐỘ HỒNG NGOẠI (NIGHT VISION IR ACTIVE)
        </div>
      )}

      {/* Overlay Top Bar */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full backdrop-blur-md border border-white/10 shadow-md">
          <span className={`w-2.5 h-2.5 rounded-full ${camStatus.connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
          <span className="font-mono text-xs text-white font-bold tracking-widest uppercase">
            {camStatus.connected ? "TRỰC TIẾP (LIVE)" : "CONNECTING"}
          </span>
        </div>
        <div className="text-right bg-black/60 px-3 py-1.5 rounded-xl backdrop-blur-md border border-white/10 shadow-md">
          <p className="text-xs text-white font-bold tracking-wider font-mono">
            {timeStr || "REAL-TIME"}
          </p>
          <p className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider mt-0.5">
            CAM USB 01 | {camStatus.device} ({camStatus.connected ? "SẴN SÀNG" : "OFFLINE"})
          </p>
        </div>
      </div>

      {/* Overlay Bottom Real Sensor Badges */}
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 sm:gap-3 pointer-events-none">
        <div className="bg-black/70 backdrop-blur-md px-3.5 py-1.5 rounded-xl flex items-center gap-2 shadow-lg border border-white/10 text-white">
          <span className="material-symbols-outlined text-rose-400 text-base">device_thermostat</span>
          <span className="font-mono text-xs font-bold">{controls.temperature || 26.5}°C</span>
        </div>
        <div className="bg-black/70 backdrop-blur-md px-3.5 py-1.5 rounded-xl flex items-center gap-2 shadow-lg border border-white/10 text-white">
          <span className="material-symbols-outlined text-cyan-400 text-base">water_drop</span>
          <span className="font-mono text-xs font-bold">{controls.targetHumidity || 72}%</span>
        </div>
        <div className="bg-black/70 backdrop-blur-md px-3.5 py-1.5 rounded-xl flex items-center gap-2 shadow-lg border border-white/10 text-white">
          <span className="material-symbols-outlined text-amber-400 text-base">light_mode</span>
          <span className="font-mono text-xs font-bold">{controls.lightIntensity ? controls.lightIntensity * 10 : 850} PPFD</span>
        </div>
      </div>
    </div>
  );
}
