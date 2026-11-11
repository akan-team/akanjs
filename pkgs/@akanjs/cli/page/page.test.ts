import { afterEach, describe, expect, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { createCallRecorder, createTempModule, tempRoots } from "@akanjs/devkit/test/testHelpers";
import { PageRunner } from "./page.runner";
import { PageScript } from "./page.script";

afterEach(() => CommandContainer.clear());
const track = tempRoots();

type GetContent = (
  scanInfo: unknown,
  dict: { Model: string; model: string; appName: string; clientPath: string },
) => { filename: string; content: string };

// The CRUD page scaffolds render source a fresh workspace ships with, so it must pass typecheck and lint unedited.
const templates = [
  { name: "crudPages list", path: "../templates/crudPages/page.tsx" },
  { name: "crudPages new", path: "../templates/crudPages/new/page.tsx" },
  { name: "crudPages detail", path: "../templates/crudPages/[__model__Id]/page.tsx" },
  { name: "crudPages edit", path: "../templates/crudPages/[__model__Id]/edit/page.tsx" },
  { name: "crudSinglePage", path: "../templates/crudSinglePage/page.tsx" },
] as const;

const dict = { Model: "Task", model: "task", appName: "myapp", clientPath: "@apps/myapp/client" } as const;

const renderContent = async (path: string, clientPath: string = dict.clientPath) => {
  const mod = (await import(path)) as { default: GetContent };
  return mod.default(null, { ...dict, clientPath }).content;
};

describe("crud page scaffolds", () => {
  for (const { name, path } of templates) {
    test(`${name}: a render callback that awaits is declared async`, async () => {
      const content = await renderContent(path);
      if (content.includes("await ")) {
        expect(content).toContain(".render(async (");
      }
    });

    test(`${name}: app client imports use the @apps/* alias`, async () => {
      const content = await renderContent(path);
      // Bare `from "myapp/client"` (no @apps/ prefix) fails module resolution in a generated app.
      expect(content).not.toMatch(/from\s+["']myapp\/(client|lib|server)/);
      if (content.includes("/client")) expect(content).toContain('from "@apps/myapp/client"');
    });

    test(`${name}: a lib module imports its own lib's client`, async () => {
      const content = await renderContent(path, "@libs/shared/client");
      expect(content).not.toContain("@apps/");
      if (content.includes("/client")) expect(content).toContain('from "@libs/shared/client"');
    });

    test(`${name}: no unused named imports`, async () => {
      const content = await renderContent(path);
      // noUnusedImports is a Biome error here, so an unused scaffold import fails `akan lint`.
      for (const [, names] of content.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from/g)) {
        for (const raw of names.split(",")) {
          const symbol = raw.replace(/^\s*type\s+/, "").trim();
          if (!symbol) continue;
          const usages = content.split(new RegExp(`\\b${symbol}\\b`)).length - 1;
          expect(usages, `unused import "${symbol}" in ${name}`).toBeGreaterThan(1);
        }
      }
    });
  }
});

describe("PageRunner", () => {
  test("creates CRUD pages at default and custom base paths", async () => {
    const { app, module } = track(await createTempModule("post"));
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
