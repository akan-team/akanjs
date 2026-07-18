import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "new.tsx",
    content: `import { type cnst, fetch, Task, usePage } from "@apps/${dict.appName}/client";
import { Load, Link } from "akanjs/ui";

// ===== page/task/new.tsx =====
// Convention: Server-side form page using Load.Edit from akanjs/ui.
// async Page() — server-side component that pre-initializes form data before rendering.
// Load.Edit with type="form" renders the Template inside a form wrapper with submit/cancel actions.
// onCancel="back" navigates to the previous page; onSubmit specifies the redirect after success.
// Template is reused — same Task.Template.General used for create, edit, and client-side modals.

export default async function Page() {
  const taskForm: Partial<cnst.Task> = { status: "todo" };

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <Link href="/task" className="btn btn-ghost btn-sm">
          ← Tasks
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="font-extrabold text-3xl text-base-content">New Task</h1>
        <p className="mt-1 text-base-content/60 text-sm">Create a new task with title and description</p>
      </div>
      <div className="rounded-xl border border-base-content/10 bg-base-100 p-6 shadow-sm">
        <Load.Edit slice={fetch.slice.taskInPublic} edit={taskForm} type="form" onCancel="back" onSubmit="/task">
          <Task.Template.General />
        </Load.Edit>
      </div>
    </main>
  );
}`,
  };
}
