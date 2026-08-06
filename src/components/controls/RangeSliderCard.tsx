"use client";

interface RangeSliderCardProps {
  label: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

export function RangeSliderCard({
  label,
  value,
  unit = "%",
  min = 0,
  max = 100,
  step = 1,
  onChange,
}: RangeSliderCardProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="bg-surface-container-lowest p-md rounded-xl card-shadow flex flex-col gap-sm border border-transparent hover:border-primary/20 transition-all">
      <div className="flex justify-between items-end">
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase font-semibold">
          {label}
        </span>
        <span className="font-stat-value text-headline-md font-bold text-primary">
          {value}
          {unit}
        </span>
      </div>
      <div className="w-full relative mt-xs">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2.5 rounded-lg appearance-none cursor-pointer focus:outline-none"
          style={{
            background: `linear-gradient(to right, #0d631b 0%, #0d631b ${percentage}%, #e2e2e2 ${percentage}%, #e2e2e2 100%)`,
          }}
        />
      </div>
    </div>
  );
}
