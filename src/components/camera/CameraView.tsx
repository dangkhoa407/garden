"use client";

import { useEffect, useState } from "react";

interface CameraViewProps {
  nightVision: boolean;
}

export function CameraView({ nightVision }: CameraViewProps) {
  const [timeStr, setTimeStr] = useState("");

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

  return (
    <div className="relative w-full h-[360px] sm:h-[450px] lg:h-full bg-black rounded-xl overflow-hidden tech-shadow flex flex-col group border border-outline-variant/20">
      {/* Feed Image */}
      <img
        src="https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?q=80&w=1200&auto=format&fit=crop"
        alt="Camera Live Feed"
        className={`w-full h-full object-cover transition-all duration-500 ${
          nightVision ? "brightness-125 contrast-125 hue-rotate-90 grayscale" : "brightness-95 group-hover:brightness-100"
        }`}
      />

      {/* Night vision indicator */}
      {nightVision && (
        <div className="absolute top-4 center-4 left-1/2 -translate-x-1/2 bg-emerald-950/80 text-emerald-400 text-xs px-3 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5 font-mono">
          <span className="material-symbols-outlined text-sm animate-pulse">visibility</span>
          NIGHT VISION MODE (IR ACTIVE)
        </div>
      )}

      {/* Overlay Top */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 bg-black/40 px-2.5 py-1 rounded-full backdrop-blur-sm border border-white/10">
          <span className="w-2.5 h-2.5 rounded-full bg-error animate-pulse" />
          <span className="font-label-caps text-xs text-white font-bold tracking-widest">TRỰC TIẾP</span>
        </div>
        <div className="text-right">
          <p className="font-label-caps text-xs text-white font-bold tracking-wider font-mono">
            {timeStr || "2026-08-06 14:46:00 PM"}
          </p>
          <p className="font-label-caps text-[10px] text-white/80 uppercase tracking-wider">
            CAM 04 | HYDROPONIC HUB ZONE A
          </p>
        </div>
      </div>

      {/* Overlay Bottom Sensors */}
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 sm:gap-3 pointer-events-none">
        <div className="glass-panel px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm">
          <span className="material-symbols-outlined text-primary text-base">device_thermostat</span>
          <span className="font-label-caps text-xs text-on-surface font-bold">22.4°C</span>
        </div>
        <div className="glass-panel px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm">
          <span className="material-symbols-outlined text-secondary text-base">water_drop</span>
          <span className="font-label-caps text-xs text-on-surface font-bold">64%</span>
        </div>
        <div className="glass-panel px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm">
          <span className="material-symbols-outlined text-tertiary text-base">light_mode</span>
          <span className="font-label-caps text-xs text-on-surface font-bold">850 PPFD</span>
        </div>
      </div>
    </div>
  );
}
