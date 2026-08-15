"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useGarden } from "@/context/GardenContext";

export type ActionType = "INSPECT" | "FERTILIZE" | "FERTILIZE_AI" | "FERTILIZE_CUSTOM" | "SPRAY_ALL";

export interface CustomDosageItem {
  tankCode: string;
  ml: number;
  name?: string;
}

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
  customDosages?: CustomDosageItem[];
}

export interface DateTimeSlot {
  date: string;
  time: string;
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
      desc: "Hệ thống sẽ kiểm tra toàn bộ vườn rau để phát hiện sâu bệnh.",
      icon: "bug_report",
      badge: "Tự động",
      color: "from-emerald-500/10 to-teal-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
    },
    {
      type: "FERTILIZE",
      title: "Tưới Phân",
      desc: "Tưới phân bằng AI Gemini hoặc tùy chỉnh dung tích ml cho từng bình phân.",
      icon: "water_drop",
      badge: "AI / Tùy chỉnh",
      color: "from-cyan-500/10 to-blue-500/10 border-cyan-500/30 text-cyan-700 dark:text-cyan-400",
    },
    {
      type: "SPRAY_ALL",
      title: "Phun toàn bộ vườn",
      desc: "Hệ thống sẽ phun thuốc sinh học phổ rộng ở toàn bộ vườn rau.",
      icon: "shower",
      badge: "Tự động",
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

function timeToMinutes(tStr: string): number {
  if (!tStr || !tStr.includes(":")) return 0;
  const [h, m] = tStr.split(":").map(Number);
  return h * 60 + m;
}

function getDayOfWeekFromDateStr(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const dayMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return dayMap[d.getDay()];
}

export default function SchedulePage() {
  const { controls, plants } = useGarden();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upcoming" | "completed">("all");

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Form State
  const [selectedActions, setSelectedActions] = useState<ActionType[]>(["INSPECT"]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newScheduleType, setNewScheduleType] = useState<"once" | "repeating">("once");

  // Single Row Combined Date + Time for "Once" mode
  const todayStr = new Date().toISOString().split("T")[0];
  const [slotDateInput, setSlotDateInput] = useState(todayStr);
  const [slotTimeInput, setSlotTimeInput] = useState("08:00");
  const [dateTimeSlots, setDateTimeSlots] = useState<DateTimeSlot[]>([
    { date: todayStr, time: "08:00" },
  ]);

  // Multiple time slots for "Repeating" mode
  const [repeatTimeInput, setRepeatTimeInput] = useState("08:00");
  const [repeatTimes, setRepeatTimes] = useState<string[]>(["08:00"]);

  const [newRepeatDays, setNewRepeatDays] = useState<string[]>(["T2", "T4", "T6"]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>(["Toàn bộ khu vườn"]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fertilize Sub-Modal & Mode State
  const [fertilizeMode, setFertilizeMode] = useState<"AI" | "CUSTOM">("AI");
  const [showFertilizeSubModal, setShowFertilizeSubModal] = useState(false);

  // Custom Dosage State for FERTILIZE_CUSTOM mode
  const [customDosages, setCustomDosages] = useState<{ [tankCode: string]: { enabled: boolean; ml: number; name: string } }>({
    "Bình A": { enabled: true, ml: 2.0, name: "Phân A" },
    "Bình B": { enabled: true, ml: 2.0, name: "Phân B" },
    "Bình C": { enabled: false, ml: 2.0, name: "Phân C" },
  });

  useEffect(() => {
    setMounted(true);
    fetchSchedules();
    fetchFertilizers();
  }, []);

  const fetchFertilizers = async () => {
    try {
      const res = await fetch("/api/fertilizers");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const map: { [tankCode: string]: { enabled: boolean; ml: number; name: string } } = {};
          data.forEach((f: any) => {
            if (f.tankCode) {
              map[f.tankCode] = { enabled: true, ml: 2.0, name: f.name || f.tankCode };
            }
          });
          setCustomDosages(map);
        }
      }
    } catch (e) {}
  };

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

  // Multi-location selection handler
  const handleLocationToggle = (loc: string) => {
    if (loc === "Toàn bộ khu vườn") {
      setSelectedLocations(["Toàn bộ khu vườn"]);
    } else {
      let updated = selectedLocations.filter((l) => l !== "Toàn bộ khu vườn");
      if (updated.includes(loc)) {
        updated = updated.filter((l) => l !== loc);
      } else {
        updated.push(loc);
      }

      if (updated.length === 0) {
        setSelectedLocations(["Toàn bộ khu vườn"]);
      } else {
        setSelectedLocations(updated);
      }
    }
  };

  // Combined Date + Time Slot Handlers for "Once" mode
  const handleAddSlot = () => {
    if (!slotDateInput || !slotTimeInput) return;
    const exists = dateTimeSlots.some(
      (s) => s.date === slotDateInput && s.time === slotTimeInput
    );
    if (!exists) {
      const updated = [
        ...dateTimeSlots,
        { date: slotDateInput, time: slotTimeInput },
      ].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          timeToMinutes(a.time) - timeToMinutes(b.time)
      );
      setDateTimeSlots(updated);
    }
  };

  const handleRemoveSlot = (index: number) => {
    if (dateTimeSlots.length === 1) {
      alert("Cần có ít nhất 1 mốc thời gian thực thi!");
      return;
    }
    setDateTimeSlots(dateTimeSlots.filter((_, idx) => idx !== index));
  };

  // Multiple Time Handlers for "Repeating" mode
  const handleAddRepeatTime = () => {
    if (!repeatTimeInput) return;
    if (!repeatTimes.includes(repeatTimeInput)) {
      setRepeatTimes([...repeatTimes, repeatTimeInput].sort());
    }
  };

  const handleRemoveRepeatTime = (tStr: string) => {
    if (repeatTimes.length === 1) {
      alert("Cần có ít nhất 1 khung giờ thực thi!");
      return;
    }
    setRepeatTimes(repeatTimes.filter((t) => t !== tStr));
  };

  // Action Checkbox Toggle
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

  // Drag and Drop handlers
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

  // 15-MINUTE BUFFER CONFLICT VALIDATOR
  const getConflictError = (): string | null => {
    const enabledSchedules = schedules.filter((s) => s.enabled);

    if (newScheduleType === "once") {
      // 1. Internal check within dateTimeSlots
      for (let i = 0; i < dateTimeSlots.length; i++) {
        for (let j = i + 1; j < dateTimeSlots.length; j++) {
          if (dateTimeSlots[i].date === dateTimeSlots[j].date) {
            const diff = Math.abs(
              timeToMinutes(dateTimeSlots[i].time) - timeToMinutes(dateTimeSlots[j].time)
            );
            if (diff < 15) {
              return `Mốc thời gian ${dateTimeSlots[i].date} [${dateTimeSlots[i].time}] và [${dateTimeSlots[j].time}] quá gần nhau (cách ${diff} phút < 15 phút).`;
            }
          }
        }
      }

      // 2. External check against active enabled schedules
      for (const slot of dateTimeSlots) {
        const slotMin = timeToMinutes(slot.time);
        const slotDow = getDayOfWeekFromDateStr(slot.date);

        for (const exist of enabledSchedules) {
          const existMin = timeToMinutes(exist.time);
          const diff = Math.abs(slotMin - existMin);

          if (diff >= 15) continue;

          let overlap = false;
          if (exist.scheduleType === "once") {
            if (exist.date === slot.date) overlap = true;
          } else if (exist.scheduleType === "repeating") {
            if (Array.isArray(exist.repeatDays) && exist.repeatDays.includes(slotDow)) {
              overlap = true;
            }
          }

          if (overlap) {
            return `Mốc ${slot.date} ${slot.time} xung đột với lịch "${exist.title}" (${exist.time}) [khoảng cách ${diff} phút < 15 phút]!`;
          }
        }
      }
    } else {
      // newScheduleType === "repeating"
      // 1. Internal check within repeatTimes
      const sorted = [...repeatTimes].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
      for (let i = 0; i < sorted.length - 1; i++) {
        const diff = timeToMinutes(sorted[i + 1]) - timeToMinutes(sorted[i]);
        if (diff < 15) {
          return `Hai khung giờ lặp lại (${sorted[i]} và ${sorted[i + 1]}) quá gần nhau (cách ${diff} phút < 15 phút).`;
        }
      }

      // 2. External check
      for (const rTime of repeatTimes) {
        const rMin = timeToMinutes(rTime);

        for (const exist of enabledSchedules) {
          const existMin = timeToMinutes(exist.time);
          const diff = Math.abs(rMin - existMin);

          if (diff >= 15) continue;

          let overlap = false;
          for (const rDay of newRepeatDays) {
            if (exist.scheduleType === "repeating") {
              if (Array.isArray(exist.repeatDays) && exist.repeatDays.includes(rDay)) {
                overlap = true;
                break;
              }
            } else if (exist.scheduleType === "once") {
              const existDow = getDayOfWeekFromDateStr(exist.date || "");
              if (existDow === rDay) {
                overlap = true;
                break;
              }
            }
          }

          if (overlap) {
            return `Khung giờ lặp lại ${rTime} bị xung đột với lịch "${exist.title}" (${exist.time}) [khoảng cách ${diff} phút < 15 phút]!`;
          }
        }
      }
    }

    return null;
  };

  const conflictError = getConflictError();

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedActions.length === 0) {
      alert("Vui lòng chọn ít nhất 1 chức năng!");
      return;
    }
    if (newScheduleType === "once" && dateTimeSlots.length === 0) {
      alert("Vui lòng thêm ít nhất 1 mốc ngày giờ thực thi!");
      return;
    }
    if (newScheduleType === "repeating" && repeatTimes.length === 0) {
      alert("Vui lòng thêm ít nhất 1 khung giờ chạy!");
      return;
    }
    if (newScheduleType === "repeating" && newRepeatDays.length === 0) {
      alert("Vui lòng chọn ít nhất 1 ngày trong tuần!");
      return;
    }
    if (conflictError) {
      alert(`Không thể lưu lịch trình do xung đột 15 phút:\n${conflictError}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const mappedActions = selectedActions.map((a) => {
        if (a === "FERTILIZE") {
          return fertilizeMode === "AI" ? "FERTILIZE_AI" : "FERTILIZE_CUSTOM";
        }
        return a;
      });

      const activeDosages = fertilizeMode === "CUSTOM"
        ? Object.entries(customDosages)
          .filter(([_, val]) => val.enabled)
          .map(([tankCode, val]) => ({ tankCode, ml: val.ml, name: val.name }))
        : [];

      const defaultTitle = selectedActions
        .map((a) => {
          if (a === "FERTILIZE") {
            if (fertilizeMode === "AI") return "Tưới Phân AI (Gemini)";
            const doseStr = activeDosages.map((d) => `${d.tankCode} ${d.ml}ml`).join(", ");
            return `Tưới Phân Tùy Chỉnh (${doseStr || "Bình A, B"})`;
          }
          return ACTION_OPTIONS.find((opt) => opt.type === a)?.title;
        })
        .join(" ➔ ");

      const locationStr = selectedLocations.join(", ");

      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim() || defaultTitle,
          actions: mappedActions,
          actionType: mappedActions[0],
          customDosages: activeDosages,
          scheduleType: newScheduleType,
          slots: newScheduleType === "once" ? dateTimeSlots : [],
          repeatDays: newScheduleType === "repeating" ? newRepeatDays : [],
          times: newScheduleType === "repeating" ? repeatTimes : [],
          location: locationStr || "Toàn bộ khu vườn",
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
        setDateTimeSlots([{ date: todayStr, time: "08:00" }]);
        setRepeatTimes(["08:00"]);
        setSelectedLocations(["Toàn bộ khu vườn"]);
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
            Tự động hóa chăm sóc vườn • Ghép chung ngày giờ linh hoạt & chống xung đột 15 phút
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
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase transition-all ${filter === "all"
                ? "bg-primary text-white shadow-sm"
                : "bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
                }`}
            >
              TẤT CẢ ({schedules.length})
            </button>
            <button
              onClick={() => setFilter("upcoming")}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase transition-all ${filter === "upcoming"
                ? "bg-primary text-white shadow-sm"
                : "bg-surface-container-low border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high"
                }`}
            >
              SẮP TỚI ({schedules.filter((s) => s.enabled && s.status !== "completed").length})
            </button>
            <button
              onClick={() => setFilter("completed")}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase transition-all ${filter === "completed"
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
                    className={`bg-surface rounded-2xl p-4 border transition-all shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 ${item.enabled
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
                            const meta = ACTION_OPTIONS.find((a) => a.type === actType) ||
                              (actType === "FERTILIZE" ? ACTION_OPTIONS.find((a) => a.type === "FERTILIZE_AI") : null);
                            const actionTitle = meta?.title || (actType === "FERTILIZE" ? "Tưới Phân AI" : actType);
                            const isCustom = actType === "FERTILIZE_CUSTOM" && Array.isArray(item.customDosages) && item.customDosages.length > 0;
                            const dosageText = isCustom ? ` (${item.customDosages!.map(d => `${d.tankCode}: ${d.ml}ml`).join(", ")})` : "";

                            return (
                              <div key={idx} className="flex items-center gap-1">
                                {idx > 0 && <span className="text-xs text-primary font-bold">➔</span>}
                                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold rounded-lg border border-emerald-500/20 flex items-center gap-1">
                                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[9px] font-mono flex items-center justify-center font-bold">
                                    {idx + 1}
                                  </span>
                                  {actionTitle}{dosageText}
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

              {/* CONFLICT ALERT BANNER */}
              {conflictError && (
                <div className="p-3 bg-red-500/10 border border-red-500/40 rounded-2xl text-red-600 dark:text-red-400 text-xs font-bold flex items-start gap-2 animate-pulse">
                  <span className="material-symbols-outlined text-base flex-shrink-0 mt-0.5">
                    warning
                  </span>
                  <div>
                    <div className="font-extrabold uppercase">Xung đột lịch trình (Dưới 15 phút):</div>
                    <div className="font-medium text-[11px] mt-0.5">{conflictError}</div>
                  </div>
                </div>
              )}

              <form onSubmit={handleCreateSchedule} className="space-y-4">
                {/* 1. CHỌN CÁC CHỨC NĂNG & KÉO THẢ ĐỔI THỨ TỰ */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface">
                      1. CHỌN CÁC CHỨC NĂNG:
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
                          className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${isSelected
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
                                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isSelected
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

                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-xs text-on-surface flex items-center gap-2">
                                  <span>{opt.title}</span>
                                  <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant text-[10px] font-mono font-bold rounded">
                                    {opt.type === "FERTILIZE"
                                      ? (fertilizeMode === "AI" ? "🤖 AI Gemini" : "🧪 Tùy chỉnh")
                                      : opt.badge}
                                  </span>
                                </div>
                                <div className="text-[11px] text-on-surface-variant truncate max-w-[240px]">
                                  {opt.desc}
                                </div>
                              </div>
                            </div>

                            {/* Setting Button for FERTILIZE */}
                            {opt.type === "FERTILIZE" && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isSelected) {
                                    handleActionToggle("FERTILIZE");
                                  }
                                  setShowFertilizeSubModal(true);
                                }}
                                className="px-2.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-cyan-500/30 flex-shrink-0 shadow-2xs active:scale-95"
                              >
                                <span className="material-symbols-outlined text-base">settings</span>
                                <span>{fertilizeMode === "AI" ? "Cài đặt (AI)" : "Cài đặt (Tùy chỉnh)"}</span>
                              </button>
                            )}
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
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${newScheduleType === "once"
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
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${newScheduleType === "repeating"
                        ? "bg-primary text-white border-primary shadow-xs"
                        : "bg-surface-container-low border-outline-variant/30 text-on-surface-variant"
                        }`}
                    >
                      <span className="material-symbols-outlined text-base">update</span>
                      Hàng Tuần
                    </button>
                  </div>
                </div>

                {/* Conditional Field: Date + Time Row for Once mode vs Days + Time for Repeating mode */}
                {newScheduleType === "once" ? (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                        THỜI GIAN THỰC THI
                      </label>
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        Đã chọn {dateTimeSlots.length} mốc
                      </span>
                    </div>

                    {/* Combined Single Row Input: Date + Time + Button */}
                    <div className="flex flex-col sm:flex-row gap-2 mb-2">
                      <input
                        type="date"
                        value={slotDateInput}
                        onChange={(e) => setSlotDateInput(e.target.value)}
                        className="flex-1 px-3 py-2 bg-surface-container-low border border-outline-variant/40 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <input
                        type="time"
                        value={slotTimeInput}
                        onChange={(e) => setSlotTimeInput(e.target.value)}
                        className="w-full sm:w-32 px-3 py-2 bg-surface-container-low border border-outline-variant/40 rounded-xl text-xs font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={handleAddSlot}
                        className="px-3.5 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <span className="material-symbols-outlined text-sm">add_alarm</span>
                        Thêm mốc
                      </button>
                    </div>

                    {/* Selected DateTime Chips List */}
                    <div className="flex flex-wrap gap-1.5 p-2.5 bg-surface-container-low rounded-2xl border border-outline-variant/20 max-h-[120px] overflow-y-auto">
                      {dateTimeSlots.map((slot, idx) => (
                        <span
                          key={`${slot.date}-${slot.time}-${idx}`}
                          className="px-3 py-1.5 bg-gradient-to-r from-blue-500/10 to-teal-500/10 text-blue-700 dark:text-blue-300 text-xs font-mono font-bold rounded-xl border border-blue-500/20 flex items-center gap-2 shadow-xs"
                        >
                          <span>📅 {slot.date}</span>
                          <span>•</span>
                          <span>⏰ {slot.time} ({Number(slot.time.split(":")[0]) >= 12 ? "Chiều" : "Sáng"})</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSlot(idx)}
                            className="hover:text-red-500 transition-colors ml-1"
                          >
                            <span className="material-symbols-outlined text-xs">close</span>
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Days of Week */}
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
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isSelected
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

                    {/* Time Input for Repeating */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                          GIỜ CHẠY TRONG NGÀY
                        </label>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                          Đã chọn {repeatTimes.length} khung giờ
                        </span>
                      </div>

                      <div className="flex gap-2 mb-2">
                        <input
                          type="time"
                          value={repeatTimeInput}
                          onChange={(e) => setRepeatTimeInput(e.target.value)}
                          className="flex-1 px-3 py-2 bg-surface-container-low border border-outline-variant/40 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={handleAddRepeatTime}
                          className="px-3.5 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <span className="material-symbols-outlined text-sm">schedule</span>
                          Thêm giờ
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 p-2.5 bg-surface-container-low rounded-2xl border border-outline-variant/20 max-h-[100px] overflow-y-auto">
                        {repeatTimes.map((tStr) => (
                          <span
                            key={tStr}
                            className="px-3 py-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-mono font-bold rounded-xl border border-emerald-500/20 flex items-center gap-2"
                          >
                            ⏰ {tStr} ({Number(tStr.split(":")[0]) >= 12 ? "Chiều" : "Sáng"})
                            <button
                              type="button"
                              onClick={() => handleRemoveRepeatTime(tStr)}
                              className="hover:text-red-500 transition-colors"
                            >
                              <span className="material-symbols-outlined text-xs">close</span>
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. KHU VỰC / CÂY TRỒNG */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                      KHU VỰC:
                    </label>

                  </div>

                  <div className="flex flex-wrap gap-2 p-3 bg-surface-container-low border border-outline-variant/30 rounded-2xl max-h-[140px] overflow-y-auto">
                    {/* Option: Toàn bộ khu vườn */}
                    <button
                      type="button"
                      onClick={() => handleLocationToggle("Toàn bộ khu vườn")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${selectedLocations.includes("Toàn bộ khu vườn")
                        ? "bg-primary text-white shadow-xs"
                        : "bg-surface border border-outline-variant/30 text-on-surface-variant hover:border-primary/40"
                        }`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {selectedLocations.includes("Toàn bộ khu vườn") ? "check_circle" : "park"}
                      </span>
                      Toàn bộ
                    </button>

                    {/* Plants from /plants */}
                    {plants &&
                      plants.map((p) => {
                        const locVal = `${p.name} (${p.location})`;
                        const isSelected = selectedLocations.includes(locVal);

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleLocationToggle(locVal)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${isSelected
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "bg-surface border border-outline-variant/30 text-on-surface-variant hover:border-emerald-500/40"
                              }`}
                          >
                            <span className="material-symbols-outlined text-sm">
                              {isSelected ? "check_circle" : "eco"}
                            </span>
                            {p.name} - {p.location}
                          </button>
                        );
                      })}
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
                    disabled={isSubmitting || selectedActions.length === 0 || !!conflictError}
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

      {/* Sub-modal popup Cấu hình Tưới Phân */}
      {showFertilizeSubModal && mounted && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200">
          <div className="bg-surface border border-outline-variant/30 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 flex items-center justify-center">
                  <span className="material-symbols-outlined text-xl">settings</span>
                </div>
                <div>
                  <h3 className="font-bold text-base text-on-surface">Cấu Hình Chế Độ Tưới Phân</h3>
                  <p className="text-xs text-on-surface-variant">Chọn chế độ tưới phân bằng AI hoặc tùy chỉnh ml</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFertilizeSubModal(false)}
                className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Options list */}
            <div className="space-y-3">
              {/* Option 1: AI Gemini */}
              <div
                onClick={() => setFertilizeMode("AI")}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start gap-3.5 ${fertilizeMode === "AI"
                  ? "bg-purple-500/10 border-purple-500/50 shadow-xs ring-1 ring-purple-500/40"
                  : "bg-surface-container-low border-outline-variant/30 hover:border-outline-variant"
                  }`}
              >
                <input
                  type="radio"
                  name="fertilizeMode"
                  checked={fertilizeMode === "AI"}
                  onChange={() => setFertilizeMode("AI")}
                  className="mt-1 w-4 h-4 text-purple-600 focus:ring-purple-500 accent-purple-600 cursor-pointer"
                />
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-bold text-xs text-on-surface">
                    <span>🤖 Tưới Phân AI (Gemini)</span>
                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[10px] font-mono font-bold rounded-full">
                      Tự động
                    </span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Robot di chuyển chụp ảnh khay cây, AI Gemini phân tích lá & lịch sử bón phân để tự động tưới phân thích hợp.
                  </p>
                </div>
              </div>

              {/* Option 2: Custom */}
              <div
                onClick={() => setFertilizeMode("CUSTOM")}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start gap-3.5 ${fertilizeMode === "CUSTOM"
                  ? "bg-cyan-500/10 border-cyan-500/50 shadow-xs ring-1 ring-cyan-500/40"
                  : "bg-surface-container-low border-outline-variant/30 hover:border-outline-variant"
                  }`}
              >
                <input
                  type="radio"
                  name="fertilizeMode"
                  checked={fertilizeMode === "CUSTOM"}
                  onChange={() => setFertilizeMode("CUSTOM")}
                  className="mt-1 w-4 h-4 text-cyan-600 focus:ring-cyan-500 accent-cyan-600 cursor-pointer"
                />
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-bold text-xs text-on-surface">
                    <span>🧪 Tưới Phân Tùy Chỉnh</span>
                    <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-[10px] font-mono font-bold rounded-full">
                      Thủ công
                    </span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Tưới phân theo dung tích ml tùy chỉnh do bạn chọn cho từng bình phân bón.
                  </p>
                </div>
              </div>
            </div>

            {/* Custom dosages config if CUSTOM selected */}
            {fertilizeMode === "CUSTOM" && (
              <div className="p-4 bg-surface-container-high/60 border border-cyan-500/30 rounded-2xl space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                    Cấu hình từng bình phân bón:
                  </label>
                  <span className="text-[10px] font-mono font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-500/20 px-2 py-0.5 rounded">
                    Đơn vị: ml
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(customDosages).map(([tankCode, conf]) => (
                    <div
                      key={tankCode}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${conf.enabled
                        ? "bg-surface border-cyan-500/40 shadow-xs"
                        : "bg-surface-container-low border-outline-variant/30 opacity-50"
                        }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={conf.enabled}
                          onChange={(e) =>
                            setCustomDosages((prev) => ({
                              ...prev,
                              [tankCode]: { ...prev[tankCode], enabled: e.target.checked },
                            }))
                          }
                          className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary cursor-pointer"
                        />
                        <span className="font-bold text-xs text-on-surface truncate">
                          {tankCode} ({conf.name})
                        </span>
                      </div>

                      {conf.enabled && (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="10"
                            value={conf.ml}
                            onChange={(e) =>
                              setCustomDosages((prev) => ({
                                ...prev,
                                [tankCode]: {
                                  ...prev[tankCode],
                                  ml: Math.max(0.5, parseFloat(e.target.value) || 0.5),
                                },
                              }))
                            }
                            className="w-16 px-2 py-1 bg-surface-container-high border border-outline-variant/40 rounded-lg text-xs font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <span className="text-xs font-bold text-on-surface-variant font-mono">ml</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Confirm button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowFertilizeSubModal(false)}
                className="w-full bg-primary text-white font-bold py-3 rounded-2xl hover:bg-primary/90 transition-all shadow-md text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base font-bold">check_circle</span>
                Xác Nhận & Lưu Cấu Hình
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
