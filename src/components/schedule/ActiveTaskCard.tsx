import { TaskItem } from "@/lib/data";

interface ActiveTaskCardProps {
  task: TaskItem;
}

export function ActiveTaskCard({ task }: ActiveTaskCardProps) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-md card-shadow border border-primary/30 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined icon-filled">{task.icon}</span>
          </div>
          <div>
            <h3 className="font-headline-md text-body-lg font-bold text-on-surface">
              {task.title}
            </h3>
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              {task.location}
            </span>
          </div>
        </div>
        <span className="bg-secondary-container/80 text-on-secondary-container px-3 py-1 rounded-full font-label-caps text-label-caps flex items-center gap-1.5 font-bold">
          <span className="material-symbols-outlined text-sm animate-spin">sync</span>
          Đang diễn ra
        </span>
      </div>
      <div className="flex items-center gap-6 text-on-surface-variant font-body-sm text-body-sm mb-3">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base">schedule</span>
          {task.time}
        </div>
        {task.remaining && (
          <div className="flex items-center gap-1.5 text-primary font-medium">
            <span className="material-symbols-outlined text-base">hourglass_empty</span>
            {task.remaining}
          </div>
        )}
      </div>
      {/* Progress bar */}
      <div className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${task.progress || 50}%` }}
        />
      </div>
    </div>
  );
}
