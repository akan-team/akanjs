import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { ApplicationBuildReporter } from "../app/applicationBuildReporter";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { BarrelAnalyzer, type BarrelExportTarget } from "./barrelAnalyzer";
import { createTsconfigPackageResolver, rewriteBarrelImports } from "./barrelImportsPlugin";
import {
  hasUseClientDirective,
  scanUseClientExports,
  toClientReferencePath,
  transformUseClient,
} from "./rscUseClientTransform";
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

  test("reads the directive through the leading comments only, in linear time", () => {
    expect(hasUseClientDirective('/* a */\n// b /* c\n/** d **/\n"use client";')).toBe(true);
    expect(hasUseClientDirective('/* a */ x /* b */ "use client";')).toBe(false);
    expect(hasUseClientDirective(`${"/* a */\n".repeat(40)}export const value = 1;`)).toBe(false);
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
    expect(scanUseClientExports(shapes, file).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([
      "LeaveInfo",
      "Voc",
      "ns",
      "text",
    ]);
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
  test("analyzes local, named, aliased, star and namespace re-exports while skipping type exports", async () => {
    const root = await makeTempRoot();
    const pkgDir = path.join(root, "pkg");
    await write(
      path.join(pkgDir, "index.ts"),
      [
        'export { A, B as Bee, type TypeOnly } from "./leaf";',
        'export * from "./star";',
        'export * as ns from "./namespace";',
        'export type * as typeNs from "./namespace";',
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
    expect(map?.get("ns")).toEqual({ subpath: "@scope/pkg/namespace", originalName: "ns", namespace: true });
    expect(map?.has("typeNs")).toBe(false);
    expect(map?.has("Hidden")).toBe(false);
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

  test("a name re-exported by name from a sub-barrel maps to the file that declares it", async () => {
    const root = await makeTempRoot();
    const pkgDir = path.join(root, "pkg");
    await write(
      path.join(pkgDir, "index.ts"),
      'export { A, Bee as B2 } from "./sub";\nexport { C } from "./cycleA";\n',
    );
    await write(path.join(pkgDir, "sub", "index.ts"), 'export * from "./a";\nexport { B as Bee } from "./b";\n');
    await write(path.join(pkgDir, "sub", "a.ts"), "export const A = 1;\n");
    await write(path.join(pkgDir, "sub", "b.ts"), "export const B = 2;\n");
    await write(path.join(pkgDir, "cycleA.ts"), 'export { C } from "./cycleB";\n');
    await write(path.join(pkgDir, "cycleB.ts"), 'export { C } from "./cycleA";\n');
    const analyzer = new BarrelAnalyzer({
      resolvePackage: async () => ({ pkgName: "@scope/pkg", entryFile: path.join(pkgDir, "index.ts"), pkgDir }),
    });

    const map = await analyzer.analyze("@scope/pkg");
    expect(map?.get("A")).toEqual({ subpath: "@scope/pkg/sub/a", originalName: "A" });
    expect(map?.get("B2")).toEqual({ subpath: "@scope/pkg/sub/b", originalName: "B" });
    expect(map?.get("C")).toEqual({ subpath: "@scope/pkg/cycleA", originalName: "C" });
    expect(
      (await analyzer.filesOf("@scope/pkg"))
        .map((file) => path.relative(pkgDir, file).split(path.sep).join("/"))
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(["cycleA.ts", "cycleB.ts", "index.ts", "sub/a.ts", "sub/b.ts", "sub/index.ts"]);
  });

  test("a module that calls a macro import is still read, so a name it re-exports maps past it", async () => {
    const root = await makeTempRoot();
    const pkgDir = path.join(root, "app");
    await write(path.join(pkgDir, "client.ts"), 'export { usePage, sig } from "./lib/useClient";\n');
    await write(
      path.join(pkgDir, "lib", "useClient.ts"),
      [
        'import { getSerializedSignal } from "./sig" with { type: "macro" };',
        'export { sig } from "./sigs";',
        "export const usePage = getSerializedSignal();",
        "",
      ].join("\n"),
    );
    await write(path.join(pkgDir, "lib", "sigs.ts"), "export const sig = 1;\n");
    const analyzer = new BarrelAnalyzer({
      resolvePackage: async () => ({ pkgName: "@apps/app", entryFile: path.join(pkgDir, "client.ts"), pkgDir }),
    });

    const map = await analyzer.analyze("@apps/app");
    expect(map?.get("sig")).toEqual({ subpath: "@apps/app/lib/sigs", originalName: "sig" });
    expect(map?.get("usePage")).toEqual({ subpath: "@apps/app/lib/useClient", originalName: "usePage" });
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

  test("an empty facet barrel maps no name, so an import from it is left as written", async () => {
    const root = await makeTempRoot();
    const pkgDir = path.join(root, "common");
    await write(path.join(pkgDir, "index.ts"), "export {};\n");
    const analyzer = new BarrelAnalyzer({
      resolvePackage: async () => ({ pkgName: "@libs/util/common", entryFile: path.join(pkgDir, "index.ts"), pkgDir }),
    });

    expect(await analyzer.analyze("@libs/util/common")).toEqual(new Map());
    const source = 'import { pad } from "@libs/util/common";\n';
    expect(await rewriteBarrelImports(source, ["@libs/util/common"], analyzer)).toBeNull();
  });

  test("forgets an analysis when a file beside one it read changes, under the link or the real path", async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "real/ui/index.ts"), 'export * from "./Foo";\n');
    await write(path.join(root, "real/ui/Foo.ts"), "export const Foo = 1;\n");
    await write(path.join(root, "real/other/Bar.ts"), "export const Bar = 1;\n");
    fs.symlinkSync(path.join(root, "real"), path.join(root, "linked"));
    const pkgDir = path.join(root, "linked/ui");
    const analyzer = new BarrelAnalyzer({
      resolvePackage: async () => ({ pkgName: "@scope/ui", entryFile: path.join(pkgDir, "index.ts"), pkgDir }),
    });
    const analyzed = async () => {
      await analyzer.analyze("@scope/ui");
      return analyzer;
    };

    expect([...(await analyzed()).forget([path.join(root, "real/other/Bar.ts")]).keys()]).toEqual([]);
    expect([...(await analyzed()).forget([path.join(root, "real/ui/Foo.ts")]).keys()]).toEqual(["@scope/ui"]);
    expect([...(await analyzed()).forget([path.join(pkgDir, "Created.ts")]).keys()]).toEqual(["@scope/ui"]);
    expect([...analyzer.forget([path.join(pkgDir, "Foo.ts")]).keys()]).toEqual([]);
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

  test("reads every name of an import whose braces hold comments, aliases and type-only names", async () => {
    const analyzer = fakeAnalyzer([
      ["A", { subpath: "@scope/pkg/leaf", originalName: "A" }],
      ["st", { subpath: "@scope/pkg/store", originalName: "st" }],
    ]);
    const rewrite = async (source: string) => await rewriteBarrelImports(source, ["@scope/pkg"], analyzer);
    const narrowed = 'import { A } from "@scope/pkg/leaf";\nimport { st } from "@scope/pkg/store";\n';

    expect(await rewrite('import {\n  A, // the leaf\n  st,\n} from "@scope/pkg";\n')).toBe(narrowed);
    expect(await rewrite('import { A, /* the store */ st } from "@scope/pkg";\n')).toBe(narrowed);
    expect(await rewrite('import { type Shape, A as Leaf, st as store } from "@scope/pkg";\n')).toBe(
      [
        'import { type Shape } from "@scope/pkg";',
        'import { A as Leaf } from "@scope/pkg/leaf";',
        'import { st as store } from "@scope/pkg/store";',
        "",
      ].join("\n"),
    );
    expect(await rewrite('import { "A" as quoted } from "@scope/pkg";\n')).toBeNull();
  });

  test("keeps a client barrel's runtime and store, never its module UI, when flattening an app or lib import", async () => {
    const root = await makeTempRoot();
    for (const sys of ["apps/demo", "libs/kit"]) {
      await write(
        path.join(root, sys, "client.ts"),
        [
          'export * as cnst from "./lib/cnst";',
          'export { msg, Err, usePage, fetch, sig } from "./lib/useClient";',
          'export { st, RootStore } from "./lib/st";',
          'export * as store from "./lib/st";',
          'export { Memo } from "./lib/memo";',
          "",
        ].join("\n"),
      );
      await write(path.join(root, sys, "lib/cnst.ts"), "export const Sample = 1;\n");
      await write(path.join(root, sys, "lib/useClient.ts"), "export const { msg, Err, usePage, fetch, sig } = {};\n");
      await write(path.join(root, sys, "lib/st.ts"), "export class RootStore {}\nexport const st = {};\n");
      await write(path.join(root, sys, "lib/memo/index.ts"), "export const Memo = {};\n");
    }
    await write(path.join(root, "libs/hand/client.ts"), 'export { thing } from "./lib/thing";\n');
    await write(path.join(root, "libs/hand/lib/thing.ts"), "export const thing = 1;\n");
    await write(path.join(root, "libs/half/client.ts"), 'export { st } from "./lib/st";\n');
    await write(path.join(root, "libs/half/lib/st.ts"), "export const st = {};\n");
    const analyzer = new BarrelAnalyzer({
      resolvePackage: await createTsconfigPackageResolver({
        workspace: { workspaceRoot: root },
        getTsConfig: async () => ({ compilerOptions: { paths: { "@apps/*": ["./apps/*"], "@libs/*": ["./libs/*"] } } }),
      } as never),
    });
    const barrels = ["@apps/demo/client", "@libs/kit/client", "@libs/hand/client", "@libs/half/client"];
    const rewrite = async (source: string) => await rewriteBarrelImports(source, barrels, analyzer);

    expect(await rewrite('import { Memo, st } from "@apps/demo/client";\n')).toBe(
      [
        'import "@apps/demo/lib/useClient";',
        'import "@apps/demo/lib/st";',
        'import { Memo } from "@apps/demo/lib/memo";',
        'import { st } from "@apps/demo/lib/st";',
        "",
      ].join("\n"),
    );
    expect(await rewrite('import { cnst as c, st, store, type cnst as T } from "@apps/demo/client";\n')).toBe(
      [
        'import "@apps/demo/lib/useClient";',
        'import "@apps/demo/lib/st";',
        'import { type cnst as T } from "@apps/demo/client";',
        'import { st } from "@apps/demo/lib/st";',
        'import * as c from "@apps/demo/lib/cnst";',
        'import * as store from "@apps/demo/lib/st";',
        "",
      ].join("\n"),
    );
    expect(await rewrite('import { RootStore as kit } from "@libs/kit/client";\n')).toBe(
      [
        'import "@libs/kit/lib/useClient";',
        'import "@libs/kit/lib/st";',
        'import { RootStore as kit } from "@libs/kit/lib/st";',
        "",
      ].join("\n"),
    );
    expect(await rewrite('import { thing } from "@libs/hand/client";\n')).toBe(
      ['import "@libs/hand/client";', 'import { thing } from "@libs/hand/lib/thing";', ""].join("\n"),
    );
    expect(await rewrite('import { st } from "@libs/half/client";\n')).toBe(
      ['import "@libs/half/client";', 'import { st } from "@libs/half/lib/st";', ""].join("\n"),
    );
  });

  test("gives a module importing only usePage, msg or Err from a client barrel lib/usePage, not the descriptors and stores", async () => {
    const root = await makeTempRoot();
    await write(
      path.join(root, "apps/demo/client.ts"),
      [
        'export * as cnst from "./lib/cnst";',
        'export { msg, Err, usePage } from "./lib/usePage";',
        'export { fetch, sig } from "./lib/useClient";',
        'export { st, RootStore } from "./lib/st";',
        'export { Memo } from "./lib/memo";',
        "",
      ].join("\n"),
    );
    await write(path.join(root, "apps/demo/lib/cnst.ts"), "export const Sample = 1;\n");
    await write(path.join(root, "apps/demo/lib/usePage.ts"), "export const { msg, Err, usePage, fetch, sig } = {};\n");
    await write(
      path.join(root, "apps/demo/lib/useClient.ts"),
      [
        'import { fetch as pageFetch, sig as pageSig } from "./usePage";',
        "export const fetch = pageFetch;",
        "export const sig = pageSig;",
        'export { Err, msg, usePage } from "./usePage";',
        "",
      ].join("\n"),
    );
    await write(path.join(root, "apps/demo/lib/st.ts"), "export class RootStore {}\nexport const st = {};\n");
    await write(path.join(root, "apps/demo/lib/memo/index.ts"), "export const Memo = {};\n");
    const analyzer = new BarrelAnalyzer({
      resolvePackage: await createTsconfigPackageResolver({
        workspace: { workspaceRoot: root },
        getTsConfig: async () => ({ compilerOptions: { paths: { "@apps/*": ["./apps/*"] } } }),
      } as never),
    });
    const rewrite = async (source: string) => await rewriteBarrelImports(source, ["@apps/demo/client"], analyzer);

    expect(await rewrite('import { usePage, msg as toast, Err, type cnst } from "@apps/demo/client";\n')).toBe(
      [
        'import "@apps/demo/lib/usePage";',
        'import { type cnst } from "@apps/demo/client";',
        'import { usePage, msg as toast, Err } from "@apps/demo/lib/usePage";',
        "",
      ].join("\n"),
    );
    expect(await rewrite('import { fetch, usePage } from "@apps/demo/client";\n')).toBe(
      [
        'import "@apps/demo/lib/useClient";',
        'import "@apps/demo/lib/st";',
        'import { fetch } from "@apps/demo/lib/useClient";',
        'import { usePage } from "@apps/demo/lib/usePage";',
        "",
      ].join("\n"),
    );
    expect(await rewrite('import { Memo, usePage } from "@apps/demo/client";\n')).toBe(
      [
        'import "@apps/demo/lib/useClient";',
        'import "@apps/demo/lib/st";',
        'import { Memo } from "@apps/demo/lib/memo";',
        'import { usePage } from "@apps/demo/lib/usePage";',
        "",
      ].join("\n"),
    );
    expect(
      await rewriteBarrelImports('import { cnst, Memo } from "@apps/demo/client";\n', ["@apps/demo/client"], analyzer, {
        perModule: true,
      }),
    ).toBe(
      [
        'import "@apps/demo/lib/usePage";',
        'import { Memo } from "@apps/demo/lib/memo";',
        'import * as cnst from "@apps/demo/lib/cnst";',
        "",
      ].join("\n"),
    );
  });

  test("keeps each statement's line count and writes the specifier specifierOf gives a target", async () => {
    const analyzer = fakeAnalyzer([
      ["A", { subpath: "@scope/pkg/leaf", originalName: "A" }],
      ["ns", { subpath: "@scope/pkg/namespace", originalName: "ns", namespace: true }],
    ]);
    const source = 'import {\n  A,\n  ns,\n} from "@scope/pkg";\nconsole.log(A, ns);\n';

    const rewritten = await rewriteBarrelImports(source, ["@scope/pkg"], analyzer, {
      keepLines: true,
      specifierOf: (subpath) => `./${subpath.slice("@scope/pkg/".length)}.ts`,
    });

    expect(rewritten).toBe(
      'import { A } from "./leaf.ts"; import * as ns from "./namespace.ts";\n\n\n\nconsole.log(A, ns);\n',
    );
    expect(rewritten?.split("\n")).toHaveLength(source.split("\n").length);
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

  test("writes an installed package's targets as files, which its exports map does not have to reach", async () => {
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
        `import { Link } from ${JSON.stringify(path.join(root, "node_modules/akanjs/ui/Link/index.tsx"))};`,
        `import { System } from ${JSON.stringify(path.join(root, "node_modules/akanjs/ui/System/index.tsx"))};`,
      ].join("\n")}\n`,
    );
  });

  test("maps a name an installed barrel re-exports from the package it carries beside its folder to that file", async () => {
    const root = await makeTempRoot();
    const akanjs = path.join(root, "node_modules/akanjs");
    await write(
      path.join(akanjs, "ui/index.ts"),
      'export { SessionContext, useAgent } from "../vendor/use-agentic";\nexport { outside } from "../../other/index";\nexport { Link } from "./Link";\n',
    );
    await write(path.join(akanjs, "ui/Link/index.tsx"), "export const Link = () => null;\n");
    await write(path.join(akanjs, "vendor/use-agentic/index.ts"), 'export * from "./useAgent";\n');
    await write(
      path.join(akanjs, "vendor/use-agentic/useAgent.ts"),
      "export const SessionContext = {};\nexport const useAgent = () => null;\n",
    );
    await write(path.join(root, "node_modules/other/index.ts"), "export const outside = 1;\n");
    const entry = {
      pkgName: "akanjs/ui",
      entryFile: path.join(akanjs, "ui/index.ts"),
      pkgDir: path.join(akanjs, "ui"),
    };
    const carried = { subpath: path.join(akanjs, "vendor/use-agentic/useAgent.ts"), originalName: "SessionContext" };

    const installed = await new BarrelAnalyzer({
      resolvePackage: async () => ({ ...entry, preserveFilePath: true, rootDir: akanjs }),
    }).analyze("akanjs/ui");
    const rootless = await new BarrelAnalyzer({
      resolvePackage: async () => ({ ...entry, preserveFilePath: true }),
    }).analyze("akanjs/ui");

    expect(installed?.get("SessionContext")).toEqual(carried);
    expect(installed?.get("useAgent")?.subpath).toBe(carried.subpath);
    expect(installed?.get("outside")).toEqual({ subpath: path.join(akanjs, "ui/index.ts"), originalName: "outside" });
    expect(installed?.get("Link")?.subpath).toBe(path.join(akanjs, "ui/Link/index.tsx"));
    expect(rootless?.get("SessionContext")).toEqual({
      subpath: path.join(akanjs, "ui/index.ts"),
      originalName: "SessionContext",
    });
  });

  test("narrows a re-export of barrel names like an import when asked, and leaves a namespace of the barrel whole", async () => {
    const analyzer = fakeAnalyzer([
      ["buttonRecipe", { subpath: "akanjs/ui/Recipe/button", originalName: "buttonRecipe" }],
      ["inputRecipe", { subpath: "akanjs/ui/Recipe/input", originalName: "inputRecipe" }],
      ["icons", { subpath: "akanjs/ui/Icon/icons", originalName: "icons", namespace: true }],
    ]);
    const source = [
      'export { buttonRecipe, inputRecipe as input, icons, type Recipe } from "akanjs/ui";',
      'export * as ui from "akanjs/ui";',
      'export type { Theme } from "akanjs/ui";',
      "",
    ].join("\n");

    expect(await rewriteBarrelImports(source, ["akanjs/ui"], analyzer)).toBeNull();
    expect(await rewriteBarrelImports(source, ["akanjs/ui"], analyzer, { reexports: true })).toBe(
      [
        'export { type Recipe } from "akanjs/ui";',
        'export { buttonRecipe } from "akanjs/ui/Recipe/button";',
        'export { inputRecipe as input } from "akanjs/ui/Recipe/input";',
        'export * as icons from "akanjs/ui/Icon/icons";',
        'export * as ui from "akanjs/ui";',
        'export type { Theme } from "akanjs/ui";',
        "",
      ].join("\n"),
    );
  });

  test("maps a name the barrel re-exports from a package to the package, when it resolves the same from the workspace", async () => {
    const root = await realpath(await makeTempRoot());
    const pkgDir = path.join(root, "pkgs/ui");
    await write(
      path.join(root, "node_modules/use-agentic/package.json"),
      '{ "name": "use-agentic", "main": "index.js" }',
    );
    await write(path.join(root, "node_modules/use-agentic/index.js"), "export const useAgent = () => null;\n");
    await write(path.join(root, "node_modules/use-agentic/other.js"), "export const other = 1;\n");
    await write(path.join(pkgDir, "node_modules/pinned/package.json"), '{ "name": "pinned", "main": "index.js" }');
    await write(path.join(pkgDir, "node_modules/pinned/index.js"), "export const usePinned = () => null;\n");
    await write(
      path.join(pkgDir, "index.ts"),
      [
        'export { useAgent, useAgent as useAgentReference } from "use-agentic";',
        'export { usePinned } from "pinned";',
        'export * from "./Link";',
        "",
      ].join("\n"),
    );
    await write(
      path.join(pkgDir, "Link.ts"),
      'export { other } from "use-agentic";\nexport const Link = () => null;\n',
    );
    const resolvePackage = async () => ({ pkgName: "akanjs/ui", entryFile: path.join(pkgDir, "index.ts"), pkgDir });

    const narrowed = await new BarrelAnalyzer({ resolvePackage, packageRoot: root }).analyze("akanjs/ui");
    const whole = await new BarrelAnalyzer({ resolvePackage }).analyze("akanjs/ui");

    expect(narrowed?.get("useAgent")).toEqual({ subpath: "use-agentic", originalName: "useAgent" });
    expect(narrowed?.get("useAgentReference")).toEqual({ subpath: "use-agentic", originalName: "useAgent" });
    expect(narrowed?.get("usePinned")).toEqual({ subpath: "akanjs/ui", originalName: "usePinned" });
    expect(narrowed?.get("other")).toEqual({ subpath: "akanjs/ui/Link", originalName: "other" });
    expect(whole?.get("useAgent")).toEqual({ subpath: "akanjs/ui", originalName: "useAgent" });
  });
});
