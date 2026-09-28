import { describe, expect, test } from "bun:test";
import path from "node:path";
import { ApplicationBuildReporter } from "../applicationBuildReporter";
import { tempDirs, writeText as write } from "../testHelpers";
import { BarrelAnalyzer, type BarrelExportTarget } from "./barrelAnalyzer";
import { rewriteBarrelImports } from "./barrelImportsPlugin";
import { scanUseClientExports, toClientReferencePath, transformUseClient } from "./rscUseClientTransform";
import { createUseClientBundlePlugin } from "./useClientBundlePlugin";

const makeTempRoot = tempDirs("akan-devkit-transform-");

const fakeAnalyzer = (entries: [string, BarrelExportTarget][]) =>
  ({ analyze: async () => new Map(entries) }) as unknown as BarrelAnalyzer;

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

  test("a client module with no exports stays server code and is not reported as a client module", () => {
    const reported: string[] = [];
    const onClientModule = (file: string) => reported.push(file);
    expect(
      transformUseClient('"use client";\nimport "./side-effect";\n', { path: "/repo/ui/Fx.tsx", onClientModule }),
    ).toBeNull();
    expect(reported).toEqual([]);
    expect(
      transformUseClient('"use client"; export const value = 1;', { path: "/repo/ui/V.tsx", onClientModule }),
    ).not.toBeNull();
    expect(reported).toEqual(["/repo/ui/V.tsx"]);
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

describe('export * in a "use client" module', () => {
  test("is refused with the file, the specifier and the fix, since the server would see none of its names", () => {
    const source = [
      '"use client";',
      'export * from "../../ui/UserLeave";',
      "export const General = () => null;",
      "",
    ].join("\n");
    expect(() =>
      transformUseClient(source, { path: "/repo/libs/shared/lib/user/User.Template.tsx", workspaceRoot: "/repo" }),
    ).toThrow(
      'libs/shared/lib/user/User.Template.tsx is a "use client" module, so it cannot `export * from "../../ui/UserLeave"`',
    );
    expect(() => scanUseClientExports('"use client";\nexport * from "./a";\n', "/repo/ui/Barrel.ts")).toThrow(
      "Re-export them by name",
    );
  });

  test("leaves every other export shape alone, and a module that is not a client boundary", () => {
    const file = "/repo/ui/Barrel.tsx";
    const shapes = [
      '"use client";',
      'export type * from "./types";',
      'export * as ns from "./namespace";',
      'export { LeaveInfo, Voc } from "./leave";',
      "// export * from './commented';",
      "export const text = \"export * from './a string'\";",
      "",
    ].join("\n");
    expect(scanUseClientExports(shapes, file).sort()).toEqual(["LeaveInfo", "Voc", "ns", "text"]);
    expect(scanUseClientExports('export * from "./a";\nexport const X = 1;\n', file)).toEqual(["X"]);
    const stub = transformUseClient(shapes, { path: file, workspaceRoot: "/repo" });
    expect(stub).toContain("export const LeaveInfo = registerClientReference");
    expect(stub).toContain("export const Voc = registerClientReference");
  });

  test("fails the server bundle, and the build report carries the reason out of the bundler's error", async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "Leave.tsx"), '"use client";\nexport const LeaveInfo = () => null;\n');
    await write(
      path.join(root, "Template.tsx"),
      '"use client";\nexport * from "./Leave";\nexport const General = () => null;\n',
    );
    await write(path.join(root, "page.tsx"), 'import * as Template from "./Template";\nexport const T = Template;\n');
    const failure = await Bun.build({
      entrypoints: [path.join(root, "page.tsx")],
      target: "bun",
      external: ["react-server-dom-webpack/server.node"],
      plugins: [createUseClientBundlePlugin({ workspaceRoot: root })],
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(ApplicationBuildReporter.formatError(failure)).toContain(
      'Template.tsx is a "use client" module, so it cannot `export * from "./Leave"`',
    );
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

  test("a name a module exports itself wins over the same name its star re-exports bring, as ES decides", async () => {
    const root = await makeTempRoot();
    const pkgDir = path.join(root, "pkg");
    await write(
      path.join(pkgDir, "index.ts"),
      [
        'export * from "./a";',
        'export { X } from "./c";',
        'export * from "./nested";',
        "export const Local = 1;",
        "",
      ].join("\n"),
    );
    await write(path.join(pkgDir, "a.ts"), "export const X = 2;\nexport const Local = 2;\nexport const OnlyA = 2;\n");
    await write(path.join(pkgDir, "c.ts"), "export const X = 1;\n");
    await write(path.join(pkgDir, "nested", "index.ts"), 'export * from "./deep";\nexport { Y } from "./y";\n');
    await write(path.join(pkgDir, "nested", "deep.ts"), "export const Y = 2;\n");
    await write(path.join(pkgDir, "nested", "y.ts"), "export const Y = 1;\n");
    const analyzer = new BarrelAnalyzer({
      resolvePackage: async () => ({ pkgName: "@scope/pkg", entryFile: path.join(pkgDir, "index.ts"), pkgDir }),
    });

    const runtime = (await import(path.join(pkgDir, "index.ts"))) as Record<string, number>;
    expect([runtime.X, runtime.Local, runtime.Y, runtime.OnlyA]).toEqual([1, 1, 1, 2]);
    const map = await analyzer.analyze("@scope/pkg");
    expect(map?.get("X")).toEqual({ subpath: "@scope/pkg/c", originalName: "X" });
    expect(map?.get("Local")).toEqual({ subpath: "@scope/pkg", originalName: "Local" });
    expect(map?.get("Y")).toEqual({ subpath: "@scope/pkg/nested/y", originalName: "Y" });
    expect(map?.get("OnlyA")).toEqual({ subpath: "@scope/pkg/a", originalName: "OnlyA" });
  });

  test("two analyses that interleave each keep their own place in their barrel", async () => {
    const root = await makeTempRoot();
    const barrels = { first: ["a1", "a2", "a3"], second: ["b1", "b2"] } as const;
    for (const [pkgName, names] of Object.entries(barrels)) {
      const lines = names.map((name) => `export { ${name} } from "./${name}";`);
      // Parks the second walk past the end of the first barrel, so a shared regex position would end the first early.
      const padding = pkgName === "second" ? [`// ${"-".repeat(200)}`] : [];
      await write(path.join(root, pkgName, "index.ts"), [...padding, ...lines, ""].join("\n"));
      for (const name of names) await write(path.join(root, pkgName, `${name}.ts`), `export const ${name} = 1;\n`);
    }
    const parked = { first: Promise.withResolvers<void>(), second: Promise.withResolvers<void>() };
    const released = { first: Promise.withResolvers<void>(), second: Promise.withResolvers<void>() };
    const analyzer = new BarrelAnalyzer({
      resolvePackage: async (pkgName) => ({
        pkgName,
        entryFile: path.join(root, pkgName, "index.ts"),
        pkgDir: path.join(root, pkgName),
      }),
      resolveRelative: async (fromFile, relSpec) => {
        const pkgName = path.basename(path.dirname(fromFile)) as keyof typeof barrels;
        if (relSpec === `./${barrels[pkgName][0]}`) {
          parked[pkgName].resolve();
          await released[pkgName].promise;
        }
        return path.join(path.dirname(fromFile), `${relSpec.slice(2)}.ts`);
      },
    });

    const first = analyzer.analyze("first");
    await parked.first.promise;
    const second = analyzer.analyze("second");
    await parked.second.promise;
    released.first.resolve();
    const firstMap = await first;
    released.second.resolve();
    const secondMap = await second;

    expect(firstMap?.get("a3")).toEqual({ subpath: "first/a3", originalName: "a3" });
    expect(secondMap?.get("b2")).toEqual({ subpath: "second/b2", originalName: "b2" });
  });

  test("rewrites flattenable named imports and preserves default, type, and unknown imports", async () => {
    const analyzer = fakeAnalyzer([
      ["A", { subpath: "@scope/pkg/leaf", originalName: "A" }],
      ["Bee", { subpath: "@scope/pkg/leaf", originalName: "B" }],
    ]);

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
    const analyzer = fakeAnalyzer([["st", { subpath: "@apps/demo/lib/st", originalName: "st" }]]);

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
    const analyzer = fakeAnalyzer([["AkanApp", { subpath: "akanjs/server/akanApp", originalName: "AkanApp" }]]);

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
    const analyzer = fakeAnalyzer([
      ["AkanOption", { subpath: "akanjs/server/akanOption", originalName: "AkanOption" }],
      ["Try", { subpath: "akanjs/server/decorators", originalName: "Try" }],
    ]);

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
    const analyzer = fakeAnalyzer([
      ["BottomInset", { subpath: "akanjs/ui/Layout/BottomInset", originalName: "BottomInset" }],
    ]);

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
