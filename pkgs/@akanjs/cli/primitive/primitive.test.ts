import { afterEach, describe, expect, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit";
import { ModuleRunner } from "../module/module.runner";
import { cleanupCliTempWorkspace, createTempModule } from "../testHelpers";
import { PrimitiveScript } from "./primitive.script";

const tempRoots: string[] = [];

afterEach(async () => {
  CommandContainer.clear();
  await Promise.all(tempRoots.splice(0).map((root) => cleanupCliTempWorkspace(root)));
});

describe("PrimitiveScript", () => {
  test("adds a source-limited field to module constant and dictionary files", async () => {
    const { root, workspace, module } = await createTempModule("post");
    tempRoots.push(root);
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
    expect(report.validationCommands.map((validation) => validation.command)).toContain("akan sync demo");
    expect(report.nextActions.map((action) => action.command)).toContain("akan sync demo");
    expect(await module.readFile("post.constant.ts")).toContain("priority: field(String),");
    const dictionary = await module.readFile("post.dictionary.ts");
    expect(dictionary).toContain(
      'priority: t(["Priority", "우선순위"]).desc(["Enter priority.", "우선순위 값을 입력합니다."])',
    );
    expect(dictionary.indexOf("priority: t(")).toBeGreaterThan(dictionary.indexOf(".model<Post>"));
    expect(dictionary.indexOf("priority: t(")).toBeLessThan(dictionary.indexOf(".insight<PostInsight>"));
  });

  test("orders priority fields and preserves existing comments", async () => {
    const { root, workspace, module } = await createTempModule("article");
    tempRoots.push(root);
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
    const { root, workspace, module } = await createTempModule("project");
    tempRoots.push(root);
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
    const { root, workspace, module } = await createTempModule("post");
    tempRoots.push(root);
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
    const { root, workspace, module } = await createTempModule("post");
    tempRoots.push(root);
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
    expect(invalidReport.status).toBe("failed");
    expect(invalidReport.diagnostics).toContainEqual(
      expect.objectContaining({ code: "primitive-default-value-invalid", input: "default" }),
    );
    const constant = await module.readFile("post.constant.ts");
    expect(constant).toContain("published: field(Boolean, { default: false }),");
    expect(constant).toContain('title: field(String, { default: "Untitled" }),');
    expect(constant).toContain('dueAt: field(Date, { default: new Date("2026-01-01") }),');
    expect(constant).not.toContain("budget:");
  });

  test("rejects ambiguous number field types without writing source files", async () => {
    const { root, workspace, module } = await createTempModule("post");
    tempRoots.push(root);
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
    const { root, workspace, module } = await createTempModule("post");
    tempRoots.push(root);
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

  test("adds an enum field and enum dictionary without syncing generated files", async () => {
    const { root, workspace, module } = await createTempModule("task");
    tempRoots.push(root);
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

  test("returns diagnostics for missing required inputs", async () => {
    const { root, workspace } = await createTempModule("unused");
    tempRoots.push(root);
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
});
