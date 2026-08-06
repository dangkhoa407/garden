"use client";

import { useState, useRef, useEffect } from "react";
import { useGarden } from "@/context/GardenContext";

export function ChatInterface() {
  const { chatHistory, sendAiMessage, resetChatHistory, updateControls, triggerQuickAction } = useGarden();
  const [inputVal, setInputVal] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suggestedPrompts = [
    "🌿 Phân tích tổng thể sức khỏe vườn rau hôm nay",
    "💧 Đánh giá lịch trình tưới nước và độ ẩm",
    "☀️ Đèn LED đang cài đặt bao nhiêu %?",
    "🐛 Kiểm tra sâu bệnh trên lá cây",
  ];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isTyping]);

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputVal;
    if (!text.trim() && !attachedImage) return;

    setInputVal("");
    const img = attachedImage;
    setAttachedImage(null);
    setIsTyping(true);

    await sendAiMessage(text, img || undefined);
    setIsTyping(false);
  };

  const handleActionClick = (actionKey: string, label: string) => {
    if (actionKey === "water-now" || actionKey === "water-3min" || actionKey === "toggle-watering") {
      updateControls({ watering: true, soilMoisture: 75 });
      triggerQuickAction("Đã kích hoạt hệ thống tưới và tăng độ ẩm đất lên 75%!");
    } else if (actionKey === "toggle-lights" || actionKey === "optimize-led") {
      updateControls({ lights: true, lightIntensity: 85 });
      triggerQuickAction("Đã tối ưu công suất đèn LED lên 85%!");
    } else {
      triggerQuickAction(`Đã thực hiện: ${label}`);
    }
    handleSend(`Thực hiện action: ${label}`);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-2xl card-shadow border border-outline-variant/20 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-md border-b border-outline-variant/20 flex items-center justify-between bg-surface/60 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold shadow-sm">
              <span className="material-symbols-outlined text-xl icon-filled">
                psychology
              </span>
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
          </div>
          <div>
            <h3 className="font-body-lg font-bold text-on-surface flex items-center gap-1.5">
              GrowAI Botanical Assistant
              <span className="bg-primary/10 text-primary font-label-caps text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                REAL PERSISTENCE
              </span>
            </h3>
            <p className="font-body-sm text-xs text-on-surface-variant">
              Theo dõi & Chẩn đoán sức khỏe vườn rau thời gian thực (Lưu trữ API)
            </p>
          </div>
        </div>

        <button
          onClick={() => resetChatHistory()}
          className="text-on-surface-variant hover:text-primary p-2 rounded-full hover:bg-surface-container-high transition-colors"
          title="Làm mới cuộc trò chuyện"
        >
          <span className="material-symbols-outlined text-xl">refresh</span>
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-md space-y-md bg-background/50 scroll-smooth min-h-0"
      >
        {chatHistory.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${
              msg.sender === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.sender === "ai" && (
              <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0 mt-1">
                <span className="material-symbols-outlined text-base icon-filled">
                  eco
                </span>
              </div>
            )}

            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-md space-y-2 text-body-sm leading-relaxed shadow-xs ${
                msg.sender === "user"
                  ? "bg-primary text-on-primary rounded-tr-none"
                  : "bg-surface-container-lowest text-on-surface border border-outline-variant/20 rounded-tl-none"
              }`}
            >
              {msg.image && (
                <div className="rounded-xl overflow-hidden mb-2 max-h-48">
                  <img
                    src={msg.image}
                    alt="Plant attachment"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="whitespace-pre-line">
                {msg.text.split("\n").map((line, idx) => {
                  const parts = line.split(/(\*\*.*?\*\*)/g);
                  return (
                    <p key={idx} className="min-h-[1rem]">
                      {parts.map((part, pIdx) => {
                        if (part.startsWith("**") && part.endsWith("**")) {
                          return (
                            <strong key={pIdx} className="font-bold">
                              {part.slice(2, -2)}
                            </strong>
                          );
                        }
                        return part;
                      })}
                    </p>
                  );
                })}
              </div>

              {/* Dynamic Action Buttons */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="pt-2 flex flex-wrap gap-2">
                  {msg.actions.map((act, i) => (
                    <button
                      key={i}
                      onClick={() => handleActionClick(act.actionKey, act.label)}
                      className="bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-on-primary text-xs font-semibold px-3 py-1.5 rounded-xl transition-all active:scale-95 flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">
                        play_arrow
                      </span>
                      {act.label}
                    </button>
                  ))}
                </div>
              )}

              <div
                className={`text-[10px] text-right mt-1 ${
                  msg.sender === "user" ? "text-on-primary/80" : "text-on-surface-variant"
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-3 items-center text-on-surface-variant text-xs">
            <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-base animate-pulse">
                auto_awesome
              </span>
            </div>
            <div className="bg-surface-container-lowest p-3 rounded-2xl border border-outline-variant/20 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce delay-150" />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce delay-300" />
              <span className="ml-2 font-medium">GrowAI đang xử lý dữ liệu...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className="px-md py-2 bg-surface/40 border-t border-outline-variant/10 flex gap-2 overflow-x-auto scrollbar-none flex-shrink-0">
        {suggestedPrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(prompt)}
            className="text-xs font-medium bg-surface-container-low hover:bg-primary/10 hover:text-primary text-on-surface-variant px-3 py-1.5 rounded-full border border-outline-variant/30 whitespace-nowrap transition-colors flex-shrink-0"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Attached Image Preview */}
      {attachedImage && (
        <div className="px-md py-2 bg-surface border-t border-outline-variant/20 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg overflow-hidden border border-primary">
              <img
                src={attachedImage}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-xs font-medium text-on-surface">
              Hình ảnh đã đính kèm (Phân tích lá bệnh)
            </span>
          </div>
          <button
            onClick={() => setAttachedImage(null)}
            className="text-on-surface-variant hover:text-error text-xs p-1"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* Input Form Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-md bg-surface border-t border-outline-variant/20 flex items-center gap-sm flex-shrink-0"
      >
        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleImageUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-on-surface-variant hover:text-primary hover:bg-surface-container-high p-2 rounded-xl transition-colors"
          title="Tải ảnh lá cây để phân tích sâu bệnh"
        >
          <span className="material-symbols-outlined text-2xl">add_photo_alternate</span>
        </button>

        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Hỏi GrowAI về độ ẩm, nhiệt độ, sức khỏe cây trồng..."
          className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-body-sm font-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-all"
        />

        <button
          type="submit"
          disabled={!inputVal.trim() && !attachedImage}
          className="bg-primary text-on-primary p-3 rounded-xl hover:bg-primary-container disabled:opacity-50 transition-all shadow-sm active:scale-95 flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-xl">send</span>
        </button>
      </form>
    </div>
  );
}
