import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "_index.tsx",
    content: `
import { fetch, usePage } from "@apps/${dict.appName}/client";
import { Task } from "@apps/${dict.appName}/lib/task";
import { Link } from "akanjs/ui";

// ===== page/task/[taskId]/_index.tsx =====
// Convention: Akan.js file-based routing with dynamic segments.
// [taskId] folder = URL path parameter extracted via useParams() from akanjs/client.
// Uses usePage().l() for i18n — the framework convention for dictionary-based translations.

interface PageProps {
  params: { taskId: string };
}
export default async function Page({ params: { taskId } }: PageProps) {
  const { l } = usePage();
  const { taskView } = await fetch.viewTask(taskId);
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <a href="/task" className="btn btn-ghost btn-sm">
          {l("task.taskBackToTasks")}
        </a>
        <Link href={\`/task/\${taskId}/edit\`} className="btn btn-primary btn-sm">
          {l("task.taskEdit")}
        </Link>
      </div>

      <Task.Zone.View className="max-w-2xl" view={taskView} />
    </main>
  );
}
`,
  };
}
