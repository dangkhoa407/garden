"use client";

import Link from "next/link";
import { StatCard } from "@/components/dashboard/StatCard";
import { AnalyticsChart } from "@/components/dashboard/AnalyticsChart";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { PlantCard } from "@/components/dashboard/PlantCard";
import { useGarden } from "@/context/GardenContext";

export default function DashboardPage() {
  const { plants, controls } = useGarden();

  return (
    <div className="space-y-lg max-w-[1600px] mx-auto">
      {/* Environmental Overview Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
        <StatCard
          label="Độ ẩm đất (Soil Moisture)"
          value={`${controls.soilMoisture}%`}
          status={controls.soilMoisture >= 60 ? "Tối ưu" : "Cần tưới thêm"}
          statusColor={
            controls.soilMoisture >= 60
              ? "bg-primary/10 text-primary"
              : "bg-tertiary-fixed text-tertiary-container"
          }
          icon="water_drop"
          iconColor="text-secondary"
        />
        <StatCard
          label="Nhiệt độ (Temperature)"
          value={typeof controls.temperature === "number" ? `${controls.temperature}°C` : "--"}
          status={typeof controls.temperature === "number" ? "Ổn định" : "Chờ cảm biến..."}
          statusColor="bg-surface-container-high text-on-surface-variant"
          icon="thermostat"
          iconColor="text-tertiary"
        />
        <StatCard
          label="Cường độ ánh sáng (Light)"
          value={typeof controls.lightIntensity === "number" ? `${controls.lightIntensity}%` : "--"}
          status={controls.lights ? "Đang bật LED" : (typeof controls.lightIntensity === "number" ? "Tối ưu" : "Chờ cảm biến...")}
          statusColor="bg-primary/10 text-primary"
          icon="light_mode"
          iconColor="text-tertiary-fixed-dim"
        />
      </section>

      {/* Analytics Chart */}
      <section>
        <h3 className="font-headline-md text-headline-md text-on-surface mb-sm">
          Phân tích dữ liệu sinh trưởng
        </h3>
        <AnalyticsChart />
      </section>

      {/* Quick Actions */}
      <section>
        <h3 className="font-headline-md text-headline-md text-on-surface mb-sm">
          Thao tác nhanh
        </h3>
        <QuickActions />
      </section>

      {/* My Plants Grid */}
      <section>
        <div className="flex justify-between items-center mb-sm">
          <h3 className="font-headline-md text-headline-md text-on-surface">
            Vườn của tôi
          </h3>
          <Link
            href="/plants"
            className="font-body-sm text-body-sm text-primary font-semibold hover:underline flex items-center gap-1"
          >
            Xem tất cả ({plants.length})
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {plants.slice(0, 3).map((plant) => (
            <PlantCard key={plant.id} plant={plant} />
          ))}
        </div>
      </section>
    </div>
  );
}
