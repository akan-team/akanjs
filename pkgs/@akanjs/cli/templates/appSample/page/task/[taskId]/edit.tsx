import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "edit.tsx",
    content: `import { fetch, Task } from "@apps/${dict.appName}/client";
import { Load, Link } from "akanjs/ui";

// ===== page/task/[taskId]/edit.tsx =====
// Convention: Server-side edit form page using Load.Edit from akanjs/ui.
// async Page() — fetches model data on the server via fetch.editTask(params.taskId).
// The same Template (Task.Template.General) is reused here — no separate edit template needed.
// Load.Edit with type="form" provides the submit/cancel wrapper with the pre-loaded model.

interface PageProps {
  params: { taskId: string };
}
export default async function Page({ params: { taskId } }: PageProps) {
  const { taskEdit } = await fetch.editTask(taskId);

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <Link href={\`/task/\${taskId}\`} className="btn btn-ghost btn-sm">
          ← Back to Task
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="font-extrabold text-3xl text-base-content">Edit Task</h1>
        <p className="mt-1 text-base-content/60 text-sm">Update the task details</p>
      </div>
      <div className="rounded-xl border border-base-content/10 bg-base-100 p-6 shadow-sm">
        <Load.Edit slice={fetch.slice.taskInPublic} edit={taskEdit} type="form" onSubmit={\`/task/\${taskId}\`}>
          <Task.Template.General />
        </Load.Edit>
      </div>
    </main>
  );
}
`,
  };
}
