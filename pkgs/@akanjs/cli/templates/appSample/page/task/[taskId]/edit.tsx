import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "edit.tsx",
    content: `import { fetch, Task } from "@apps/${dict.appName}/client";
import { jellyButtonRecipe } from "@apps/${dict.appName}/ui";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Link, Load } from "akanjs/ui";

export default page()
  .param("taskId", ID)
  .render(({ taskId }) => {
    const { taskEdit } = fetch.editTask(taskId);

    return (
      <main className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6">
          <Link href={\`/task/\${taskId}\`} className={jellyButtonRecipe({ variant: "ghost", size: "sm" })}>
            ← Back to Task
          </Link>
        </div>
        <div className="mb-6">
          <h1 className="font-black text-4xl text-foreground">Edit Task</h1>
          <p className="mt-1 text-foreground/60 text-sm">Update the task details</p>
        </div>
        <div className="jelly-glass rounded-box p-6">
          <Load.Edit slice={fetch.slice.taskInPublic} edit={taskEdit} type="form" onSubmit={\`/task/\${taskId}\`}>
            <Task.Template.General />
          </Load.Edit>
        </div>
      </main>
    );
  });
`,
  };
}
