import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BarrelAnalyzer } from "./barrelAnalyzer";
import { rewriteBarrelImports } from "./barrelImportsPlugin";
import { toClientReferencePath, transformUseClient } from "./rscUseClientTransform";

const tempRoots: string[] = [];

const makeTempRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-devkit-transform-"));
  tempRoots.push(root);
  return root;
};

const write = async (filePath: string, content: string) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("transformUseClient", () => {
  test("returns null for non-client modules and generated root layouts", () => {
    expect(transformUseClient("export const value = 1;", { path: "/repo/app/page.tsx" })).toBeNull();
    expect(
      transformUseClient('"use client"; export const value = 1;', {
        path: "/repo/apps/demo/.akan/generated/implicit-root-layout.tsx",
      }),
    ).toBeNull();
    expect(
      transformUseClient('"use client"; export const value = 1;', {
        path: "/repo/apps/demo/.akan/generated/root-layouts/admin__root_layout.tsx",
      }),
    ).toBeNull();
  });

  test("stubs named and default exports as RSC client references", () => {
    const source = [
      "// comment before directive",
      '"use client";',
      "export const Button = () => null;",
      "export function useThing() { return null; }",
      "export default function DefaultButton() { return null; }",
      "",
    ].join("\n");

    const transformed = transformUseClient(source, {
      path: "/repo/apps/demo/components/Button.tsx",
      workspaceRoot: "/repo",
    });

    expect(transformed).toContain('import { registerClientReference } from "react-server-dom-webpack/server.node";');
    expect(transformed).toContain('"apps/demo/components/Button.tsx"');
    expect(transformed).toContain("export const Button = registerClientReference");
    expect(transformed).toContain("export const useThing = registerClientReference");
    expect(transformed).toContain("export default registerClientReference");
    expect(toClientReferencePath("/repo/apps/demo/Button.tsx", "/repo")).toBe("apps/demo/Button.tsx");
  });
});

