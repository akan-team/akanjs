import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "Task.Zone.tsx",
    content: `"use client";
import { type cnst, Task, usePage } from "@apps/${dict.appName}/client";
import type { ClientInit, ClientView } from "akanjs/fetch";
import { Link, Load } from "akanjs/ui";

// ===== Task.Zone.tsx =====
// Convention: lib/<module>/ — PascalCase .tsx, Zone suffix = composition layer between pages and UI.
// Zone components use Load.Units / Load.View from akanjs/ui — the framework convention for data-bound zones.
// Takes ClientInit / ClientView props from page loader — data is fetched server-side.
// Uses usePage().l() for i18n — the framework convention for dictionary-based translations.
// Invoked directly from page components: <Task.Zone.Card init={...} />, <Task.Zone.View view={...} />.

interface CardProps {
  className?: string;
  init: ClientInit<"task", cnst.LightTask>;
}

export const Card = ({ className, init }: CardProps) => {
  const { l } = usePage();
  return (
    <Load.Units
      className={className}
      init={init}
      renderEmpty={() => (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="text-base-content/40 text-lg">{l("task.taskNoTasks")}</div>
          <Link href="/task/new">
            <button className="btn btn-primary btn-sm">{l("task.taskCreateFirst")}</button>
          </Link>
        </div>
      )}
      renderItem={(task) => <Task.Unit.Card key={task.id} task={task} href={\`/task/\${task.id}\`} />}
    />
  );
};

interface ViewProps {
  className?: string;
  view: ClientView<"task", cnst.Task>;
}

export const View = ({ className, view }: ViewProps) => {
  return <Load.View className={className} view={view} renderView={(task) => <Task.View.General task={task} />} />;
};
`,
  };
}
