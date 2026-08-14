"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Plant, TaskItem } from "@/lib/data";

export interface DeviceControls {
  watering: boolean;
  lights: boolean;
  fan: boolean;
  misting: boolean;
  autoWater?: boolean;
  lightIntensity: number;
  waterFlowRate: number;
  targetHumidity: number;
  soilMoisture: number;
  temperature: number;
  phValue: number;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  image?: string;
  actions?: { label: string; actionKey: string }[];
}

export interface FertilizerItem {
  id: string;
  name: string;
  tankCode: string;
  capacityMl: number;
  currentMl: number;
  price?: number;
  addedDate?: string;
  status: "Sẵn sàng" | "Cần thêm" | "Hết phân";
}

interface GardenContextType {
  plants: Plant[];
  controls: DeviceControls;
  tasks: TaskItem[];
  fertilizers: FertilizerItem[];
  chatHistory: ChatMessage[];
  isLoading: boolean;
  addPlant: (plant: Omit<Plant, "id">) => Promise<void>;
  deletePlant: (id: string) => Promise<void>;
  updateControls: (updates: Partial<DeviceControls>) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  addTask: (task: Omit<TaskItem, "id">) => Promise<void>;
  addFertilizer: (fert: Omit<FertilizerItem, "id"> & { id?: string }) => Promise<void>;
  updateFertilizer: (id: string, updates: Partial<FertilizerItem>) => Promise<void>;
  deleteFertilizer: (id: string) => Promise<void>;
  sendAiMessage: (text: string, image?: string) => Promise<void>;
  resetChatHistory: () => Promise<void>;
  triggerQuickAction: (actionMsg: string) => void;
  toastMsg: string | null;
}

const GardenContext = createContext<GardenContextType | undefined>(undefined);

const DEFAULT_FERTILIZERS: FertilizerItem[] = [];

