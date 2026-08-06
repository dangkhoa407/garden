import { TaskItem } from "@/lib/data";

interface TaskItemCardProps {
  task: TaskItem;
  onToggleComplete?: (id: string) => void;
}

export function TaskItemCard({ task, onToggleComplete }: TaskItemCardProps) {
  const isCompleted = task.status === "completed";

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-md card-shadow flex justify-between items-center transition-all border border-transparent hover:border-outline-variant ${
        isCompleted ? "opacity-75" : ""
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="w-14 text-center text-on-surface-variant flex-shrink-0">
          <div
            className={`font-stat-value text-lg leading-tight font-bold ${
              isCompleted ? "text-on-surface-variant" : "text-on-surface"
            }`}
          >
            {task.time.split(" ")[0]}
          </div>
          <div className="font-label-caps text-[10px] uppercase text-outline">
            {task.period}
          </div>
        </div>
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            isCompleted ? "bg-primary/10 text-primary" : "bg-surface-container-high text-on-surface-variant"
          }`}
        >
          <span className="material-symbols-outlined">{task.icon}</span>
        </div>
        <div>
          <h3
            className={`font-body-lg text-body-sm font-semibold ${
              isCompleted
                ? "text-on-surface-variant line-through decoration-1"
                : "text-on-surface"
            }`}
          >
            {task.title}
          </h3>
          <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            {task.location}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {task.duration && !isCompleted && (
          <span className="text-on-surface-variant font-body-sm text-xs hidden sm:inline">
            {task.duration}
          </span>
        )}
        <button
          onClick={() => onToggleComplete?.(task.id)}
          className={`px-3 py-1 rounded-full font-label-caps text-label-caps text-xs transition-colors flex items-center gap-1 ${
            isCompleted
              ? "bg-primary/10 text-primary font-bold"
              : "bg-surface-container-high text-on-surface-variant hover:bg-primary/10 hover:text-primary"
          }`}
        >
          {isCompleted ? (
            <>
              <span className="material-symbols-outlined text-sm">check</span>
              Đã xong
            </>
          ) : (
            "Đánh dấu xong"
          )}
        </button>
      </div>
    </div>
  );
}
