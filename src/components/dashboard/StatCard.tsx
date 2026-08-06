interface StatCardProps {
  label: string;
  value: string;
  status: string;
  statusColor?: string;
  icon: string;
  iconColor?: string;
}

export function StatCard({
  label,
  value,
  status,
  statusColor = "bg-primary/10 text-primary",
  icon,
  iconColor = "text-secondary",
}: StatCardProps) {
  return (
    <div className="bg-surface rounded-xl p-md card-shadow border border-outline-variant/20 flex flex-col justify-between hover:border-primary/40 transition-all group hover:-translate-y-0.5">
      <div className="flex justify-between items-start mb-sm">
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
          {label}
        </span>
        <span className={`material-symbols-outlined ${iconColor} text-2xl transition-transform group-hover:scale-110`}>
          {icon}
        </span>
      </div>
      <div className="flex items-end gap-sm mb-xs">
        <span className="font-stat-value text-stat-value text-on-surface">
          {value}
        </span>
      </div>
      <div className="flex items-center gap-xs">
        <span className={`px-2.5 py-1 rounded-full font-label-caps text-[10px] uppercase font-bold ${statusColor}`}>
          {status}
        </span>
      </div>
    </div>
  );
}