describe("BarrelAnalyzer and rewriteBarrelImports", () => {
  test("analyzes local, named, aliased, and star re-exports while skipping type and namespace exports", async () => {
    const root = await makeTempRoot();
    const pkgDir = path.join(root, "pkg");
    await write(
      path.join(pkgDir, "index.ts"),
      [
        'export { A, B as Bee, type TypeOnly } from "./leaf";',
        'export * from "./star";',
        'export * as ns from "./namespace";',
        "export const Local = 1;",
        "export type LocalType = string;",
        "",
      ].join("\n"),
    );
    await write(
      path.join(pkgDir, "leaf.ts"),
      ["export const A = 1;", "export const B = 2;", "export type TypeOnly = string;", ""].join("\n"),
    );
    await write(path.join(pkgDir, "star.ts"), "export const Star = 3;\n");
    await write(path.join(pkgDir, "namespace.ts"), "export const Hidden = 4;\n");

    const analyzer = new BarrelAnalyzer({
      resolvePackage: async () => ({ pkgName: "@scope/pkg", entryFile: path.join(pkgDir, "index.ts"), pkgDir }),
    });

    const map = await analyzer.analyze("@scope/pkg");
    expect(map?.get("A")).toEqual({ subpath: "@scope/pkg/leaf", originalName: "A" });
    expect(map?.get("Bee")).toEqual({ subpath: "@scope/pkg/leaf", originalName: "B" });
    expect(map?.get("Star")).toEqual({ subpath: "@scope/pkg/star", originalName: "Star" });
    expect(map?.get("Local")).toEqual({ subpath: "@scope/pkg", originalName: "Local" });
    expect(map?.has("TypeOnly")).toBe(false);
    expect(map?.has("ns")).toBe(false);
  });

  test("rewrites flattenable named imports and preserves default, type, and unknown imports", async () => {
    const analyzer = {
      analyze: async () =>
        new Map([
          ["A", { subpath: "@scope/pkg/leaf", originalName: "A" }],
          ["Bee", { subpath: "@scope/pkg/leaf", originalName: "B" }],
        ]),
    } as BarrelAnalyzer;

    const rewritten = await rewriteBarrelImports(
      'import DefaultExport, { A, Bee as LocalBee, type Shape, Missing } from "@scope/pkg";\nconsole.log(A);',
      ["@scope/pkg"],
      analyzer,
    );

    expect(rewritten).toBe(
      [
        'import DefaultExport, { type Shape, Missing } from "@scope/pkg";',
        'import { A, B as LocalBee } from "@scope/pkg/leaf";',
        "console.log(A);",
      ].join("\n"),
    );

    expect(await rewriteBarrelImports('import * as pkg from "@scope/pkg";', ["@scope/pkg"], analyzer)).toBeNull();
    expect(await rewriteBarrelImports('import type { A } from "@scope/pkg";', ["@scope/pkg"], analyzer)).toBeNull();
    expect(await rewriteBarrelImports('import { A } from "@other/pkg";', ["@scope/pkg"], analyzer)).toBeNull();
  });

  test("preserves generated client barrel side effects when flattening app client imports", async () => {
    const analyzer = {
      analyze: async () => new Map([["st", { subpath: "@apps/demo/lib/st", originalName: "st" }]]),
    } as BarrelAnalyzer;

    const rewritten = await rewriteBarrelImports(
      'import { st } from "@apps/demo/client";\nvoid st;\n',
      ["@apps/demo/client"],
      analyzer,
    );

    expect(rewritten).toBe(
      ['import "@apps/demo/client";', 'import { st } from "@apps/demo/lib/st";', "void st;\n"].join("\n"),
    );
  });

  test("does not rewrite import-looking code inside template literals", async () => {
    const analyzer = {
      analyze: async () => new Map([["AkanApp", { subpath: "akanjs/server/akanApp", originalName: "AkanApp" }]]),
    } as BarrelAnalyzer;

    const source = [
      'import { Code } from "@apps/docs/ui";',
      "export const Example = () => (",
      "  <Code.Snippet",
      "    code={`",
      'import { AkanApp } from "akanjs/server";',
      "",
      "void new AkanApp().start();",
      "`}",
      "  />",
      ");",
      "",
    ].join("\n");

    expect(await rewriteBarrelImports(source, ["akanjs/server"], analyzer)).toBeNull();
  });

  test("rewrites akanjs/server value imports to leaf subpaths", async () => {
    const analyzer = {
      analyze: async () =>
        new Map([
          ["AkanOption", { subpath: "akanjs/server/akanOption", originalName: "AkanOption" }],
          ["Try", { subpath: "akanjs/server/decorators", originalName: "Try" }],
        ]),
    } as BarrelAnalyzer;

    const rewritten = await rewriteBarrelImports(
      'import { AkanOption, Try } from "akanjs/server";\nexport const option = new AkanOption();\n',
      ["akanjs/server"],
      analyzer,
    );

    expect(rewritten).toBe(
      [
        'import { AkanOption } from "akanjs/server/akanOption";',
        'import { Try } from "akanjs/server/decorators";',
        "export const option = new AkanOption();\n",
      ].join("\n"),
    );
  });

  test("rewrites single-package Akan facet barrels to leaf subpaths", async () => {
    const analyzer = {
      analyze: async () =>
        new Map([["BottomInset", { subpath: "akanjs/ui/Layout/BottomInset", originalName: "BottomInset" }]]),
    } as BarrelAnalyzer;

    const rewritten = await rewriteBarrelImports('import { BottomInset } from "akanjs/ui";\n', ["akanjs/ui"], analyzer);

    expect(rewritten).toBe('import { BottomInset } from "akanjs/ui/Layout/BottomInset";\n');
  });

  test("preserves concrete file paths for package-exported barrels", async () => {
    const root = await makeTempRoot();
    await write(
      path.join(root, "node_modules/akanjs/ui/index.ts"),
      'export { Link } from "./Link";\nexport { System } from "./System";\n',
    );
    await write(path.join(root, "node_modules/akanjs/ui/Link/index.tsx"), "export const Link = () => null;\n");
    await write(path.join(root, "node_modules/akanjs/ui/System/index.tsx"), "export const System = () => null;\n");

    const analyzer = new BarrelAnalyzer({
      resolvePackage: async () => ({
        pkgName: "akanjs/ui",
        entryFile: path.join(root, "node_modules/akanjs/ui/index.ts"),
        pkgDir: path.join(root, "node_modules/akanjs/ui"),
        preserveFilePath: true,
      }),
    });

    const rewritten = await rewriteBarrelImports(
      'import { Link, System } from "akanjs/ui";\n',
      ["akanjs/ui"],
      analyzer,
    );

    expect(rewritten).toBe(
      `${[
        'import { Link } from "akanjs/ui/Link/index.tsx";',
        'import { System } from "akanjs/ui/System/index.tsx";',
      ].join("\n")}\n`,
    );
  });
});
