import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "_index.tsx",
    content: `import { fetch, Task, usePage } from "@apps/${dict.appName}/client";
import { Link } from "akanjs/ui";

// ===== page/task/_index.tsx =====
// Convention: Akan.js file-based routing — _index.tsx is the index page for /task.
// Server-side data loading via loader() at the page level; passes init/view props to Zone components.
// Uses usePage().l() for i18n — the framework convention for dictionary-based translations.

export default async function Page() {
  const { l } = usePage();
  const { taskInitInPublic } = await fetch.initTaskInPublic();
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-extrabold text-3xl text-base-content">{l("task.modelName")}</h1>
          <p className="mt-1 text-base-content/60 text-sm">{l("task.modelDesc")}</p>
        </div>
        <Link href="/task/new" className="btn btn-primary btn-sm">
          {l("task.taskNew")}
        </Link>
      </div>

      <Task.Zone.Card className="flex flex-col gap-3" init={taskInitInPublic} />
    </main>
  );
}`,
  };
}
