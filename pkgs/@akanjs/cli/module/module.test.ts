import { afterEach, describe, expect, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { ModuleExecutor } from "@akanjs/devkit/executors";
import { createCallRecorder, createTempModule, tempRoots } from "@akanjs/devkit/testHelpers";
import { ModuleRunner } from "./module.runner";
import { ModuleScript } from "./module.script";

afterEach(() => CommandContainer.clear());
const track = tempRoots();

describe("ModuleRunner", () => {
  test("creates full module template files in the target module directory", async () => {
    const { module } = track(await createTempModule("post"));
    const runner = new ModuleRunner();

    const files = await runner.createModuleTemplate(module);

    expect(files.abstract.filename).toBe("post.abstract.md");
    expect(files.abstract.content).toContain("# post Abstract");
    expect(files.abstract.content).toContain("Post represents post records managed by the app.");
    expect(files.abstract.content).toContain("## Rules");
    expect(files.abstract.content).not.toContain("## Purpose");
    expect(files.abstract.content).toContain("nobody creates, updates or removes one until the slice names a guard");
    expect(files.signal.content).toContain("root: None, get: Public, cru: None");
    expect(files.signal.content).toContain("init({ guards: [Public] })");
    expect(files.signal.content).not.toContain("@libs/shared/srvkit");
    expect(files.constant.filename).toBe("post.constant.ts");
    expect(files.constant.content).not.toContain("field: field(String).optional()");
    expect(files.dictionary.filename).toBe("post.dictionary.ts");
    expect(files.dictionary.content).not.toContain('field: t(["Field", "필드"])');
    expect(files.dictionary.content).toContain('t(["Post", "Post"]).desc(["Enter post.", "Post 값을 입력합니다."])');
    expect(files.dictionary.content).not.toContain("Post description");
    expect(files.service.content).toContain("serve");
    expect(files.signal.content).toContain("signal");
    expect(files.unit.filename).toBe("Post.Unit.tsx");
    expect(files.view.filename).toBe("Post.View.tsx");
    expect(files.template.filename).toBe("Post.Template.tsx");
    expect(await Bun.file(`${module.cwdPath}/post.constant.ts`).exists()).toBe(true);
    expect(await Bun.file(`${module.cwdPath}/post.abstract.md`).exists()).toBe(true);
    expect(await Bun.file(`${module.cwdPath}/Post.View.tsx`).exists()).toBe(true);
  });

  test("guards the scaffolded slice with libs/shared's Admin when the system mounts it", async () => {
    const { app, module } = track(await createTempModule("post"));
    await app.writeFile("lib/srv.ts", 'export * as shared from "@libs/shared/lib/srv";\n');

    const files = await new ModuleRunner().createModuleTemplate(module);

    expect(files.signal.content).toContain('import { Admin } from "@libs/shared/srvkit";');
    expect(files.signal.content).toContain("root: Admin, get: Public, cru: Admin");
    expect(files.signal.content).not.toContain("None");
    expect(files.abstract.content).toContain("only an admin creates, updates or removes one");
  });

  test("creates service module template files without database files", async () => {
    const { app } = track(await createTempModule("unused"));
    const service = ModuleExecutor.from(app, "_localBuild");
    const runner = new ModuleRunner();

    const files = await runner.createService(service);

    expect(files.abstract.filename).toBe("localBuild.abstract.md");
    expect(files.abstract.content).toStartWith("# localBuild Service Abstract\n");
    expect(files.abstract.content).toContain("## Rules");
    expect(files.abstract.content).not.toContain("## Agent Notes");
    expect(files.service.filename).toBe("localBuild.service.ts");
    expect(files.service.content).toContain('serve("localBuild" as const');
    expect(files.signal.content).toContain("LocalBuildEndpoint");
    expect(files.store.content).toContain('store("localBuild" as const');
    expect(files.dictionary.content).toContain('serviceDictionary(["en", "ko"])');
    expect(files.dictionary.content).not.toContain("modelDictionary");
    expect(await Bun.file(`${app.cwdPath}/lib/_localBuild/localBuild.service.ts`).exists()).toBe(true);
    expect(await Bun.file(`${app.cwdPath}/lib/_localBuild/localBuild.abstract.md`).exists()).toBe(true);
    expect(await Bun.file(`${app.cwdPath}/lib/_localBuild/localBuild.signal.ts`).exists()).toBe(true);
    expect(await Bun.file(`${app.cwdPath}/lib/_localBuild/localBuild.store.ts`).exists()).toBe(true);
    expect(await Bun.file(`${app.cwdPath}/lib/_localBuild/localBuild.dictionary.ts`).exists()).toBe(true);
    expect(await Bun.file(`${app.cwdPath}/lib/_localBuild/localBuild.constant.ts`).exists()).toBe(false);
  });

  test("creates individual component templates through the parent system", async () => {
    const { module } = track(await createTempModule("comment"));
    const runner = new ModuleRunner();

    const { component } = await runner.createComponentTemplate(module, "view");

    expect(component.filename).toBe("Comment.View.tsx");
    expect(component.content).toContain("export const General");
    expect(await Bun.file(`${module.sys.cwdPath}/lib/comment/Comment.View.tsx`).exists()).toBe(true);
  });
});

describe("ModuleScript", () => {
  test("creates module template, optionally creates crud page, and scans system", async () => {
    const script = CommandContainer.get(ModuleScript);
    const recorder = createCallRecorder();
    const sys = {
      type: "app",
      name: "demo",
      workspace: {},
      scan: async () => recorder.record("scan"),
    };
    script.moduleRunner.createModuleTemplate = async (module) => {
      recorder.record("createModuleTemplate", module.name);
      return {} as never;
    };
    script.pageScript.createCrudPage = async (module, options) =>
      recorder.record("createCrudPage", module.name, options);

    const report = await script.createModuleTemplate(sys as never, "post", { page: true });

    expect(recorder.names()).toEqual(["createModuleTemplate", "createCrudPage", "scan"]);
    expect(recorder.calls[1]?.args[1]).toMatchObject({ basePath: null, single: false });
    expect(report).toMatchObject({
      schemaVersion: 1,
      command: "create-module",
      status: "passed",
      validationCommands: [{ command: "akan verify demo" }],
    });
  });

  test("creates service module and scans system", async () => {
    const script = CommandContainer.get(ModuleScript);
    const recorder = createCallRecorder();
    const sys = {
      type: "app",
      name: "demo",
      workspace: {},
      scan: async () => recorder.record("scan"),
    };
    script.moduleRunner.createService = async (module) => {
      recorder.record("createService", module.name);
      return {} as never;
    };

    const report = await script.createService(sys as never, "localBuild");

    expect(recorder.names()).toEqual(["createService", "scan"]);
    expect(recorder.calls[0]?.args[0]).toBe("_localBuild");
    expect(report.command).toBe("create-service");
    expect(report.generatedFiles.map((file) => file.action)).toContain("sync");
  });

  test("refuses a module or service name that is not one plain path segment before writing", async () => {
    const script = CommandContainer.get(ModuleScript);
    const recorder = createCallRecorder();
    const sys = { type: "app", name: "demo", workspace: {}, scan: async () => recorder.record("scan") };
    script.moduleRunner.createModuleTemplate = async (module) => {
      recorder.record("createModuleTemplate", module.name);
      return {} as never;
    };
    script.moduleRunner.createService = async (module) => {
      recorder.record("createService", module.name);
      return {} as never;
    };

    for (const name of ["..", "../x", "a/b", "/tmp/x", ""]) {
      await expect(script.createModuleTemplate(sys as never, name)).rejects.toThrow(
        `${JSON.stringify(name)} is no module name; use letters, digits, - and _, starting with a letter`,
      );
      await expect(script.createService(sys as never, name)).rejects.toThrow(
        `${JSON.stringify(name)} is no service name`,
      );
    }

    expect(recorder.names()).toEqual([]);
  });
});
