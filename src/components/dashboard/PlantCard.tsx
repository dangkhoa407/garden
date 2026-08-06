import Image from "next/image";
import { Plant } from "@/lib/data";

interface PlantCardProps {
  plant: Plant;
}

function cleanLocation(loc?: string): string {
  if (!loc) return "Khay 01";
  const match = loc.match(/Khay\s*\d+/i);
  if (match) {
    return match[0].replace(/khay/i, "Khay");
  }
  return loc.replace(/\s*-\s*Tầng\s*\d+/gi, "").replace(/Vị trí\s*\d+\s*/gi, "").replace(/\s*\(.*\)/g, "").trim() || "Khay 01";
}

export function PlantCard({ plant }: PlantCardProps) {
  const now = new Date();
  const defaultDateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
  const displayDate = plant.createdDate || defaultDateStr;
  const displayLocation = cleanLocation(plant.location);

  return (
    <div className="bg-surface rounded-xl p-md card-shadow border border-outline-variant/20 hover:shadow-md transition-all hover:-translate-y-0.5 group">
      <div className="flex justify-between items-start mb-md">
        <div>
          <h4 className="font-body-lg text-body-lg font-bold text-on-surface group-hover:text-primary transition-colors">
            {plant.name}
          </h4>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            {displayLocation}- {displayDate}
          </p>
        </div>
        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-surface-container-high relative flex-shrink-0">
          <img
            src={plant.image}
            alt={plant.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        </div>
      </div>
      <div className="mb-sm">
        <div className="flex justify-between items-center mb-1.5">
          <span className={`font-label-caps text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${plant.statusColor}`}>
            {plant.status}
          </span>
          <span className="font-label-caps text-[10px] text-on-surface-variant font-medium">
            {plant.progress}%
          </span>
        </div>
        <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-500"
            style={{ width: `${plant.progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
