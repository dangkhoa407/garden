export interface Plant {
  id: string;
  name: string;
  days: number;
  status: string;
  statusColor: string;
  progress: number;
  image: string;
  category?: string;
  location?: string;
  createdDate?: string;
  waterNeed?: string;
}

export function computePlantGrowth(createdDateStr?: string, defaultDays?: number) {
  let days = defaultDays || 1;

  if (createdDateStr) {
    const parts = createdDateStr.split(/[/.-]/);
    if (parts.length === 3) {
      let d = 1, m = 1, y = 2026;
      if (parts[0].length === 4) {
        y = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        d = parseInt(parts[2], 10);
      } else {
        d = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        y = parseInt(parts[2], 10);
      }
      const createdTime = new Date(y, m - 1, d).getTime();
      const nowTime = new Date().getTime();
      const diffDays = Math.floor((nowTime - createdTime) / (1000 * 60 * 60 * 24));
      if (!isNaN(diffDays) && diffDays >= 0) {
        days = diffDays + 1;
      }
    }
  }

  let status = "Mới gieo trồng";
  let statusColor = "text-emerald-700 bg-emerald-500/10";
  let progress = 10;

  if (days <= 3) {
    status = "Mới gieo trồng";
    statusColor = "text-emerald-700 bg-emerald-500/10";
    progress = Math.min(25, 10 + days * 5);
  } else if (days <= 10) {
    status = "Đang nảy mầm";
    statusColor = "text-teal-700 bg-teal-500/10";
    progress = Math.min(50, 25 + (days - 3) * 3.5);
  } else if (days <= 25) {
    status = "Đang phát triển";
    statusColor = "text-primary bg-primary/10";
    progress = Math.min(75, 50 + (days - 10) * 1.6);
  } else if (days <= 40) {
    status = "Phát triển tốt";
    statusColor = "text-emerald-600 bg-emerald-500/20";
    progress = Math.min(95, 75 + (days - 25) * 1.3);
  } else {
    status = "Chuẩn bị thu hoạch";
    statusColor = "text-amber-700 bg-amber-500/10";
    progress = 100;
  }

  return { days: Math.round(days), status, statusColor, progress: Math.round(progress) };
}

export interface TaskItem {
  id: string;
  title: string;
  time: string;
  period: string;
  location: string;
  duration?: string;
  remaining?: string;
  status: "active" | "upcoming" | "completed";
  progress?: number;
  icon: string;
}

export interface DeviceState {
  watering: boolean;
  lights: boolean;
  fan: boolean;
  misting: boolean;
  lightIntensity: number;
  waterFlowRate: number;
  targetHumidity: number;
}

export const INITIAL_PLANTS: Plant[] = [
  {
    id: "plant-1",
    name: "Cải bẹ xanh",
    days: 14,
    status: "Phát triển tốt",
    statusColor: "text-primary bg-primary/10",
    progress: 45,
    category: "Rau ăn lá",
    location: "Khay 01",
    createdDate: "23/7/2026",
    image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?q=80&w=400&auto=format&fit=crop",
  },
  {
    id: "plant-2",
    name: "Xà lách thủy canh",
    days: 22,
    status: "Chuẩn bị thu hoạch",
    statusColor: "text-secondary bg-secondary-container/50",
    progress: 90,
    category: "Thủy canh",
    location: "Khay 02",
    createdDate: "15/7/2026",
    image: "https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?q=80&w=400&auto=format&fit=crop",
  },
  {
    id: "plant-3",
    name: "Cà chua bi",
    days: 45,
    status: "Đang ra hoa",
    statusColor: "text-tertiary-container bg-tertiary-fixed/40",
    progress: 60,
    category: "Cây lấy quả",
    location: "Khay 03",
    createdDate: "22/6/2026",
    image: "https://images.unsplash.com/photo-1592841200221-a6898f307baa?q=80&w=400&auto=format&fit=crop",
  },
  {
    id: "plant-4",
    name: "Rau húng lủi",
    days: 10,
    status: "Đang nảy mầm",
    statusColor: "text-primary bg-primary/10",
    progress: 25,
    category: "Rau gia vị",
    location: "Khay 04",
    createdDate: "27/7/2026",
    image: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?q=80&w=400&auto=format&fit=crop",
  },
];

export const HISTORICAL_DATA = [
  { day: "T2", soilMoisture: 65, temperature: 45, lightIntensity: 80 },
  { day: "T3", soilMoisture: 70, temperature: 50, lightIntensity: 75 },
  { day: "T4", soilMoisture: 60, temperature: 48, lightIntensity: 85 },
  { day: "T5", soilMoisture: 68, temperature: 55, lightIntensity: 70 },
  { day: "T6", soilMoisture: 75, temperature: 42, lightIntensity: 90 },
  { day: "T7", soilMoisture: 62, temperature: 40, lightIntensity: 82 },
  { day: "CN", soilMoisture: 65, temperature: 45, lightIntensity: 80 },
];

export const INITIAL_TASKS: TaskItem[] = [
  {
    id: "task-1",
    title: "Phun thuốc tự động",
    time: "08:00 - 09:30",
    period: "Sáng",
    location: "Khu vực A & B",
    duration: "90 phút",
    remaining: "Còn 45 phút",
    status: "active",
    progress: 50,
    icon: "water_drop",
  },
  {
    id: "task-2",
    title: "Kiểm tra sâu bệnh",
    time: "14:00",
    period: "Chiều",
    location: "Nhà kính 01",
    duration: "30 phút",
    status: "upcoming",
    icon: "pest_control",
  },
  {
    id: "task-3",
    title: "Châm thêm dinh dưỡng thủy canh",
    time: "16:30",
    period: "Chiều",
    location: "Hệ thống Bồn Nước A",
    duration: "15 phút",
    status: "upcoming",
    icon: "science",
  },
  {
    id: "task-4",
    title: "Kiểm tra độ ẩm đất",
    time: "06:30",
    period: "Sáng",
    location: "Toàn bộ khu vườn",
    status: "completed",
    icon: "check_circle",
  },
];
