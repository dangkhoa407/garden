"use client";

import { useState } from "react";
import { CameraView } from "@/components/camera/CameraView";
import { CameraControls } from "@/components/camera/CameraControls";

export default function CameraPage() {
  const [nightVision, setNightVision] = useState(false);

  return (
    <div className="space-y-md max-w-[1600px] mx-auto">
      <div>
        <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
          Quan sát Camera Trực tiếp
        </h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Theo dõi trực tiếp theo thời gian thực các khu vực hydroponic và nhà kính thông minh.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-md lg:h-[calc(100vh-210px)]">
        {/* Video Feed Area */}
        <div className="lg:col-span-9 h-full">
          <CameraView nightVision={nightVision} />
        </div>

        {/* Controls Panel */}
        <div className="lg:col-span-3 h-full">
          <CameraControls
            nightVision={nightVision}
            onToggleNightVision={setNightVision}
          />
        </div>
      </div>
    </div>
  );
}