export function GardenProvider({ children }: { children: React.ReactNode }) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [controls, setControls] = useState<DeviceControls>({
    watering: true,
    lights: false,
    fan: true,
    misting: false,
    autoWater: false,
    lightIntensity: 80,
    waterFlowRate: 65,
    targetHumidity: 70,
    soilMoisture: 65,
    temperature: 28,
    phValue: 6.2,
  });
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [fertilizers, setFertilizers] = useState<FertilizerItem[]>(DEFAULT_FERTILIZERS);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Fetch full state from Node.js Express Backend
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/garden");
        if (res.ok) {
          const data = await res.json();
          if (data.plants) setPlants(data.plants);
          if (data.controls) setControls(data.controls);
          if (data.tasks) setTasks(data.tasks);
          if (data.chatHistory) setChatHistory(data.chatHistory);
        }

        // Fetch fertilizers from /api/fertilizers (data/fertilizers.json)
        const fertRes = await fetch("/api/fertilizers");
        if (fertRes.ok) {
          const fertData = await fertRes.json();
          if (Array.isArray(fertData)) {
            setFertilizers(fertData);
          }
        }
      } catch (e) {
        console.error("Failed to load garden state from Node.js Backend", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Poll real-time ESP32 telemetry (soil moisture, temperature, light) every 3s
  useEffect(() => {
    const fetchEsp32Sensors = async () => {
      try {
        const res = await fetch("/api/esp32/sensors");
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setControls((prev) => ({
              ...prev,
              ...(typeof json.data.avgMoisture === "number" && { soilMoisture: json.data.avgMoisture }),
              ...(typeof json.data.temperature === "number" && json.data.temperature > 0 && { temperature: json.data.temperature }),
              ...(typeof json.data.lightPercent === "number" && { lightIntensity: json.data.lightPercent }),
            }));
          }
        }
      } catch (e) {
        // Ignore background polling error
      }
    };

    fetchEsp32Sensors();
    const interval = setInterval(fetchEsp32Sensors, 3000);
    return () => clearInterval(interval);
  }, []);

  const addPlant = async (plantData: Omit<Plant, "id">) => {
    const newPlant: Plant = {
      ...plantData,
      id: `plant-${Date.now()}`,
    };
    showToast(`Đã thêm cây "${newPlant.name}"!`);
    try {
      const res = await fetch("/api/plants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPlant),
      });
      if (res.ok) {
        const updatedPlants = await res.json();
        setPlants(updatedPlants);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deletePlant = async (id: string) => {
    showToast("Đã xóa cây trồng khỏi hệ thống");
    try {
      const res = await fetch(`/api/plants/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const updatedPlants = await res.json();
        setPlants(updatedPlants);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateControls = async (updates: Partial<DeviceControls>) => {
    setControls((prev) => ({ ...prev, ...updates }));
    try {
      const res = await fetch("/api/controls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updatedControls = await res.json();
        setControls(updatedControls);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleTask = async (id: string) => {
    try {
      const res = await fetch(`/api/tasks/${id}/toggle`, {
        method: "PUT",
      });
      if (res.ok) {
        const updatedTasks = await res.json();
        setTasks(updatedTasks);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const addTask = async (taskData: Omit<TaskItem, "id">) => {
    const newTask: TaskItem = {
      ...taskData,
      id: `task-${Date.now()}`,
    };
    showToast(`Đã lưu lịch làm việc mới: "${newTask.title}"`);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTask),
      });
      if (res.ok) {
        const updatedTasks = await res.json();
        setTasks(updatedTasks);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Fertilizer CRUD (data/fertilizers.json)
  const addFertilizer = async (fertData: Omit<FertilizerItem, "id"> & { id?: string }) => {
    const newFert: FertilizerItem = {
      ...fertData,
      id: fertData.id || `fert-${Date.now()}`,
    };
    setFertilizers((prev) => [newFert, ...prev]);
    showToast(`Đã thêm mới bình phân ${newFert.tankCode}!`);
    try {
      const res = await fetch("/api/fertilizers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newFert),
      });
      if (res.ok) {
        const updated = await res.json();
        if (Array.isArray(updated)) setFertilizers(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateFertilizer = async (id: string, updates: Partial<FertilizerItem>) => {
    setFertilizers((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
    try {
      const res = await fetch(`/api/fertilizers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        if (Array.isArray(updated)) setFertilizers(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteFertilizer = async (id: string) => {
    setFertilizers((prev) => prev.filter((f) => f.id !== id));
    try {
      const res = await fetch(`/api/fertilizers/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const updated = await res.json();
        if (Array.isArray(updated)) setFertilizers(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sendAiMessage = async (text: string, image?: string) => {
    const now = new Date();
    const timeStr = `${now.getHours()}:${now.getMinutes() < 10 ? "0" : ""}${now.getMinutes()}`;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      timestamp: timeStr,
      image,
    };

    setChatHistory((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userText: text, image }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatHistory(data.chatHistory);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const resetChatHistory = async () => {
    try {
      const res = await fetch("/api/ai-chat", { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setChatHistory(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const triggerQuickAction = (actionMsg: string) => {
    showToast(actionMsg);
  };

  return (
    <GardenContext.Provider
      value={{
        plants,
        controls,
        tasks,
        fertilizers,
        chatHistory,
        isLoading,
        addPlant,
        deletePlant,
        updateControls,
        toggleTask,
        addTask,
        addFertilizer,
        updateFertilizer,
        deleteFertilizer,
        sendAiMessage,
        resetChatHistory,
        triggerQuickAction,
        toastMsg,
      }}
    >
      {children}
      {toastMsg && (
        <div className="fixed top-20 right-4 md:right-8 z-[99999] max-w-md bg-slate-900/95 text-white backdrop-blur-md px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700/50 flex items-center gap-3 animate-in fade-in slide-in-from-top-5 duration-300">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-emerald-400 text-xl">
              notifications_active
            </span>
          </div>
          <span className="text-body-sm font-semibold leading-snug flex-1">{toastMsg}</span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}
    </GardenContext.Provider>
  );
}

export function useGarden() {
  const context = useContext(GardenContext);
  if (!context) {
    throw new Error("useGarden must be used within a GardenProvider");
  }
  return context;
}
