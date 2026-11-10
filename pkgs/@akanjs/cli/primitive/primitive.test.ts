import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { ModuleExecutor } from "@akanjs/devkit/executors";
import { createTempModule, formatWithBiome, hasBiome, tempRoots, writeText } from "@akanjs/devkit/testHelpers";
import type { AddMutationInput } from "@akanjs/devkit/workflow";
import { ModuleRunner } from "../module/module.runner";
import { PrimitiveScript } from "./primitive.script";

afterEach(() => CommandContainer.clear());
const track = tempRoots();

describe("PrimitiveScript", () => {
  test("refuses a --module that is not a module name, and touches no file", async () => {
    const { root, workspace, module } = track(await createTempModule("post"));
    await new ModuleRunner().createModuleTemplate(module);
    const script = CommandContainer.get(PrimitiveScript);
    const filesOf = async () => (await Array.fromAsync(new Bun.Glob("**").scan({ cwd: root, dot: true }))).sort();
    const before = await filesOf();

    for (const name of ["..", "../x", "post/..", "a/b", "/tmp/x"]) {
      const reports = [
        await script.createUi(workspace, { app: "demo", module: name, surface: "view" }),
        await script.addField(workspace, { app: "demo", module: name, field: "priority", type: "String" }),
        await script.addEnumField(workspace, { app: "demo", module: name, field: "stage", values: "draft,done" }),
      ];
      for (const report of reports) {
        expect(report.status).toBe("failed");
        expect(report.changedFiles).toEqual([]);
        expect(report.diagnostics).toContainEqual({
          severity: "error",
          code: "primitive-input-invalid",
          message: `${JSON.stringify(name)} is no module name; use letters, digits, - and _, starting with a letter`,
          input: "module",
        });
      }
    }

    expect(await filesOf()).toEqual(before);
  });

  test("adds a source-limited field to module constant and dictionary files", async () => {
    const { workspace, module } = track(await createTempModule("post"));
    await new ModuleRunner().createModuleTemplate(module);
    const script = CommandContainer.get(PrimitiveScript);

    const report = await script.addField(workspace, {
      app: "demo",
      module: "post",
      field: "priority",
      type: "String",
    });

    expect(report.status).toBe("passed");
    expect(report.changedFiles.map((file) => file.path)).toContain("apps/demo/lib/post/post.constant.ts");
    expect(report.validationCommands.map((validation) => validation.command)).toEqual(["akan verify demo"]);
    expect(report.nextActions.map((action) => action.command)).toEqual(["akan verify demo"]);
    expect(await module.readFile("post.constant.ts")).toContain("priority: field(String),");
    const dictionary = await module.readFile("post.dictionary.ts");
    expect(dictionary).toContain(
      'priority: t(["Priority", "우선순위"]).desc(["Enter priority.", "우선순위 값을 입력합니다."])',
    );
    expect(dictionary.indexOf("priority: t(")).toBeGreaterThan(dictionary.indexOf(".model<Post>"));
    expect(dictionary.indexOf("priority: t(")).toBeLessThan(dictionary.indexOf(".insight<PostInsight>"));
  });

  test("orders priority fields and preserves existing comments", async () => {
    const { workspace, module } = track(await createTempModule("article"));
    await new ModuleRunner().createModuleTemplate(module);
    await module.writeFile(
      "article.constant.ts",
      `import { via } from "akanjs/constant";

export class ArticleInput extends via((_field) => ({
  custom: _field(String),
  // Existing description comment
  description: _field(String),
})) {}

export class ArticleObject extends via(ArticleInput, (_field) => ({})) {}

export class LightArticle extends via(ArticleObject, [] as const, (resolve) => ({})) {}

export class Article extends via(ArticleObject, LightArticle, (resolve) => ({})) {}

export class ArticleInsight extends via(Article, (_field) => ({
  title: _field(String),
})) {}
`,
    );
    await module.writeFile(
      "article.dictionary.ts",
      `import { modelDictionary } from "akanjs/dictionary";

import type { Article, ArticleInsight } from "./article.constant";
import type { ArticleEndpoint, ArticleSlice } from "./article.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) => t(["Article", "Article"]).desc(["Manage article.", "Article을 관리합니다."]))
  .model<Article>((t) => ({
    custom: t(["Custom", "Custom"]),
    // Existing description comment
    description: t(["Description", "설명"]),
  }))
  .insight<ArticleInsight>((t) => ({}))
  .slice<ArticleSlice>((fn) => ({
    title: fn(["Slice Title", "Slice Title"]),
  }))
  .endpoint<ArticleEndpoint>((fn) => ({}))
  .error({})
  .translate({});
`,
    );
    const script = CommandContainer.get(PrimitiveScript);

    const report = await script.addField(workspace, {
      app: "demo",
      module: "article",
      field: "title",
      type: "String",
    });

    expect(report.status).toBe("passed");
    const constant = await module.readFile("article.constant.ts");
    const dictionary = await module.readFile("article.dictionary.ts");
    expect(constant).toContain("title: _field(String),");
    expect(constant.indexOf("custom: _field")).toBeLessThan(constant.indexOf("title: _field"));
    expect(constant.indexOf("title: _field")).toBeLessThan(constant.indexOf("// Existing description comment"));
    expect(constant.indexOf("// Existing description comment")).toBeLessThan(constant.indexOf("description: _field"));
    expect(constant.match(/\btitle:/g)).toHaveLength(2);
    expect(dictionary.indexOf("title: t(")).toBeGreaterThan(dictionary.indexOf(".model<Article>"));
    expect(dictionary.indexOf("title: t(")).toBeLessThan(dictionary.indexOf(".slice<ArticleSlice>"));
    expect(dictionary.match(/\btitle:/g)).toHaveLength(2);
  });

  test("adds selected template surface and light projection for safe field patterns", async () => {
    const { workspace, module } = track(await createTempModule("project"));
    await new ModuleRunner().createModuleTemplate(module);
    const script = CommandContainer.get(PrimitiveScript);

    const report = await script.addField(workspace, {
      app: "demo",
      module: "project",
      field: "budget",
      type: "Float",
      defaultValue: "0",
      surfaces: ["template"],
      includeInLight: true,
    });

    expect(report.status).toBe("passed");
    expect(report.changedFiles.map((file) => file.path)).toContain("apps/demo/lib/project/Project.Template.tsx");
    const constant = await module.readFile("project.constant.ts");
    const dictionary = await module.readFile("project.dictionary.ts");
    const template = await module.readFile("Project.Template.tsx");
    expect(constant).toContain("budget: field(Float, { default: 0 }),");
    expect(constant).toContain('"budget"');
    expect(constant).toContain(`export class LightProject extends via(ProjectObject, [
  "name",
  "budget",
] as const, (resolve) => ({})) {}`);
    expect(constant).not.toContain("as const as const");
    expect(dictionary).toContain('budget: t(["Budget", "예산"]).desc(["Enter budget.", "예산 값을 입력합니다."])');
    expect(template).toContain("<Field.Number");
    expect(template).toContain('label={l("project.budget")}');
    expect(template).toContain("value={projectForm.budget}");
    expect(template).toContain("onChange={st.do.setBudgetOnProject}");
  });

  test("normalizes integer and float field type aliases", async () => {
    const { workspace, module } = track(await createTempModule("post"));
    await new ModuleRunner().createModuleTemplate(module);
    const script = CommandContainer.get(PrimitiveScript);

    const integerReport = await script.addField(workspace, {
      app: "demo",
      module: "post",
      field: "budget",
      type: "integer",
      defaultValue: "0",
    });
    const floatReport = await script.addField(workspace, {
      app: "demo",
      module: "post",
      field: "rating",
      type: "float",
      defaultValue: "0.5",
    });

    expect(integerReport.status).toBe("passed");
    expect(floatReport.status).toBe("passed");
    const constant = await module.readFile("post.constant.ts");
    expect(constant).toContain('import { Float, Int } from "akanjs/base";');
    expect(constant).toContain("budget: field(Int, { default: 0 }),");
    expect(constant).toContain("rating: field(Float, { default: 0.5 }),");
  });

  test("coerces boolean, string, and date defaults and rejects invalid numeric defaults", async () => {
    const { workspace, module } = track(await createTempModule("post"));
    await new ModuleRunner().createModuleTemplate(module);
    const script = CommandContainer.get(PrimitiveScript);

    const booleanReport = await script.addField(workspace, {
      app: "demo",
      module: "post",
      field: "published",
      type: "Boolean",
      defaultValue: "false",
    });
    const stringReport = await script.addField(workspace, {
      app: "demo",
      module: "post",
      field: "title",
      type: "String",
      defaultValue: "Untitled",
    });
    const dateReport = await script.addField(workspace, {
      app: "demo",
      module: "post",
      field: "dueAt",
      type: "Date",
      defaultValue: "2026-01-01",
    });
    const nowReport = await script.addField(workspace, {
      app: "demo",
      module: "post",
      field: "startAt",
      type: "Date",
      defaultValue: "now",
    });
    const invalidReport = await script.addField(workspace, {
      app: "demo",
      module: "post",
      field: "budget",
      type: "Int",
      defaultValue: "free",
    });

    expect(booleanReport.status).toBe("passed");
    expect(stringReport.status).toBe("passed");
    expect(dateReport.status).toBe("passed");
    expect(nowReport.status).toBe("passed");
    expect(invalidReport.status).toBe("failed");
    expect(invalidReport.diagnostics).toContainEqual(
      expect.objectContaining({ code: "primitive-default-value-invalid", input: "default" }),
    );
    const constant = await module.readFile("post.constant.ts");
    expect(constant).toContain("published: field(Boolean, { default: false }),");
    expect(constant).toContain('title: field(String, { default: "Untitled" }),');
    expect(constant).toContain('dueAt: field(Date, { default: () => dayjs("2026-01-01") }),');
    expect(constant).toContain("startAt: field(Date, { default: () => dayjs() }),");
    expect(constant).toMatch(/import \{[^}]*\bdayjs\b[^}]*\} from "akanjs\/base";/);
    expect(constant).not.toContain("budget:");
  });

  test("rejects ambiguous number field types without writing source files", async () => {
    const { workspace, module } = track(await createTempModule("post"));
    await new ModuleRunner().createModuleTemplate(module);
    const script = CommandContainer.get(PrimitiveScript);

    const lowerReport = await script.addField(workspace, {
      app: "demo",
      module: "post",
      field: "budget",
      type: "number",
    });
    const upperReport = await script.addField(workspace, {
      app: "demo",
      module: "post",
      field: "cost",
      type: "Number",
    });

    expect(lowerReport.status).toBe("failed");
    expect(upperReport.status).toBe("failed");
    expect(lowerReport.diagnostics).toContainEqual(
      expect.objectContaining({ code: "primitive-field-type-unsupported", input: "type" }),
    );
    const constant = await module.readFile("post.constant.ts");
    expect(constant).not.toContain("field(Number)");
    expect(constant).not.toContain("budget:");
    expect(constant).not.toContain("cost:");
  });

  test("fails before writing when post-edit parse verification fails", async () => {
    const { workspace, module } = track(await createTempModule("post"));
    await new ModuleRunner().createModuleTemplate(module);
    const originalConstant = await module.readFile("post.constant.ts");
    const script = CommandContainer.get(PrimitiveScript);

    const report = await script.addField(workspace, {
      app: "demo",
      module: "post",
      field: "broken",
      type: "String)",
    });

    expect(report.status).toBe("failed");
    expect(report.changedFiles).toEqual([]);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "primitive-post-edit-constant-verify-failed" }),
    );
    expect(await module.readFile("post.constant.ts")).toBe(originalConstant);
  });

  test("imports a scalar, a model or an akanjs/base type it writes, and refuses a type it cannot find", async () => {
    const { workspace, app, module } = track(await createTempModule("post"));
    await new ModuleRunner().createModuleTemplate(module);
    await app.writeFile("lib/__scalar/address/address.constant.ts", "export class Address {}\n");
    await app.writeFile("lib/owner/owner.constant.ts", "export class Owner {}\n");
    const script = CommandContainer.get(PrimitiveScript);
    const addField = async (field: string, type: string) =>
      await script.addField(workspace, { app: "demo", module: "post", field, type });

    const reports = [
      await addField("location", "Address"),
      await addField("owner", "Owner"),
      await addField("refId", "ID"),
      await addField("stops", "[Address]"),
    ];
    const written = await module.readFile("post.constant.ts");
    const unknown = await addField("tag", "Adress");

    expect(reports.map((report) => report.status)).toEqual(["passed", "passed", "passed", "passed"]);
    expect(written).toContain('import { Address } from "../__scalar/address/address.constant";');
    expect(written).toContain('import { Owner } from "../owner/owner.constant";');
    expect(written).toMatch(/import \{[^}]*\bID\b[^}]*\} from "akanjs\/base";/);
    expect(written.match(/import \{ Address \}/g)).toHaveLength(1);
    expect(written).toContain("stops: field([Address]),");
    expect(unknown).toMatchObject({ status: "failed", changedFiles: [] });
    expect(unknown.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "primitive-field-type-unknown",
        message: expect.stringContaining("Its scalars are Address. Its models are Owner, Post."),
      }),
    );
    expect(await module.readFile("post.constant.ts")).toBe(written);
  });

  test("lists no generated file, validation command or next action for a field write that fails", async () => {
    const { workspace, module } = track(await createTempModule("post"));
    await new ModuleRunner().createModuleTemplate(module);
    const script = CommandContainer.get(PrimitiveScript);
    await script.addField(workspace, { app: "demo", module: "post", field: "priority", type: "String" });

    const report = await script.addField(workspace, { app: "demo", module: "post", field: "priority", type: "String" });

    expect(report).toMatchObject({
      status: "failed",
      changedFiles: [],
      generatedFiles: [],
      validationCommands: [],
      nextActions: [],
    });
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ code: "primitive-field-exists" }));
  });

  test("adds an enum field and enum dictionary without syncing generated files", async () => {
    const { workspace, module } = track(await createTempModule("task"));
    await new ModuleRunner().createModuleTemplate(module);
    const script = CommandContainer.get(PrimitiveScript);

    const report = await script.addEnumField(workspace, {
      app: "demo",
      module: "task",
      field: "priority",
      values: "low,medium,high",
      defaultValue: "medium",
    });

    expect(report.status).toBe("passed");
    expect(report.command).toBe("add-enum-field");
    expect(report.generatedFiles.every((file) => file.action === "sync")).toBe(true);
    const constant = await module.readFile("task.constant.ts");
    const dictionary = await module.readFile("task.dictionary.ts");
    expect(constant).toContain('export class TaskPriority extends enumOf("taskPriority"');
    expect(constant).toContain('priority: field(TaskPriority, { default: "medium" }),');
    expect(dictionary).toContain('import type { Task, TaskInsight, TaskPriority } from "./task.constant";');
    expect(dictionary).toContain('.enum<TaskPriority>("taskPriority"');

    const invalidDefaultReport = await script.addEnumField(workspace, {
      app: "demo",
      module: "task",
      field: "state",
      values: "open,closed",
      defaultValue: "archived",
    });
    expect(invalidDefaultReport.status).toBe("failed");
    expect(invalidDefaultReport.diagnostics).toContainEqual(
      expect.objectContaining({ code: "primitive-default-value-invalid", input: "default" }),
    );
  });

  test("adds an enum field to the sample task module a new workspace ships", async () => {
    const { workspace, module } = track(await createTempModule("task"));
    const sampleConstant = (await import("../templates/appSample/lib/task/task.constant")).default;
    const sampleDictionary = (await import("../templates/appSample/lib/task/task.dictionary")).default;
    await module.writeFile("task.constant.ts", sampleConstant(null, { appName: "demo" }));
    await module.writeFile("task.dictionary.ts", sampleDictionary(null, { appName: "demo" }));

    const report = await CommandContainer.get(PrimitiveScript).addEnumField(workspace, {
      app: "demo",
      module: "task",
      field: "priority",
      values: "low,medium,high",
      defaultValue: "medium",
    });

    expect(report.diagnostics).toEqual([]);
    expect(report.status).toBe("passed");
    const dictionary = await module.readFile("task.dictionary.ts");
    expect(dictionary).toContain('.enum<TaskPriority>("taskPriority"');
    expect(dictionary.indexOf('.enum<TaskPriority>("taskPriority"')).toBeLessThan(dictionary.indexOf("  .error({"));
  });

  test("returns diagnostics for missing required inputs", async () => {
    const { workspace } = track(await createTempModule("unused"));
    const report = await CommandContainer.get(PrimitiveScript).addField(workspace, {
      app: "demo",
      module: null,
      field: null,
      type: null,
    });

    expect(report.status).toBe("failed");
    expect(report.diagnostics.map((diagnostic) => diagnostic.input)).toEqual(["module", "field", "type"]);
    expect(report.changedFiles).toEqual([]);
  });

  describe("addMutation", () => {
    const moduleFiles = ["document", "service", "signal", "store", "dictionary"].map((role) => `task.${role}.ts`);
    const createTaskApp = async () => {
      const temp = track(await createTempModule("task"));
      await new ModuleRunner().createModuleTemplate(temp.module);
      await writeText(
        path.join(temp.root, "apps/demo/srvkit/guards.ts"),
        'import type { Guard } from "akanjs/signal";\n\nexport class Staff implements Guard {\n  canPass() {\n    return true;\n  }\n}\n',
      );
      const add = (input: Partial<AddMutationInput>) =>
        CommandContainer.get(PrimitiveScript).addMutation(temp.workspace, {
          app: "demo",
          module: "task",
          mutation: "archiveTask",
          guards: ["Staff"],
          ...input,
        });
      return { ...temp, add };
    };
    const createNoteModule = async (app: Parameters<typeof ModuleExecutor.from>[0]) => {
      const note = ModuleExecutor.from(app, "note");
      await new ModuleRunner().createModuleTemplate(note);
      await note.writeFile(
        "note.service.ts",
        `import { serve } from "akanjs/service";

import * as db from "../db";

export class NoteService extends serve(db.note, ({ use, service }) => ({})) {
  async touchNote(taskId: string) {
    return taskId;
  }
  async sendArchived(task: unknown, reason?: string) {
    return [task, reason];
  }
  async pushCommand(command: string) {
    return command;
  }
}
`,
      );
    };
    const snapshot = async (module: ModuleExecutor) =>
      await Promise.all(moduleFiles.map((file) => module.readFile(file)));

    test("writes the chain method, service, guarded signal, store action, dictionary entry and test placeholders", async () => {
      const { module, add } = await createTaskApp();

      const report = await add({});

      expect(report.status).toBe("passed");
      expect(report.changedFiles.map((file) => `${file.action} ${file.path}`)).toEqual([
        ...moduleFiles.map((file) => `modify apps/demo/lib/task/${file}`),
        "create apps/demo/lib/task/task.signal.test.ts",
      ]);
      expect(await module.readFile("task.document.ts")).toContain(
        "export class Task extends by(cnst.Task) {\n  // any → archived.\n  archive() {\n    return this;\n  }\n}",
      );
      expect(await module.readFile("task.service.ts")).toContain(
        "  async archive(taskId: string) {\n    const task = await this.getTask(taskId);\n    return await task.archive().save();\n  }",
      );
      const signal = await module.readFile("task.signal.ts");
      expect(signal).toContain('import { Staff } from "@apps/demo/srvkit";\nimport { ID } from "akanjs/base";');
      expect(signal).toContain('import * as cnst from "../cnst";\nimport * as srv from "../srv";');
      expect(signal).toContain(
        'archiveTask: mutation(cnst.Task, { guards: [Staff] })\n    .param("taskId", ID)\n    .exec(async function (taskId) {\n      return await this.taskService.archive(taskId);',
      );
      const store = await module.readFile("task.store.ts");
      expect(store).toContain('import { fetch, sig } from "../useClient";');
      expect(store).toContain(
        "  async archiveTask(taskId: string) {\n    this.setTask(await fetch.archiveTask(taskId));\n  }",
      );
      expect(await module.readFile("task.dictionary.ts")).toContain(
        '    archiveTask: fn(["Archive Task", "Archive Task"])\n      .desc(["API to archive task", "Archive Task API"])\n      .arg((t) => ({\n        taskId: t(["Task ID", "Task ID"]).desc(["Task ID", "Task ID"]),\n      })),',
      );
      expect(await module.readFile("task.signal.test.ts")).toBe(`import { describe, it } from "bun:test";

describe("Task Signal", () => {
  it.todo("archiveTask leaves the task archived for a caller Staff admits");
  it.todo("archiveTask refuses a caller Staff turns away");
});
`);
    });

    test("bundles with-calls in a transaction and after-calls in afterCommit, injecting their services", async () => {
      const { app, module, add } = await createTaskApp();
      await createNoteModule(app);

      const before = await snapshot(module);
      const unsuppliable = await add({ afterCalls: ["note.pushCommand"] });
      expect(unsuppliable.status).toBe("failed");
      expect(unsuppliable.diagnostics).toContainEqual(
        expect.objectContaining({ severity: "error", code: "add-mutation-call-args-unresolved", input: "after" }),
      );
      expect(await snapshot(module)).toEqual(before);

      const report = await add({ withCalls: ["note.touchNote"], afterCalls: ["note.sendArchived"] });

      expect(report.status).toBe("passed");
      const service = await module.readFile("task.service.ts");
      expect(service).toContain('import * as db from "../db";\nimport type * as srv from "../srv";');
      expect(service).toContain(
        "export class TaskService extends serve(db.task, ({ use, service }) => ({\n  noteService: service<srv.NoteService>(),\n})) {",
      );
      expect(service).toContain(
        [
          "    return await this.transaction(async () => {",
          "      const task = await this.getTask(taskId);",
          "      await task.archive().save();",
          "      await this.noteService.touchNote(task.id);",
          "      await this.afterCommit(() => this.noteService.sendArchived(task));",
          "      return task;",
          "    });",
        ].join("\n"),
      );
    });

    test.skipIf(!hasBiome)("writes every file the way Biome prints it", async () => {
      const { root, app, module, add } = await createTaskApp();
      await createNoteModule(app);
      await writeText(
        path.join(root, "apps/demo/srvkit/self.ts"),
        'import type { Guard, InternalArg } from "akanjs/signal";\n\nexport class User implements Guard {\n  canPass() {\n    return true;\n  }\n}\n\nexport class Self implements InternalArg {\n  getArg() {\n    return null;\n  }\n}\n',
      );
      const report = await add({
        guards: ["User", "Public"],
        withCalls: ["note.touchNote"],
        afterCalls: ["note.sendArchived"],
      });
      expect(report.status).toBe("passed");
      expect(await module.readFile("task.signal.ts")).toContain('import { Self, User } from "@apps/demo/srvkit";');

      for (const file of [...moduleFiles, "task.signal.test.ts"]) {
        const written = await module.readFile(file);
        expect(await formatWithBiome(written, `apps/demo/lib/task/${file}`)).toBe(written);
      }
    });

    test("refuses an unknown guard, None, or no guard at all, and writes nothing", async () => {
      const { module, add } = await createTaskApp();
      const before = await snapshot(module);

      const unknown = await add({ guards: ["Nobody"] });
      const none = await add({ guards: ["None"] });
      const missing = await add({ guards: [] });

      expect(unknown.diagnostics).toContainEqual(
        expect.objectContaining({ code: "add-mutation-guard-unknown", input: "guard" }),
      );
      expect(none.diagnostics).toContainEqual(expect.objectContaining({ code: "add-mutation-guard-none" }));
      expect(missing.diagnostics).toContainEqual(expect.objectContaining({ code: "add-mutation-guard-missing" }));
      for (const report of [unknown, none, missing]) {
        expect(report.status).toBe("failed");
        expect(report.changedFiles).toEqual([]);
      }
      expect(await snapshot(module)).toEqual(before);
    });

    test("refuses a generated CRUD name and a mutation that already exists", async () => {
      const { add } = await createTaskApp();

      const crud = await add({ mutation: "removeTask" });
      expect(crud.diagnostics).toContainEqual(expect.objectContaining({ code: "add-mutation-name-reserved" }));

      expect((await add({})).status).toBe("passed");
      const again = await add({});
      expect(again.status).toBe("failed");
      expect(again.diagnostics).toContainEqual(expect.objectContaining({ code: "add-mutation-name-exists" }));
      expect(again.changedFiles).toEqual([]);
    });

    test("refuses a name another module generates or declares, which the server would refuse at boot", async () => {
      const { app, add } = await createTaskApp();
      await createNoteModule(app);

      const generated = await add({ mutation: "createNote" });
      expect(generated.status).toBe("failed");
      expect(generated.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "add-mutation-name-exists",
          message: expect.stringContaining("apps/demo/lib/note (generated for Note)"),
        }),
      );
      expect((await add({ mutation: "transactionTask" })).diagnostics).toContainEqual(
        expect.objectContaining({ code: "add-mutation-name-reserved" }),
      );
    });

    test("refuses a with-call whose service method does not exist", async () => {
      const { add } = await createTaskApp();

      const report = await add({ withCalls: ["ghost.haunt"] });

      expect(report.status).toBe("failed");
      expect(report.diagnostics).toContainEqual(
        expect.objectContaining({ severity: "error", code: "add-mutation-call-service-missing", input: "with" }),
      );
    });
  });

  describe("createInteraction", () => {
    test("writes a webkit hook over a pure common class and its test", async () => {
      const { workspace, app } = track(await createTempModule("task"));
      const create = () =>
        CommandContainer.get(PrimitiveScript).createInteraction(workspace, {
          app: "demo",
          interaction: "useBoardKeys",
        });

      const report = await create();

      expect(report.status).toBe("passed");
      expect(report.changedFiles.map((file) => file.path)).toEqual([
        "apps/demo/common/boardKeys.ts",
        "apps/demo/common/boardKeys.test.ts",
        "apps/demo/webkit/useBoardKeys.tsx",
      ]);
      const hook = await app.readFile("webkit/useBoardKeys.tsx");
      expect(hook.startsWith('"use client";\nimport { BoardKeys } from "@apps/demo/common";\n')).toBe(true);
      expect(hook).toContain("return { change };");
      expect(await app.readFile("common/boardKeys.ts")).toContain("export class BoardKeys {");
      expect(await app.readFile("common/boardKeys.test.ts")).toContain('import { BoardKeys } from "./boardKeys";');
      if (hasBiome)
        for (const file of ["common/boardKeys.ts", "common/boardKeys.test.ts", "webkit/useBoardKeys.tsx"]) {
          const written = await app.readFile(file);
          expect(await formatWithBiome(written, `apps/demo/${file}`)).toBe(written);
        }

      const again = await create();
      expect(again.status).toBe("failed");
      expect(again.diagnostics).toContainEqual(expect.objectContaining({ code: "create-interaction-exists" }));
    });
  });
});
