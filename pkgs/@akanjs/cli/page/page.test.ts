import { describe, expect, test } from "bun:test";

type GetContent = (
  scanInfo: unknown,
  dict: { Model: string; model: string; appName: string },
) => { filename: string; content: string };

// The CRUD page scaffolds are `getContent(scanInfo, dict)` factories under templates/. They render the
// _index.tsx / edit page source a fresh workspace ships with, so their output must itself pass
// `akan typecheck`/`akan lint` without hand edits. These golden checks guard the two mistakes that are
// mechanically always avoidable: `await` inside a non-async `Page`, and app-client imports that skip the
// `@apps/*` path alias.
const templates = [
  { name: "crudPages list", path: "../templates/crudPages/page.tsx" },
  { name: "crudPages new", path: "../templates/crudPages/new/page.tsx" },
  { name: "crudPages detail", path: "../templates/crudPages/[__model__Id]/page.tsx" },
  { name: "crudPages edit", path: "../templates/crudPages/[__model__Id]/edit/page.tsx" },
  { name: "crudSinglePage", path: "../templates/crudSinglePage/page.tsx" },
] as const;

const dict = { Model: "Task", model: "task", appName: "myapp" } as const;

const renderContent = async (path: string) => {
  const mod = (await import(path)) as { default: GetContent };
  return mod.default(null, dict).content;
};

describe("crud page scaffolds", () => {
  for (const { name, path } of templates) {
    test(`${name}: a Page that awaits is declared async`, async () => {
      const content = await renderContent(path);
      if (content.includes("await ")) {
        expect(content).toContain("export default async function Page");
      }
    });

    test(`${name}: app client imports use the @apps/* alias`, async () => {
      const content = await renderContent(path);
      // Bare `from "myapp/client"` (no @apps/ prefix) fails module resolution in a generated app.
      expect(content).not.toMatch(/from\s+["']myapp\/(client|lib|server)/);
      if (content.includes("/client")) expect(content).toContain('from "@apps/myapp/client"');
    });

    test(`${name}: no unused named imports`, async () => {
      const content = await renderContent(path);
      // noUnusedImports is a Biome error in this repo, so a scaffold that imports an unused symbol would
      // fail `akan lint`. Check every named import is referenced somewhere in the body.
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
