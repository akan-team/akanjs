import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "Task.Unit.tsx",
    content: `import { type cnst, usePage } from "@apps/${dict.appName}/client";
import { type ModelProps, clsx } from "akanjs/client";
import { Layout } from "akanjs/ui";

// ===== Task.Unit.tsx =====
// Convention: lib/<module>/ — PascalCase .tsx, Unit suffix = card/list-item component.
// Unit receives LightModel as props via the ModelProps<modelName, LightModelType> generic from akanjs/client.
// Wraps content in Layout.Unit — Akan.js convention for navigable cards in a list.
// Uses usePage().l() for i18n — the framework convention for dictionary-based translations.
// Enum values are accessed via l("taskStatus.todo") — dotted path to dictionary enum keys.
// Invoked by Akan's data-loading zone chain: Task.Zone → Load.Units → Task.Unit.

interface CardProps extends ModelProps<"task", cnst.LightTask> {
  className?: string;
}

export const Card = ({ task, className, href }: CardProps) => {
  const { l } = usePage();
  const statusBadge = {
    todo: "badge-ghost",
    inProgress: "badge-primary",
    completed: "badge-success",
  }[task.status];

  return (
    <Layout.Unit
      className={clsx(
        "rounded-lg border border-base-content/10 bg-base-100 p-4 transition-shadow hover:shadow-md",
        className,
      )}
      href={href}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-base-content">{task.title}</span>
        <span className={clsx("badge badge-sm shrink-0", statusBadge)}>{l(\`taskStatus.\${task.status}\`)}</span>
      </div>
      {task.due && (
        <div className="mt-2 text-base-content/60 text-xs">
          {l("task.taskDueLabel")} {task.due.toDate().toLocaleDateString()}
        </div>
      )}
    </Layout.Unit>
  );
};

// ---- Expandable additional fields: ----
// Mini: smaller inline display (tag, chip style)
// export const Mini = ({ task }: MiniProps) => (
//   <span className="inline-flex items-center gap-1 text-sm">
//     <span className={clsx("badge badge-xs", statusBadge)}>{task.status}</span>
//     {task.title}
//   </span>
// );
//
// Abstract: abstracted summary display (search results, previews)
// export const Abstract = ({ task }: AbstractProps) => (
//   <div className="text-sm">{task.title} — {l("taskStatus", task.status)}</div>
// );`,
  };
}
