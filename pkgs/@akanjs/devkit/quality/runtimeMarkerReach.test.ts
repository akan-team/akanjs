import { describe, expect, test } from "bun:test";
import { RuntimeMarkerReach } from "./runtimeMarkerReach";

const root = "/ws";
const framework = {
  "node_modules/akanjs/ui/index.ts":
    'export { Field } from "./Field";\nexport { Button } from "./Button";\nexport type { FieldProps } from "./Field";\n',
  "node_modules/akanjs/ui/Button.tsx": '"use client";\nexport const Button = () => null;\n',
  "node_modules/akanjs/ui/Field/index.tsx":
    '"use client";\nimport { Parent } from "./Relation";\nexport interface FieldProps {}\nexport const Field = { Parent };\n',
  "node_modules/akanjs/ui/Field/Relation.tsx":
    '"use client";\nimport { useRelationOptions } from "./useRelationOptions";\nexport const Parent = () => useRelationOptions();\n',
  "node_modules/akanjs/ui/Field/useRelationOptions.ts":
    '"use client";\nimport "../modelRuntime";\nexport const useRelationOptions = () => null;\n',
  "node_modules/akanjs/ui/modelRuntime.ts": "export {};\n",
};
const pinsOf = (files: Record<string, string>) => {
  const all: Record<string, string> = { ...framework, ...files };
  const reach = new RuntimeMarkerReach(root, (absPath) => all[absPath.slice(root.length + 1)] ?? null);
  return reach.pinsOf(Object.keys(files).sort());
};
const relationChain = [
  "akanjs/ui/Field/index.tsx",
  "akanjs/ui/Field/Relation.tsx",
  "akanjs/ui/Field/useRelationOptions.ts",
];

describe("the pages a framework component reading models by name makes load the whole runtime", () => {
  test("names the imports from a page, through a lib's re-export, to the framework file importing the marker", () => {
    const pins = pinsOf({
      "apps/demo/page/memo/_index.tsx":
        'import { MemoEdit } from "@apps/demo/lib/memo/Memo.Template";\nexport default () => MemoEdit;\n',
      "apps/demo/page/about.tsx":
        '"use client";\nimport { Button, cnst } from "@libs/kit/ui";\nexport default () => [Button, cnst];\n',
      "apps/demo/lib/memo/Memo.Template.tsx":
        '"use client";\nimport { Field, type FieldProps } from "@libs/kit/ui";\nexport const MemoEdit = () => Field;\n',
      "libs/kit/ui/index.ts": 'export * as cnst from "./cnst";\nexport * from "./shim";\n',
      "libs/kit/ui/cnst.ts": "export const memo = 1;\n",
      "libs/kit/ui/shim.ts": 'export { Button, Field, type FieldProps } from "akanjs/ui";\n',
    });
    expect(pins).toEqual([
      {
        page: "apps/demo/page/memo/_index.tsx",
        chain: ["apps/demo/page/memo/_index.tsx", "apps/demo/lib/memo/Memo.Template.tsx", ...relationChain],
      },
    ]);
  });

  test("counts a layout above the page, and neither a type import nor a chain no client file is on", () => {
    const pins = pinsOf({
      "apps/demo/page/_layout.tsx": 'import { Field } from "akanjs/ui";\nexport default () => Field;\n',
      "apps/demo/page/admin/_layout.tsx": 'import type { FieldProps } from "akanjs/ui";\nexport default () => null;\n',
      "apps/demo/page/admin/user.tsx": 'import { FieldProps } from "akanjs/ui";\nexport default () => null;\n',
      "apps/demo/page/doc.tsx": 'import { marked } from "../ui/marked";\nexport default () => marked;\n',
      "apps/demo/ui/marked.ts": 'import "akanjs/ui/modelRuntime";\nexport const marked = 1;\n',
      "libs/kit/page/plain.tsx": "export default () => null;\n",
    });
    const viaLayout = ["apps/demo/page/_layout.tsx", ...relationChain];
    expect(pins).toEqual([
      { page: "apps/demo/page/admin/user.tsx", chain: viaLayout },
      { page: "apps/demo/page/doc.tsx", chain: viaLayout },
    ]);
  });

  test("leaves the pages of an app with a build report to that report, which names the routes really held", () => {
    const pins = ["apps/demo/page/a.tsx", "apps/demonstration/page/a.tsx", "libs/kit/page/a.tsx"].map((page) => ({
      page,
      chain: [page, ...relationChain],
    }));
    expect(RuntimeMarkerReach.unbuilt(pins, ["demo"]).map(({ page }) => page)).toEqual([
      "apps/demonstration/page/a.tsx",
      "libs/kit/page/a.tsx",
    ]);
    expect(RuntimeMarkerReach.unbuilt(pins, [])).toEqual(pins);
  });

  test("prints one note per file importing the framework component, with how many pages it holds", () => {
    const pages = ["a", "b", "c", "d"].map((name) => `apps/demo/page/${name}.tsx`);
    const chain = ["apps/demo/ui/Edit.tsx", ...relationChain];
    expect(RuntimeMarkerReach.format(pages.map((page) => ({ page, chain: [page, ...chain] })))).toEqual([
      "apps/demo/ui/Edit.tsx - note akan.runtime.framework-marker: reaches a framework component that reads models by name (apps/demo/ui/Edit.tsx → akanjs/ui/Field/index.tsx → akanjs/ui/Field/Relation.tsx → akanjs/ui/Field/useRelationOptions.ts). 4 pages load the whole client runtime through it: apps/demo/page/a.tsx, apps/demo/page/b.tsx, apps/demo/page/c.tsx and 1 more.",
    ]);
  });
});
