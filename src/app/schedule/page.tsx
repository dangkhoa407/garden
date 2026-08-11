"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useGarden } from "@/context/GardenContext";

export type ActionType = "INSPECT" | "FERTILIZE" | "SPRAY_ALL";

export interface ScheduleItem {
  id: string;
  title: string;
  actions?: ActionType[];
  actionType?: ActionType;
  actionLabel?: string;
  icon?: string;
  scheduleType: "once" | "repeating";
  date?: string;
  repeatDays?: string[];
  time: string;
  location?: string;
  enabled: boolean;
  status: "upcoming" | "active" | "completed";
  lastRun?: string;
  createdAt?: string;
}

const ACTION_OPTIONS: {
  type: ActionType;
  title: string;
  desc: string;
  icon: string;
  badge: string;
  color: string;
}[] = [
  {
    type: "INSPECT",
    title: "Kiểm tra sâu hại",
    desc: "Chụp 6 điểm bằng camera & phân tích hình ảnh qua AI Gemini (Phím k)",
    icon: "bug_report",
    badge: "Phím k",
    color: "from-emerald-500/10 to-teal-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  },
  {
    type: "FERTILIZE",
    title: "Tưới Phân",
    desc: "Kích hoạt Popup/tiến trình tưới phân tự động (Tùy chỉnh ml hoặc Phối trộn AI)",
    icon: "water_drop",
    badge: "ESP32",
    color: "from-cyan-500/10 to-blue-500/10 border-cyan-500/30 text-cyan-700 dark:text-cyan-400",
  },
  {
    type: "SPRAY_ALL",
    title: "Phun toàn bộ vườn",
    desc: "Kích hoạt hệ thống phun dung dịch sinh học trên toàn bộ các khay (Phím p)",
    icon: "shower",
    badge: "Phím p",
    color: "from-teal-500/10 to-emerald-500/10 border-teal-500/30 text-teal-700 dark:text-teal-400",
  },
];

const DAYS_OF_WEEK = [
  { key: "T2", label: "Thứ 2" },
  { key: "T3", label: "Thứ 3" },
  { key: "T4", label: "Thứ 4" },
  { key: "T5", label: "Thứ 5" },
  { key: "T6", label: "Thứ 6" },
  { key: "T7", label: "Thứ 7" },
  { key: "CN", label: "Chủ Nhật" },
];

export default function SchedulePage() {
  const { controls, plants } = useGarden();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upcoming" | "completed">("all");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Form State - Selected Actions Array (preserves execution order)
  const [selectedActions, setSelectedActions] = useState<ActionType[]>(["INSPECT"]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newScheduleType, setNewScheduleType] = useState<"once" | "repeating">("once");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [newTime, setNewTime] = useState("08:00");
  const [newRepeatDays, setNewRepeatDays] = useState<string[]>(["T2", "T4", "T6"]);
  const [newLocation, setNewLocation] = useState("Toàn bộ khu vườn");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/schedules");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSchedules(data);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSchedule = async (id: string, currentEnabled: boolean) => {
    setSchedules((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              enabled: !currentEnabled,
              status: !currentEnabled ? "upcoming" : "completed",
            }
          : s
      )
    );

    try {
      await fetch(`/api/schedules/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: !currentEnabled,
          status: !currentEnabled ? "upcoming" : "completed",
        }),
      });
    } catch (e) {
      console.error(e);
      fetchSchedules();
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa lịch trình này?")) return;

    setSchedules((prev) => prev.filter((s) => s.id !== id));

    try {
      await fetch(`/api/schedules/${id}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.error(e);
      fetchSchedules();
    }
  };

  const handleDayToggle = (dayKey: string) => {
    setNewRepeatDays((prev) =>
      prev.includes(dayKey) ? prev.filter((d) => d !== dayKey) : [...prev, dayKey]
    );
  };

  // Toggle selection of an action
  const handleActionToggle = (actionType: ActionType) => {
    if (selectedActions.includes(actionType)) {
      if (selectedActions.length === 1) {
        alert("Vui lòng chọn ít nhất 1 chức năng!");
        return;
      }
      setSelectedActions(selectedActions.filter((a) => a !== actionType));
    } else {
      setSelectedActions([...selectedActions, actionType]);
    }
  };

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const updated = [...selectedActions];
    const itemToMove = updated[draggedIndex];
    updated.splice(draggedIndex, 1);
    updated.splice(index, 0, itemToMove);

    setDraggedIndex(index);
    setSelectedActions(updated);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTime) return;
    if (selectedActions.length === 0) {
      alert("Vui lòng chọn ít nhất 1 chức năng!");
      return;
    }
    if (newScheduleType === "repeating" && newRepeatDays.length === 0) {
      alert("Vui lòng chọn ít nhất 1 ngày trong tuần cho lịch lặp lại!");
      return;
    }

    setIsSubmitting(true);
    try {
      const defaultTitle = selectedActions
        .map((a) => ACTION_OPTIONS.find((opt) => opt.type === a)?.title)
        .join(" ➔ ");

      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim() || defaultTitle,
          actions: selectedActions,
          actionType: selectedActions[0],
          scheduleType: newScheduleType,
          date: newScheduleType === "once" ? newDate : "",
          repeatDays: newScheduleType === "repeating" ? newRepeatDays : [],
          time: newTime,
          location: newLocation.trim() || "Toàn bộ khu vườn",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.schedules) {
          setSchedules(data.schedules);
        }
        setShowModal(false);
        setNewTitle("");
        setSelectedActions(["INSPECT"]);
        setNewScheduleType("once");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSchedules = schedules.filter((s) => {
    if (filter === "upcoming") return s.enabled && s.status !== "completed";
    if (filter === "completed") return !s.enabled || s.status === "completed";
    return true;
  });

  const activeRunningTask = schedules.find((s) => s.enabled && s.status === "active");

  // Order all actions list: selected ones first in selectedActions order, then unselected ones
  const allActionsOrdered = [
    ...selectedActions.map((type) => ACTION_OPTIONS.find((opt) => opt.type === type)!),
    ...ACTION_OPTIONS.filter((opt) => !selectedActions.includes(opt.type)),
  ];

  return (
    <div className="space-y-lg max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-md">
        <div>
          <h2 className="font-display-lg text-display-lg font-bold text-primary mb-1">
            Lịch Trình Quản Lý
          </h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Tự động hóa chăm sóc vườn theo khung giờ • Kéo thả đổi thứ tự chạy các chức năng
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-md flex items-center justify-center gap-2 active:scale-95"
        >
          <span className="material-symbols-outlined font-bold">add_task</span>
          Lên lịch mới
        </button>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-12 gap-gutter">
        {/* Main Schedule List (Span 8) */}
        <div className="col-span-12 xl:col-span-8 space-y-4">
          {/* Status Filter Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase transition-all ${
                filter === "all"
                  ? "bg-primary text-white shadow-sm"
                  : "bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              TẤT CẢ ({schedules.length})
            </button>
            <button
              onClick={() => setFilter("upcoming")}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase transition-all ${
                filter === "upcoming"
                  ? "bg-primary text-white shadow-sm"
                  : "bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              SẮP TỚI ({schedules.filter((s) => s.enabled && s.status !== "completed").length})
            </button>
            <button
              onClick={() => setFilter("completed")}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase transition-all ${
                filter === "completed"
                  ? "bg-primary text-white shadow-sm"
                  : "bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              HOÀN THÀNH / ĐÃ TẮT ({schedules.filter((s) => !s.enabled || s.status === "completed").length})
            </button>
          </div>

          {/* Active Running Task Banner */}
          {activeRunningTask && (
            <div className="bg-gradient-to-r from-emerald-950/20 via-teal-900/10 to-primary/10 rounded-2xl p-4 border-2 border-emerald-500/40 shadow-sm relative overflow-hidden flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl animate-spin">
                    sync
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-on-surface">
                      {activeRunningTask.title}
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-500 text-white font-mono text-[10px] font-extrabold rounded-full animate-pulse">
                      ĐANG DIỄN RA
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Khung giờ {activeRunningTask.time} • {activeRunningTask.location}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Schedule Cards List */}
          {loading ? (
            <div className="p-8 text-center text-on-surface-variant font-medium animate-pulse">
              Đang tải danh sách lịch trình tự động...
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="p-12 text-center bg-surface-container-low rounded-2xl border border-dashed border-outline-variant/40 space-y-3">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">
                event_busy
              </span>
              <p className="text-sm font-semibold text-on-surface-variant">
                Chưa có lịch trình nào trong danh mục này
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-primary/10 text-primary font-bold text-xs rounded-xl hover:bg-primary/20 transition-all"
              >
                + Thêm lịch trình mới ngay
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSchedules.map((item) => {
                const itemActions: ActionType[] = Array.isArray(item.actions) && item.actions.length > 0
                  ? item.actions
                  : [item.actionType || "INSPECT"];

                const firstMeta = ACTION_OPTIONS.find((a) => a.type === itemActions[0]) || ACTION_OPTIONS[0];

                return (
                  <div
                    key={item.id}
                    className={`bg-surface rounded-2xl p-4 border transition-all shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      item.enabled
                        ? "border-outline-variant/30 hover:border-primary/40"
                        : "border-outline-variant/20 opacity-60 bg-surface-container-lowest"
                    }`}
                  >
                    {/* Left: Time & Actions Sequence */}
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Time display */}
                      <div className="text-center min-w-[65px] px-2.5 py-2 bg-surface-container-high rounded-xl border border-outline-variant/20 flex-shrink-0">
                        <div className="font-mono text-base font-black text-primary leading-none">
                          {item.time}
                        </div>
                        <div className="text-[10px] font-bold text-on-surface-variant uppercase mt-1">
                          {Number(item.time.split(":")[0]) >= 12 ? "Chiều" : "Sáng"}
                        </div>
                      </div>

                      {/* Icon */}
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${firstMeta.color}`}>
                        <span className="material-symbols-outlined text-xl font-bold">
                          {firstMeta.icon}
                        </span>
                      </div>

                      {/* Title & Sequence */}
                      <div className="min-w-0 space-y-1">
                        <h4 className={`font-bold text-sm truncate ${item.enabled ? "text-on-surface" : "text-on-surface-variant line-through"}`}>
                          {item.title}
                        </h4>

                        {/* Sequence of actions */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-bold text-on-surface-variant">Thứ tự chạy:</span>
                          {itemActions.map((actType, idx) => {
                            const meta = ACTION_OPTIONS.find((a) => a.type === actType);
                            return (
                              <div key={idx} className="flex items-center gap-1">
                                {idx > 0 && <span className="text-xs text-primary font-bold">➔</span>}
                                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold rounded-lg border border-emerald-500/20 flex items-center gap-1">
                                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[9px] font-mono flex items-center justify-center font-bold">
                                    {idx + 1}
                                  </span>
                                  {meta?.title}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-on-surface-variant flex-wrap font-medium">
                          <span>📍 {item.location}</span>
                          <span>•</span>
                          {item.scheduleType === "repeating" ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                              🔄 Lặp lại: {(item.repeatDays || []).join(", ")}
                            </span>
                          ) : (
                            <span className="text-blue-600 dark:text-blue-400 font-bold">
                              📅 Chạy 1 lần: {item.date || "Hôm nay"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Toggle Switch & Delete */}
                    <div className="flex items-center gap-3 flex-shrink-0 self-end md:self-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => handleToggleSchedule(item.id, item.enabled)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                      </label>

                      <button
                        onClick={() => handleDeleteSchedule(item.id)}
                        className="p-2 text-on-surface-variant/60 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                        title="Xóa lịch trình"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side Panel: Action Button Preview & Environment Info (Span 4) */}
        <div className="col-span-12 xl:col-span-4 space-y-gutter">
          <div className="bg-surface rounded-2xl p-5 border border-outline-variant/30 space-y-4 shadow-xs">
            <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">touch_app</span>
              3 NÚT ĐIỀU KHIỂN HỆ THỐNG
            </h3>

            <div className="space-y-2.5">
              {ACTION_OPTIONS.map((opt) => (
                <div
                  key={opt.type}
                  className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base text-primary">
                        {opt.icon}
                      </span>
                      {opt.title}
                    </span>
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-mono font-bold rounded">
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-tight">
                    {opt.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Sensor Data Snapshot */}
          <div className="bg-primary-container/10 rounded-2xl p-md border border-primary/20 relative overflow-hidden">
            <div className="absolute -bottom-8 -right-8 opacity-10 pointer-events-none">
              <span className="material-symbols-outlined text-[130px] text-primary">
                eco
              </span>
            </div>
            <h3 className="font-label-caps text-label-caps text-primary uppercase mb-4 font-bold">
              Môi trường hiện tại
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block mb-1">
                  Nhiệt độ
                </span>
                <div className="font-stat-value text-headline-md font-bold text-on-surface">
                  {controls.temperature}°C
                </div>
              </div>
              <div>
                <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block mb-1">
                  Độ ẩm đất
                </span>
                <div className="font-stat-value text-headline-md font-bold text-on-surface">
                  {controls.soilMoisture}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CREATE NEW SCHEDULE MODAL VIA PORTAL */}
      {showModal &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-surface rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-outline-variant/30 space-y-5 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
                <div className="flex items-center gap-2 text-primary font-bold text-lg">
                  <span className="material-symbols-outlined text-2xl">alarm_add</span>
                  Thêm Lịch Trình Tự Động Mới
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-on-surface-variant hover:text-primary p-1 rounded-lg hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateSchedule} className="space-y-4">
                {/* 1. CHỌN NHIỀU CHỨC NĂNG & KÉO THẢ ĐỔI THỨ TỰ */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface">
                      1. CHỌN CÁC CHỨC NĂNG & KÉO THẢ ĐỔI THỨ TỰ:
                    </label>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">drag_indicator</span>
                      Kéo thả để sắp xếp
                    </span>
                  </div>

                  <div className="space-y-2">
                    {allActionsOrdered.map((opt) => {
                      const isSelected = selectedActions.includes(opt.type);
                      const orderNum = isSelected ? selectedActions.indexOf(opt.type) + 1 : null;
                      const actionIdx = isSelected ? selectedActions.indexOf(opt.type) : -1;
                      const isDragging = isSelected && draggedIndex === actionIdx;

                      return (
                        <div
                          key={opt.type}
                          draggable={isSelected}
                          onDragStart={(e) => isSelected && handleDragStart(e, actionIdx)}
                          onDragOver={(e) => isSelected && handleDragOver(e, actionIdx)}
                          onDragEnd={handleDragEnd}
                          className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                            isSelected
                              ? "bg-primary/10 border-primary shadow-xs cursor-grab active:cursor-grabbing"
                              : "bg-surface-container-low border-outline-variant/30 hover:border-primary/30"
                          } ${isDragging ? "opacity-40 border-dashed scale-95" : ""}`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Drag Handle Icon for selected items */}
                            {isSelected ? (
                              <span className="material-symbols-outlined text-on-surface-variant/50 hover:text-primary cursor-grab select-none">
                                drag_indicator
                              </span>
                            ) : (
                              <div className="w-5" />
                            )}

                            {/* Number Badge at the Front */}
                            {isSelected ? (
                              <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-extrabold text-xs flex items-center justify-center flex-shrink-0 shadow-xs">
                                {orderNum}
                              </div>
                            ) : (
                              <div className="w-7 h-7 rounded-full border-2 border-outline-variant/40 flex-shrink-0" />
                            )}

                            {/* Action Checkbox & Info */}
                            <div
                              onClick={() => handleActionToggle(opt.type)}
                              className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 select-none"
                            >
                              <div
                                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                  isSelected
                                    ? "bg-primary border-primary text-white"
                                    : "border-outline-variant bg-surface"
                                }`}
                              >
                                {isSelected && (
                                  <span className="material-symbols-outlined text-xs font-bold">
                                    check
                                  </span>
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="font-bold text-xs text-on-surface flex items-center gap-2">
                                  <span>{opt.title}</span>
                                  <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant text-[10px] font-mono font-bold rounded">
                                    {opt.badge}
                                  </span>
                                </div>
                                <div className="text-[11px] text-on-surface-variant truncate max-w-[240px]">
                                  {opt.desc}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Tên lịch trình */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    TÊN LỊCH TRÌNH
                  </label>
                  <input
                    type="text"
                    placeholder={
                      selectedActions.length > 0
                        ? selectedActions.map((a) => ACTION_OPTIONS.find((o) => o.type === a)?.title).join(" ➔ ")
                        : "Nhập tên lịch trình"
                    }
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {/* 3. Loại Lịch Trình (Chạy 1 lần vs Lặp lại) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                    2. LOẠI LỊCH TRÌNH:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewScheduleType("once")}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        newScheduleType === "once"
                          ? "bg-primary text-white border-primary shadow-xs"
                          : "bg-surface-container-low border-outline-variant/30 text-on-surface-variant"
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">event</span>
                      Chạy 1 Lần
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewScheduleType("repeating")}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        newScheduleType === "repeating"
                          ? "bg-primary text-white border-primary shadow-xs"
                          : "bg-surface-container-low border-outline-variant/30 text-on-surface-variant"
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">update</span>
                      Lặp Lại Hàng Tuần
                    </button>
                  </div>
                </div>

                {/* Conditional Field: Date vs Days of Week */}
                {newScheduleType === "once" ? (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                      NGÀY THỰC THI (YYYY-MM-DD)
                    </label>
                    <input
                      type="date"
                      required
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                      CHỌN CÁC THỨ TRONG TUẦN:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS_OF_WEEK.map((d) => {
                        const isSelected = newRepeatDays.includes(d.key);
                        return (
                          <button
                            key={d.key}
                            type="button"
                            onClick={() => handleDayToggle(d.key)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                              isSelected
                                ? "bg-emerald-600 text-white shadow-xs"
                                : "bg-surface-container-low border border-outline-variant/30 text-on-surface-variant"
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 4. Giờ chạy & Khu vực (Cây trồng từ /plants) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                      GIỜ CHẠY (HH:MM)
                    </label>
                    <input
                      type="time"
                      required
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-xs font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                      KHU VỰC / CÂY TRỒNG (/PLANTS)
                    </label>
                    <select
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary text-on-surface cursor-pointer"
                    >
                      <option value="Toàn bộ khu vườn">🌿 Toàn bộ khu vườn (Tất cả cây)</option>
                      {plants && plants.length > 0 && (
                        <optgroup label="Cây trồng đã thêm (/plants)">
                          {plants.map((p) => {
                            const val = `${p.name} (${p.location})`;
                            return (
                              <option key={p.id} value={val}>
                                🌱 {p.name} - {p.location} ({p.category})
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex justify-end gap-3 pt-3 border-t border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || selectedActions.length === 0}
                    className="px-6 py-2.5 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? "Đang lưu..." : "Tạo Lịch Trình Tự Động"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
