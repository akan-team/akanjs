import { afterEach, describe, expect, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { PageRunner } from "./page/page.runner";
import { PageScript } from "./page/page.script";
import { cleanupCliTempWorkspace, createCallRecorder, createTempModule } from "./testHelpers";

const tempRoots: string[] = [];

afterEach(async () => {
  CommandContainer.clear();
  await Promise.all(tempRoots.splice(0).map((root) => cleanupCliTempWorkspace(root)));
});

describe("PageRunner", () => {
  test("creates CRUD pages at default and custom base paths", async () => {
    const { root, app, module } = await createTempModule("post");
    tempRoots.push(root);
    const runner = new PageRunner();

    await runner.createCrudPage(module, { app, basePath: null, single: false });
    expect(await Bun.file(`${app.cwdPath}/page/(demo)/(public)/post/new/_index.tsx`).exists()).toBe(true);
    expect(await Bun.file(`${app.cwdPath}/page/(demo)/(public)/post/[postId]/_index.tsx`).exists()).toBe(true);

    await runner.createCrudPage(module, { app, basePath: "page/custom/post", single: true });
    expect(await Bun.file(`${app.cwdPath}/page/custom/post/_index.tsx`).exists()).toBe(true);
  });
});

describe("PageScript", () => {
  test("delegates CRUD page creation to the runner", async () => {
    const script = CommandContainer.get(PageScript);
    const recorder = createCallRecorder();
    const module = { name: "post" };
    const app = { name: "demo" };
    script.pageRunner.createCrudPage = async (...args) => recorder.record("createCrudPage", ...args);

    await script.createCrudPage(module as never, { app: app as never, basePath: "page/admin/post", single: true });
    expect(recorder.calls).toEqual([
      {
        name: "createCrudPage",
        args: [module, { app, basePath: "page/admin/post", single: true }],
      },
    ]);
  });
});
