import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "Task.View.tsx",
    content: `import { type cnst, usePage } from "@apps/${dict.appName}/client";
import { clsx } from "akanjs/client";

// ===== Task.View.tsx =====
// Convention: lib/<module>/ — PascalCase .tsx, View suffix = detail display component.
// View receives the Full Model (cnst.Task) as props — gives access to all defined fields.
// Uses usePage().l() for i18n — the framework convention for dictionary-based translations.
// Invoked by Akan's data-loading zone chain: Task.Zone → Load.View → Task.View.

interface GeneralProps {
  className?: string;
  task: cnst.Task;
}

export const General = ({ className, task }: GeneralProps) => {
  const { l } = usePage();
  const statusColor = {
    todo: "text-base-content/50",
    inProgress: "text-primary",
    completed: "text-success",
  }[task.status];

  return (
    <div className={clsx("flex w-full flex-col gap-4", className)}>
      <div>
        <h1 className="font-bold text-2xl text-base-content">{task.title}</h1>
        <div className={clsx("mt-1 font-medium text-sm", statusColor)}>{l(\`taskStatus.\${task.status}\`)}</div>
      </div>

      {task.content && (
        <div className="rounded-lg border border-base-content/10 bg-base-100 p-4">
          <p className="whitespace-pre-wrap text-base-content/80 text-sm">{task.content}</p>
        </div>
      )}

      <div className="flex items-center gap-4 text-base-content/60 text-sm">
        <div>
          <span className="font-medium">{l("task.taskDueLabel")} </span>
          {task.due ? task.due.toDate().toLocaleDateString() : l("task.taskNoDue")}
        </div>
      </div>

      {task.workHistory && task.workHistory.length > 0 && (
        <div className="mt-2 border-base-content/10 border-t pt-4">
          <h3 className="mb-3 font-semibold text-base-content text-sm">{l("task.taskWorkHistoryTitle")}</h3>
          <ul className="space-y-2">
            {task.workHistory.map((entry, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span
                  className={clsx("badge badge-xs mt-0.5 shrink-0", {
                    "badge-ghost": entry.action === "created",
                    "badge-primary": entry.action === "started",
                    "badge-success": entry.action === "completed",
                  })}
                >
                  {l(\`workHistoryAction.\${entry.action}\`)}
                </span>
                <div>
                  <span className="text-base-content/60">{entry.at.toDate().toLocaleString()}</span>
                  {entry.note && <span className="ml-2 text-base-content/50">{entry.note}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ---- Expandable additional fields: ----
// Compact: for narrow spaces like sidebars or modals
// export const Compact = ({ className, task }: CompactProps) => (
//   <div className={clsx("text-sm", className)}>
//     <span className="font-medium">{task.title}</span>
//     {task.due && <span className="text-base-content/50 ml-2">Due: {new Date(task.due).toLocaleDateString()}</span>}
//   </div>
// );
`,
  };
}
