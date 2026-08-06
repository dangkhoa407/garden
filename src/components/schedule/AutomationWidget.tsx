"use client";

import { useState } from "react";

export function AutomationWidget() {
  const [zoneA, setZoneA] = useState(true);
  const [zoneB, setZoneB] = useState(false);
  const [zoneC, setZoneC] = useState(true);

  return (
    <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-outline-variant/10">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-headline-md text-body-lg font-bold text-on-surface">
          Điều khiển Tự động
        </h3>
        <span className="material-symbols-outlined text-on-surface-variant">
          tune
        </span>
      </div>
      <div className="space-y-4">
        {/* Toggle Item 1 */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-secondary">
              sprinkler
            </span>
            <div>
              <div className="font-body-sm font-semibold text-on-surface">
                Khu vực A (Rau ăn lá)
              </div>
              <div className="font-label-caps text-[10px] text-on-surface-variant">
                Lịch phun sương hằng ngày
              </div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={zoneA}
              onChange={(e) => setZoneA(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary" />
          </label>
        </div>

        {/* Toggle Item 2 */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-on-surface-variant">
              local_florist
            </span>
            <div>
              <div className="font-body-sm font-semibold text-on-surface">
                Khu vực B (Lan & Hoa)
              </div>
              <div className="font-label-caps text-[10px] text-on-surface-variant">
                Hệ thống nhỏ giọt
              </div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={zoneB}
              onChange={(e) => setZoneB(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary" />
          </label>
        </div>

        {/* Toggle Item 3 */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-background border border-outline-variant/20 hover:border-outline-variant/40 transition-colors">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-tertiary">
              wb_incandescent
            </span>
            <div>
              <div className="font-body-sm font-semibold text-on-surface">
                Tự động bật đèn LED (6h - 18h)
              </div>
              <div className="font-label-caps text-[10px] text-on-surface-variant">
                Theo chu kỳ sinh trưởng
              </div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={zoneC}
              onChange={(e) => setZoneC(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary" />
          </label>
        </div>
      </div>
    </div>
  );
}
