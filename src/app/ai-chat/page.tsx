"use client";

import { useState } from "react";
import { ChatInterface } from "@/components/ai-chat/ChatInterface";
import { GardenContextPanel } from "@/components/ai-chat/GardenContextPanel";

export default function AIChatPage() {
  const [showPanel, setShowPanel] = useState(false);

  return (
    <div className="w-full h-full overflow-hidden flex flex-col md:max-w-[1600px] md:mx-auto">
      {/* Desktop: side-by-side grid | Mobile: chat only + slide drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-md h-full overflow-hidden relative">

        {/* Chat Interface — full width on mobile, 8 cols on desktop */}
        <div className="lg:col-span-8 h-full overflow-hidden">
          <ChatInterface onTogglePanel={() => setShowPanel((v) => !v)} showPanel={showPanel} />
        </div>

        {/* Context Panel — hidden on mobile when false, fixed drawer when true, side panel on desktop */}
        <div
          className={
            showPanel
              ? "fixed inset-x-0 top-14 bottom-16 z-30 flex flex-col bg-surface shadow-2xl lg:static lg:col-span-4 lg:z-auto lg:shadow-none h-full overflow-hidden animate-in slide-in-from-bottom duration-200"
              : "hidden lg:flex lg:col-span-4 h-full overflow-hidden"
          }
        >
          {/* Mobile overlay close bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-surface-container border-b border-outline-variant/20 lg:hidden shrink-0">
            <span className="font-bold text-sm text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">monitoring</span>
              Dữ liệu vườn thực
            </span>
            <button
              onClick={() => setShowPanel(false)}
              className="p-1.5 rounded-full hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <GardenContextPanel />
          </div>
        </div>

        {/* Mobile backdrop when panel is open */}
        {showPanel && (
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            onClick={() => setShowPanel(false)}
          />
        )}
      </div>
    </div>
  );
}
