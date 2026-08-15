import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const historyFilePath = path.join(process.cwd(), "data", "sensor_history.json");
const controlsFilePath = path.join(process.cwd(), "data", "controls.json");

const DAYS_MAP = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export async function GET() {
  try {
    let history = [];
    if (fs.existsSync(historyFilePath)) {
      const raw = fs.readFileSync(historyFilePath, "utf-8");
      history = JSON.parse(raw);
    } else {
      history = [
        { day: "T2", soilMoisture: 68, temperature: 27.5, lightIntensity: 82 },
        { day: "T3", soilMoisture: 72, temperature: 28.0, lightIntensity: 78 },
        { day: "T4", soilMoisture: 64, temperature: 29.1, lightIntensity: 85 },
        { day: "T5", soilMoisture: 70, temperature: 28.4, lightIntensity: 72 },
        { day: "T6", soilMoisture: 76, temperature: 27.8, lightIntensity: 88 },
        { day: "T7", soilMoisture: 65, temperature: 28.2, lightIntensity: 80 },
        { day: "CN", soilMoisture: 67, temperature: 28.0, lightIntensity: 81 },
      ];
    }

    // Live update today's metrics from real controls.json data
    let currentControls = { soilMoisture: 65, temperature: 28, lightIntensity: 80 };
    if (fs.existsSync(controlsFilePath)) {
      try {
        const cRaw = fs.readFileSync(controlsFilePath, "utf-8");
        const cObj = JSON.parse(cRaw);
        if (cObj.soilMoisture !== undefined) currentControls.soilMoisture = cObj.soilMoisture;
        if (cObj.temperature !== undefined) currentControls.temperature = cObj.temperature;
        if (cObj.lightIntensity !== undefined) currentControls.lightIntensity = cObj.lightIntensity;
      } catch (e) {}
    }

    const todayDayName = DAYS_MAP[new Date().getDay()];
    const todayIndex = history.findIndex((item: any) => item.day === todayDayName);
    if (todayIndex !== -1) {
      history[todayIndex].soilMoisture = currentControls.soilMoisture;
      history[todayIndex].temperature = currentControls.temperature;
      history[todayIndex].lightIntensity = currentControls.lightIntensity;
      try {
        fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2), "utf-8");
      } catch (e) {}
    }

    return NextResponse.json({ success: true, data: history });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
