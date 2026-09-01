import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "Task.View.tsx",
    content: `import { type cnst, usePage } from "@apps/${dict.appName}/client";
import { cn } from "akanjs/client";
import { badgeRecipe } from "akanjs/ui";

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
    todo: "text-foreground/50",
    inProgress: "text-primary",
    completed: "text-success",
  }[task.status];

  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      <div>
        <h1 className="font-bold text-2xl text-foreground">{task.title}</h1>
        <div className={cn("mt-1 font-medium text-sm", statusColor)}>{l(\`taskStatus.\${task.status}\`)}</div>
      </div>

      {task.content && (
        <div className="rounded-lg border border-foreground/10 bg-background p-4">
          <p className="whitespace-pre-wrap text-foreground/80 text-sm">{task.content}</p>
        </div>
      )}

      <div className="flex items-center gap-4 text-foreground/60 text-sm">
        <div>
          <span className="font-medium">{l("task.taskDueLabel")} </span>
          {task.due ? task.due.toDate().toLocaleDateString() : l("task.taskNoDue")}
        </div>
      </div>

      {task.workHistory && task.workHistory.length > 0 && (
        <div className="mt-2 border-foreground/10 border-t pt-4">
          <h3 className="mb-3 font-semibold text-foreground text-sm">{l("task.taskWorkHistoryTitle")}</h3>
          <ul className="space-y-2">
            {task.workHistory.map((entry, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span
                  className={cn(
                    badgeRecipe({
                      variant:
                        entry.action === "started" ? "primary" : entry.action === "completed" ? "success" : "default",
                    }),
                    "mt-0.5 shrink-0",
                  )}
                >
                  {l(\`workHistoryAction.\${entry.action}\`)}
                </span>
                <div>
                  <span className="text-foreground/60">{entry.at.toDate().toLocaleString()}</span>
                  {entry.note && <span className="ml-2 text-foreground/50">{entry.note}</span>}
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
//   <div className={cn("text-sm", className)}>
//     <span className="font-medium">{task.title}</span>
//     {task.due && <span className="text-foreground/50 ml-2">Due: {new Date(task.due).toLocaleDateString()}</span>}
//   </div>
// );
`,
  };
}
