"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ActiveTaskCard } from "@/components/schedule/ActiveTaskCard";
import { TaskItemCard } from "@/components/schedule/TaskItemCard";
import { AutomationWidget } from "@/components/schedule/AutomationWidget";
import { useGarden } from "@/context/GardenContext";

export default function SchedulePage() {
  const { tasks, addTask, toggleTask, controls } = useGarden();
  const [filter, setFilter] = useState<"all" | "upcoming" | "completed">("all");
  const [showModal, setShowModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskTime, setNewTaskTime] = useState("10:00");
  const [newTaskLocation, setNewTaskLocation] = useState("Khu vực A");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTask = tasks.find((t) => t.status === "active");

  const filteredTasks = tasks.filter((t) => {
    if (filter === "upcoming") return t.status === "upcoming" || t.status === "active";
    if (filter === "completed") return t.status === "completed";
    return true;
  });

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    await addTask({
      title: newTaskTitle,
      time: newTaskTime,
      period: Number(newTaskTime.split(":")[0]) >= 12 ? "Chiều" : "Sáng",
      location: newTaskLocation,
      duration: "30 phút",
      status: "upcoming",
      icon: "event",
    });

    setNewTaskTitle("");
    setShowModal(false);
  };

  return (
    <div className="space-y-lg max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-md">
        <div>
          <h2 className="font-display-lg text-display-lg font-bold text-primary mb-1">
            Lịch Trình Quản Lý
          </h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Tự động hóa chăm sóc vườn • Cập nhật trực tiếp
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-primary text-on-primary px-6 py-3 rounded-xl font-body-lg font-semibold hover:bg-primary/90 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
        >
          <span className="material-symbols-outlined">add_task</span>
          Lên lịch mới
        </button>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-12 gap-gutter">
        {/* Main Timeline (Span 8) */}
        <div className="col-span-12 xl:col-span-8 space-y-gutter">
          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-1.5 rounded-full font-label-caps text-label-caps uppercase transition-colors ${
                filter === "all"
                  ? "bg-primary text-on-primary"
                  : "border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setFilter("upcoming")}
              className={`px-4 py-1.5 rounded-full font-label-caps text-label-caps uppercase transition-colors ${
                filter === "upcoming"
                  ? "bg-primary text-on-primary"
                  : "border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              Sắp tới
            </button>
            <button
              onClick={() => setFilter("completed")}
              className={`px-4 py-1.5 rounded-full font-label-caps text-label-caps uppercase transition-colors ${
                filter === "completed"
                  ? "bg-primary text-on-primary"
                  : "border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              Hoàn thành
            </button>
          </div>

          {/* Active Task Card */}
          {activeTask && (filter === "all" || filter === "upcoming") && (
            <ActiveTaskCard task={activeTask} />
          )}

          {/* Task List */}
          <div className="space-y-sm">
            {filteredTasks.map((task) => (
              <TaskItemCard
                key={task.id}
                task={task}
                onToggleComplete={(id) => toggleTask(id)}
              />
            ))}
          </div>
        </div>

        {/* Side Panel (Span 4) */}
        <div className="col-span-12 xl:col-span-4 space-y-gutter">
          {/* Automation Controls */}
          <AutomationWidget />

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
                  Độ ẩm
                </span>
                <div className="font-stat-value text-headline-md font-bold text-on-surface">
                  {controls.soilMoisture}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Add Task via Portal */}
      {showModal &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-md">
            <div className="bg-surface rounded-2xl p-lg max-w-md w-full shadow-2xl border border-outline-variant/30 space-y-md animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center">
                <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                  Thêm Lịch Trình Mới
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-on-surface-variant hover:text-primary p-1 rounded-lg hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleAddTask} className="space-y-md">
                <div>
                  <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 font-semibold">
                    TÊN CÔNG VIỆC
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Phun sương rau cải"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 font-semibold">
                    THỜI GIAN
                  </label>
                  <input
                    type="time"
                    required
                    value={newTaskTime}
                    onChange={(e) => setNewTaskTime(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 font-semibold">
                    KHU VỰC
                  </label>
                  <input
                    type="text"
                    required
                    value={newTaskLocation}
                    onChange={(e) => setNewTaskLocation(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-xs">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl text-body-sm font-semibold border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-body-sm font-semibold bg-primary text-on-primary hover:bg-primary-container shadow-xs"
                  >
                    Tạo lịch
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
