import fs from "fs";
import path from "path";
import { Plant, TaskItem } from "@/lib/data";

export interface GardenStoreData {
  plants: Plant[];
  controls: {
    watering: boolean;
    lights: boolean;
    fan: boolean;
    misting: boolean;
    autoShade?: boolean;
    sunRoof?: boolean;
    rainRoof?: boolean;
    lightIntensity: number;
    waterFlowRate: number;
    targetHumidity: number;
    soilMoisture: number;
    temperature: number;
    phValue: number;
  };
  tasks: TaskItem[];
  chatHistory: {
    id: string;
    sender: "user" | "ai";
    text: string;
    timestamp: string;
    image?: string;
    actions?: { label: string; actionKey: string }[];
  }[];
}

const dataFilePath = path.join(process.cwd(), "data", "garden-store.json");

export function getGardenStore(): GardenStoreData {
  try {
    if (!fs.existsSync(dataFilePath)) {
      return {
        plants: [],
        controls: {
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
        },
        tasks: [],
        chatHistory: [],
      };
    }
    const raw = fs.readFileSync(dataFilePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("Error reading garden store:", error);
    throw error;
  }
}

export function saveGardenStore(data: GardenStoreData): void {
  try {
    const dir = path.dirname(dataFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing garden store:", error);
  }
}
