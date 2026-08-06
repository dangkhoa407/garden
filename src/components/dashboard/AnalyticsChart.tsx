"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { HISTORICAL_DATA } from "@/lib/data";

export function AnalyticsChart() {
  return (
    <div className="bg-surface rounded-xl p-md card-shadow border border-outline-variant/20">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-xs mb-md">
        <div>
          <h4 className="font-body-lg text-body-lg font-semibold text-on-surface">
            Lịch sử thông số (7 ngày qua)
          </h4>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Biểu đồ theo dõi độ ẩm, nhiệt độ và cường độ ánh sáng
          </p>
        </div>
      </div>

      {/* Recharts Bar Chart container */}
      <div className="h-64 sm:h-72 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={HISTORICAL_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eeeeee" />
            <XAxis dataKey="day" tick={{ fill: "#40493d", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#40493d", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                border: "1px solid #bfcaba",
                boxShadow: "0px 4px 20px rgba(0,0,0,0.08)",
                fontSize: "13px",
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }}
              formatter={(value) => {
                if (value === "soilMoisture") return "Độ ẩm đất (%)";
                if (value === "temperature") return "Nhiệt độ (°C)";
                if (value === "lightIntensity") return "Cường độ sáng (%)";
                return value;
              }}
            />
            <Bar dataKey="soilMoisture" fill="#0d631b" radius={[4, 4, 0, 0]} name="soilMoisture" />
            <Bar dataKey="temperature" fill="#7a4a00" radius={[4, 4, 0, 0]} name="temperature" />
            <Bar dataKey="lightIntensity" fill="#ffb865" radius={[4, 4, 0, 0]} name="lightIntensity" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
