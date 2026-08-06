"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Plant, TaskItem } from "@/lib/data";

export interface DeviceControls {
  watering: boolean;
  lights: boolean;
  fan: boolean;
  misting: boolean;
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

interface GardenContextType {
  plants: Plant[];
  controls: DeviceControls;
  tasks: TaskItem[];
  chatHistory: ChatMessage[];
  isLoading: boolean;
  addPlant: (plant: Omit<Plant, "id">) => Promise<void>;
  deletePlant: (id: string) => Promise<void>;
  updateControls: (updates: Partial<DeviceControls>) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  addTask: (task: Omit<TaskItem, "id">) => Promise<void>;
  sendAiMessage: (text: string, image?: string) => Promise<void>;
  resetChatHistory: () => Promise<void>;
  triggerQuickAction: (actionMsg: string) => void;
  toastMsg: string | null;
}

const GardenContext = createContext<GardenContextType | undefined>(undefined);

export function GardenProvider({ children }: { children: React.ReactNode }) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [controls, setControls] = useState<DeviceControls>({
    watering: true,
    lights: false,
    fan: true,
    misting: false,
    lightIntensity: 80,
    waterFlowRate: 65,
    targetHumidity: 70,
    soilMoisture: 65,
    temperature: 28,
    phValue: 6.2,
  });
  const [tasks, setTasks] = useState<TaskItem[]>([]);
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
      } catch (e) {
        console.error("Failed to load garden state from Node.js Backend", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const addPlant = async (plantData: Omit<Plant, "id">) => {
    const newPlant: Plant = {
      ...plantData,
      id: `plant-${Date.now()}`,
    };
    showToast(`Đã thêm cây "${newPlant.name}" vào data/plants.json!`);
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
    showToast("Đã xóa cây trồng khỏi data/plants.json");
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
    showToast(`Đã lưu lịch mới vào data/tasks.json: "${newTask.title}"`);
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
        chatHistory,
        isLoading,
        addPlant,
        deletePlant,
        updateControls,
        toggleTask,
        addTask,
        sendAiMessage,
        resetChatHistory,
        triggerQuickAction,
        toastMsg,
      }}
    >
      {children}
      {toastMsg && (
        <div className="fixed bottom-20 right-6 z-50 bg-inverse-surface text-inverse-on-surface px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-bounce">
          <span className="material-symbols-outlined text-primary-fixed">
            check_circle
          </span>
          <span className="text-body-sm font-medium">{toastMsg}</span>
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
