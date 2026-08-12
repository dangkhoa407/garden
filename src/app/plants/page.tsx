"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { PlantCard } from "@/components/dashboard/PlantCard";
import { useGarden } from "@/context/GardenContext";

const LOCATION_OPTIONS = [
  "Khay 01",
  "Khay 02",
  "Khay 03",
  "Khay 04",
  "Khay 05",
  "Khay 06",
];

export default function PlantsPage() {
  const { plants, addPlant, deletePlant } = useGarden();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPlantName, setNewPlantName] = useState("");
  const [mounted, setMounted] = useState(false);

  // Filter out locations that are already occupied by existing plants
  const availableLocations = LOCATION_OPTIONS.filter(
    (loc) => !plants.some((p) => p.location === loc)
  );

  const [newPlantLocation, setNewPlantLocation] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync selected default location to first available empty tray
  useEffect(() => {
    if (availableLocations.length > 0 && !availableLocations.includes(newPlantLocation)) {
      setNewPlantLocation(availableLocations[0]);
    }
  }, [plants, availableLocations, newPlantLocation]);

  const handleAddPlant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlantName.trim()) return;
    if (!newPlantLocation) {
      alert("Không còn khay trống nào khả dụng!");
      return;
    }

    const now = new Date();
    const formattedDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;

    await addPlant({
      name: newPlantName,
      days: 1,
      status: "Mới gieo trồng",
      statusColor: "text-primary bg-primary/10",
      progress: 10,
      category: "Rau ăn lá",
      location: newPlantLocation,
      createdDate: formattedDate,
      image:
        "https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8?q=80&w=400&auto=format&fit=crop",
    });

    setNewPlantName("");
    setShowAddModal(false);
  };

  return (
    <div className="space-y-lg max-w-[1600px] mx-auto">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md">
        <div>
          <h2 className="font-display-lg text-display-lg font-bold text-primary mb-1">
            Quản Lý Vườn Cây
          </h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Danh sách tất cả cây trồng đang được theo dõi và lưu trữ trong hệ thống
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-primary text-on-primary px-5 py-3 rounded-xl font-body-lg font-semibold hover:bg-primary-container transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
        >
          <span className="material-symbols-outlined">add</span>
          Thêm cây mới
        </button>
      </div>

      {/* Plants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
        {plants.map((plant) => (
          <div key={plant.id} className="relative group">
            <PlantCard plant={plant} />
            <button
              onClick={() => deletePlant(plant.id)}
              className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 bg-error/90 text-on-error p-1.5 rounded-full transition-all hover:bg-error shadow-sm z-10"
              title="Xóa cây"
            >
              <span className="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
        ))}
      </div>

      {plants.length === 0 && (
        <div className="text-center py-xl bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant">
          <span className="material-symbols-outlined text-5xl text-outline mb-2">
            potted_plant
          </span>
          <p className="font-body-lg text-on-surface-variant font-medium">
            Chưa có cây trồng nào trong danh sách
          </p>
        </div>
      )}

      {/* Add Plant Modal via Portal */}
      {showAddModal &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-md">
            <div className="bg-surface rounded-2xl p-lg max-w-md w-full shadow-2xl border border-outline-variant/30 space-y-md animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center">
                <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                  Thêm Cây Trồng Mới
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-on-surface-variant hover:text-primary p-1 rounded-lg hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleAddPlant} className="space-y-md">
                <div>
                  <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 font-semibold">
                    TÊN CÂY TRỒNG
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ví dụ: Cải cúc thủy canh"
                    value={newPlantName}
                    onChange={(e) => setNewPlantName(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-label-caps text-label-caps text-on-surface-variant mb-1 font-semibold">
                    VỊ TRÍ TRỒNG
                  </label>

                  {availableLocations.length > 0 ? (
                    <select
                      value={newPlantLocation}
                      onChange={(e) => setNewPlantLocation(e.target.value)}
                      className="w-full px-3 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-body-sm focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                    >
                      {availableLocations.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-base">warning</span>
                      Đã hết vị trí để thêm!
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-xs">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl text-body-sm font-semibold border border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={availableLocations.length === 0}
                    className="px-5 py-2 rounded-xl text-body-sm font-semibold bg-primary text-on-primary hover:bg-primary-container shadow-xs disabled:opacity-50"
                  >
                    Xác nhận thêm
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
