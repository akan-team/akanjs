import { describe, expect, test } from "bun:test";
import ts from "typescript";
import { FormSetterScanner } from "./formSetterScanner";
import type { SourceFileInfo } from "./qualityScanner";

const fileOf = (file: string, content: string): SourceFileInfo => ({
  file,
  absolutePath: `/tmp/${file}`,
  content,
  sourceFile: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
});

const scan = (content: string) =>
  new FormSetterScanner().scan([fileOf("apps/demo/lib/task/Task.Template.tsx", content)]);

describe("FormSetterScanner", () => {
  test("a setter passed by reference publishes, so nothing is reported", () => {
    expect(
      scan(`export const General = () => (
  <Field.Text value={taskForm.title} onChange={st.do.setTitleOnTask} />
);
`),
    ).toEqual([]);
  });

  test("every wrapper shape is counted once per field, whatever the wrapper was for", () => {
    const warnings = scan(`export const General = () => (
  <>
    <Field.Text onChange={st.do.setTitleOnTask} />
    <Field.ToggleSelect onChange={(type) => { st.do.setTypeOnTask(type); }} />
    <Field.Phone onChange={(phone) => st.do.setPhoneOnTask(formatPhone(phone))} />
    <Field.Parent
      onChange={(project) => {
        st.do.setProjectOnTask(project);
        if (project) st.do.addMembersOnTask(project.members ?? []);
      }}
    />
  </>
);
`);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.rule).toBe("akan.agent.unpublished-form-setter");
    expect(warnings[0]?.scope).toBe("agent");
    expect(warnings[0]?.message).toContain("setPhoneOnTask, setProjectOnTask, setTypeOnTask");
    expect(warnings[0]?.locations).toHaveLength(3);
  });

  test("a nested path write is unannotatable by design and is not counted", () => {
    expect(
      scan(`export const Rows = ({ idx }: { idx: number }) => (
  <Field.Text onChange={(title) => st.do.writeOnTask(\`payments.\${idx}.title\`, title)} />
);
`),
    ).toEqual([]);
  });

  test("a zero-parameter handler is a button setting a constant, not a form control", () => {
    expect(
      scan(`export const Actions = () => (
  <Button onClick={() => st.do.setStatusOnTask("done")}>Done</Button>
);
`),
    ).toEqual([]);
  });

  test("a non-setter action behind a wrapper is somebody else's rule", () => {
    expect(
      scan(`export const Filters = () => (
  <Select onChange={(ids) => st.do.setQueryArgsOfTaskInSelf(ids)} />
);
`),
    ).toEqual([]);
  });

  test("only .tsx is scanned", () => {
    const content = `export const set = (v: string) => <X onChange={(t) => st.do.setTitleOnTask(t)} />;\n`;
    expect(new FormSetterScanner().scan([fileOf("apps/demo/lib/task/task.store.ts", content)])).toEqual([]);
  });
});
