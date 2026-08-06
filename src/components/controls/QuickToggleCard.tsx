"use client";

interface QuickToggleCardProps {
  label: string;
  icon: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  activeColor?: string;
}

export function QuickToggleCard({
  label,
  icon,
  checked,
  onChange,
}: QuickToggleCardProps) {
  return (
    <div className="bg-surface-container-lowest p-md rounded-xl card-shadow flex items-center justify-between border border-transparent hover:border-primary/20 transition-all">
      <div className="flex items-center gap-sm">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            checked
              ? "bg-secondary-container text-on-secondary-container"
              : "bg-surface-container text-on-surface-variant"
          }`}
        >
          <span className="material-symbols-outlined text-xl">{icon}</span>
        </div>
        <span className="font-body-lg text-body-sm font-semibold text-on-surface">
          {label}
        </span>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
      </label>
    </div>
  );
}
