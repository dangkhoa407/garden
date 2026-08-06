"use client";

import { ChatInterface } from "@/components/ai-chat/ChatInterface";
import { GardenContextPanel } from "@/components/ai-chat/GardenContextPanel";

export default function AIChatPage() {
  return (
    <div className="max-w-[1600px] mx-auto h-full overflow-hidden flex flex-col">
      {/* Main Container Fixed Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-md h-full overflow-hidden">
        {/* Chat Interface (Span 8) */}
        <div className="lg:col-span-8 h-full overflow-hidden">
          <ChatInterface />
        </div>

        {/* Live Garden Context Side Panel (Span 4) */}
        <div className="lg:col-span-4 h-full overflow-hidden">
          <GardenContextPanel />
        </div>
      </div>
    </div>
  );
}
