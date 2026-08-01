import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "Task.Util.tsx",
    content: `"use client";
import { fetch, st, usePage } from "@apps/${dict.appName}/client";
import { buttonRecipe, Dropdown, Model } from "akanjs/ui";

// ===== Task.Util.tsx =====
// Convention: lib/<module>/ — PascalCase .tsx, Util suffix = action buttons/utility components.
// "use client" directive required for onClick handlers.
// Dispatches to store actions via st.do.xxx() — the Akan.js convention for invoking client-side operations.
// Uses usePage().l() for i18n — the framework convention for dictionary-based translations.
// Wraps destructive actions in Model.Remove from akanjs/ui — the framework convention for confirmation dialogs.

interface StartProps {
  taskId: string;
}

export const Start = ({ taskId }: StartProps) => (
  <button
    className={buttonRecipe({ size: "xs" }, "border-primary/20 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground")}
    onClick={() => st.do.startTask(taskId)}
  >
    {usePage().l("task.taskStart")}
  </button>
);

interface CompleteProps {
  taskId: string;
}

export const Complete = ({ taskId }: CompleteProps) => (
  <button
    className={buttonRecipe({ size: "xs" }, "border-success/20 bg-success/10 text-success hover:bg-success hover:text-success-foreground")}
    onClick={() => st.do.completeTask(taskId)}
  >
    {usePage().l("task.taskComplete")}
  </button>
);

interface RemoveProps {
  taskId: string;
}

export const Remove = ({ taskId }: RemoveProps) => (
  <Model.Remove modelId={taskId} slice={fetch.slice.task}>
    <button className={buttonRecipe({ variant: "ghost", size: "xs" }, "text-destructive")}>{usePage().l("task.taskRemove")}</button>
  </Model.Remove>
);

interface ToolboxProps {
  taskId: string;
  status: string;
}

export const Toolbox = ({ taskId, status }: ToolboxProps) => {
  const { l } = usePage();
  return (
    <Dropdown
      buttonClassName={buttonRecipe({ variant: "ghost", size: "xs" })}
      value={<span>···</span>}
      dropdownClassName="w-40 rounded-box border border-foreground/10 bg-background p-2"
      content={
        <>
          {status === "todo" && (
            <li>
              <button onClick={() => st.do.startTask(taskId)}>{l("task.taskStart")}</button>
            </li>
          )}
          {status === "inProgress" && (
            <li>
              <button onClick={() => st.do.completeTask(taskId)}>{l("task.taskComplete")}</button>
            </li>
          )}
          <li>
            <button className="text-destructive" onClick={() => st.do.removeTask(taskId)}>
              {l("task.taskRemove")}
            </button>
          </li>
        </>
      }
    />
  );
};

// ---- Expandable additional fields: ----
// Edit Button: Model.Edit wrapper — triggers modal edit form
// export const Edit = ({ taskId }: EditProps) => (
//   <Model.Edit renderTitle="title" modelId={taskId}>
//     <Task.Template.General />
//   </Model.Edit>
// );
//
// New Task Button: Model.NewWrapper — triggers new Task creation form
// export const NewTask = () => (
//   <Model.NewWrapper partial={{}}>
//     <button className={buttonRecipe({ variant: "primary", size: "sm" })}>+ New Task</button>
//   </Model.NewWrapper>
// );
`,
  };
}
