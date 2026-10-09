import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "_index.tsx",
    content: `import { fetch, Task, usePage } from "@apps/${dict.appName}/client";
import { jellyButtonRecipe } from "@apps/${dict.appName}/ui";
import { page } from "akanjs/client";
import { Link } from "akanjs/ui";

export default page().render(() => {
  const { l } = usePage();
  const { taskInitInPublic } = fetch.initTaskInPublic();
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-black text-4xl text-foreground">{l("task.modelName")}</h1>
          <p className="mt-1 text-foreground/60 text-sm">{l("task.modelDesc")}</p>
        </div>
        <Link href="/task/new" className={jellyButtonRecipe({ variant: "primary", size: "sm" })}>
          {l("task.taskNew")}
        </Link>
      </div>

      <Task.Zone.Card className="flex flex-col gap-3" init={taskInitInPublic} />
    </main>
  );
});`,
  };
}
