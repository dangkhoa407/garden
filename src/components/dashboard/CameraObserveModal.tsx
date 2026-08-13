"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plant } from "@/lib/data";
import { useGarden } from "@/context/GardenContext";

interface CameraObserveModalProps {
  plant: Plant;
  isOpen: boolean;
  onClose: () => void;
}

function sameTray(a?: string, b?: string) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

export function CameraObserveModal({ plant, isOpen, onClose }: CameraObserveModalProps) {
  const { plants } = useGarden();
  const [mounted, setMounted] = useState(false);
  const [streamStatus, setStreamStatus] = useState("Dang mo camera...");
  const [activeTray, setActiveTray] = useState(() => plant.location || "Khay 01");
  const [movingTray, setMovingTray] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const trayOptions = Array.from(
    new Set((plants || []).map((item) => item.location?.trim()).filter(Boolean))
  )
    .map((location) => {
      const match = String(location).match(/Khay\s*0?(\d+)/i);
      return { location: String(location), order: match ? Number(match[1]) : 999 };
    })
    .sort((a, b) => a.order - b.order)
    .map((item) => item.location);

  const activePlant =
    plants.find((item) => sameTray(item.location, activeTray)) ||
    plants.find((item) => sameTray(item.location, plant.location)) ||
    plant;

  useEffect(() => {
    if (!isOpen || !mounted) return;
    setActiveTray(plant.location || "Khay 01");

    let cancelled = false;

    const startStream = async () => {
      try {
        setStreamStatus("Dang ket noi webcam...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        setStreamStatus(track.label || "USB Camera 1080P");
      } catch {
        setStreamStatus("Khong the mo live camera");
      }
    };

    const stopStream = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    startStream();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [isOpen, mounted, plant.location]);

  const handleMoveTray = async (tray: string) => {
    setMovingTray(tray);
    setActiveTray(tray);
    try {
      await fetch("/api/plant-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantId: plant.id,
          plantName: activePlant.name,
          location: tray,
        }),
      });
    } catch (e) {}
    setMovingTray(null);
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-surface rounded-3xl p-6 max-w-6xl w-full shadow-2xl border border-outline-variant/30 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center border-b border-outline-variant/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-2xl">visibility</span>
            </div>
            <div>
              <h3 className="font-bold text-base text-on-surface flex items-center gap-2">
                Quan sat camera truc tiep
              </h3>
              <p className="text-xs text-on-surface-variant font-mono">
                {activePlant.name} - Vi tri: <span className="font-bold text-sky-600 dark:text-sky-400">{activeTray}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-primary p-1.5 rounded-xl hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container p-4 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-on-surface-variant mb-2">Khay dang xem</div>
              <div className="text-2xl font-bold text-on-surface">{activeTray}</div>
              <div className="text-sm text-on-surface-variant mt-1">{activePlant.name}</div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-on-surface-variant">Cay</span>
                <span className="font-semibold text-on-surface text-right">{activePlant.name}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-on-surface-variant">Vi tri</span>
                <span className="font-semibold text-on-surface text-right">{activeTray}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-on-surface-variant">Trang thai</span>
                <span className="font-semibold text-on-surface text-right">{activePlant.status}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-on-surface-variant">Tien do</span>
                <span className="font-semibold text-on-surface text-right">{activePlant.progress}%</span>
              </div>
            </div>

            <div className="pt-2 border-t border-outline-variant/20">
              <div className="text-xs uppercase tracking-wide text-on-surface-variant mb-2">Khay co du lieu</div>
              <div className="grid grid-cols-2 gap-2">
                {trayOptions.length > 0 ? trayOptions.map((tray) => {
                  const active = activeTray === tray;
                  return (
                    <button
                      key={tray}
                      type="button"
                      onClick={() => handleMoveTray(tray)}
                      disabled={movingTray === tray}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                        active
                          ? "bg-primary text-white border-primary"
                          : "bg-surface-container-high text-on-surface border-outline-variant/30 hover:bg-surface-container"
                      } ${movingTray === tray ? "opacity-60" : ""}`}
                    >
                      {movingTray === tray ? "Dang chay..." : tray}
                    </button>
                  );
                }) : (
                  <div className="text-sm text-on-surface-variant col-span-2">Chua co khay nao trong plants.</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black/90 border border-outline-variant/40 aspect-video flex items-center justify-center group shadow-inner">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="px-2.5 py-1 bg-red-600/90 text-white text-[11px] font-mono font-bold rounded-lg flex items-center gap-1.5 backdrop-blur-md animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-white"></span>
                  LIVE STREAM
                </span>
                <span className="px-2.5 py-1 bg-black/60 text-white text-[11px] font-mono rounded-lg backdrop-blur-md border border-white/10">
                  {activeTray}
                </span>
              </div>

              <div className="absolute bottom-3 right-3 text-white/70 text-[10px] font-mono bg-black/70 px-2 py-1 rounded-md backdrop-blur-xs">
                {streamStatus}
              </div>
            </div>

            <div className="flex justify-end items-center">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-all shadow-xs"
              >
                Dong Camera
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
