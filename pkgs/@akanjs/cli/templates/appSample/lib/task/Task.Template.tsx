import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "Task.Template.tsx",
    content: `"use client";
import { st, usePage } from "@apps/${dict.appName}/client";
import { clsx } from "akanjs/client";
import { Field, Layout } from "akanjs/ui";

// ===== Task.Template.tsx =====
// Convention: lib/<module>/ — PascalCase .tsx, Template suffix = form/edit template component.
// Uses akanjs/ui Field and Layout components: the framework convention for controlled form UIs.
// "use client" directive required — form events (onChange) are client-side only.
// Uses st.use.taskForm() — auto-generated form state bound to the model (handles create + edit).
// Auto-generated setters: st.do.setTitleOnTask, st.do.setContentOnTask, st.do.setDueOnTask.
// Invoked by Akan's data-loading zone chain: Task.Zone → Load.Edit → Task.Template.

interface TaskEditProps {
  className?: string;
}

export const General = ({ className }: TaskEditProps) => {
  const taskForm = st.use.taskForm();
  const { l } = usePage();

  return (
    <Layout.Template className={clsx("flex flex-col gap-4", className)}>
      <Field.Text
        label={l("task.title")}
        desc={l("task.title.desc")}
        value={taskForm.title}
        onChange={st.do.setTitleOnTask}
      />
      <Field.TextArea
        label={l("task.content")}
        desc={l("task.content.desc")}
        value={taskForm.content}
        onChange={st.do.setContentOnTask}
      />
    </Layout.Template>
  );
};`,
  };
}
