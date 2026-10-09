import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "_index.tsx",
    content: `import { fetch, Task, usePage } from "@apps/${dict.appName}/client";
import { jellyButtonRecipe } from "@apps/${dict.appName}/ui";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page()
  .param("taskId", ID)
  .render(({ taskId }) => {
    const { l } = usePage();
    const { taskView } = fetch.viewTask(taskId);
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/task" className={jellyButtonRecipe({ variant: "ghost", size: "sm" })}>
            {l("task.taskBackToTasks")}
          </Link>
          <Link href={\`/task/\${taskId}/edit\`} className={jellyButtonRecipe({ variant: "primary", size: "sm" })}>
            {l("task.taskEdit")}
          </Link>
        </div>

        <Task.Zone.View className="max-w-2xl" view={taskView} />
      </main>
    );
  });
`,
  };
}
