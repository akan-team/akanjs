import { describe, expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { createTsconfigPackageResolver } from "../transforms/barrelImportsPlugin";
import { CLIENT_BUNDLE_NAMING } from "./clientBuildTypes";
import { ClientEntriesBundler } from "./clientEntriesBundler";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { RouteClientBuilder } from "./routeClientBuilder";

const makeTempRoot = tempDirs("akan-client-entry-");

const fixtureBarrels = ["@apps/demo/client", "@libs/kit/client"];

const writeBarrelFixture = async () => {
  const root = await makeTempRoot();
  const appDir = path.join(root, "apps/demo");
  const libDir = path.join(root, "libs/kit");
  const paths = { "@apps/*": ["./apps/*"], "@libs/*": ["./libs/*"] };
  await write(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths } }));
  const writeSys = async (dir: string, prefix: string, modules: string[]) => {
    await write(
      path.join(dir, "client.ts"),
      [
        'export * as cnst from "./lib/cnst";',
        'export { msg, Err, usePage, fetch, sig } from "./lib/useClient";',
        'export { st, RootStore } from "./lib/st";',
        'export * as store from "./lib/st";',
        ...modules.map((name) => `export { ${name} } from "./lib/${name.toLowerCase()}";`),
        "",
      ].join("\n"),
    );
    await write(
      path.join(dir, "lib/useClient.ts"),
      `const runtime = Object.freeze({ mark: "${prefix}runtime-marker", msg: 1, Err: 2, usePage: 3, fetch: 4, sig: 5 });\nexport const { msg, Err, usePage, fetch, sig } = runtime;\n`,
    );
    await write(
      path.join(dir, "lib/cnst.ts"),
      `export const Sample = Object.freeze({ mark: "${prefix}cnst-marker" });\n`,
    );
    for (const name of modules)
      await write(
        path.join(dir, `lib/${name.toLowerCase()}/index.ts`),
        `import * as Zone from "./${name}.Zone";\nexport const ${name} = { Zone };\n`,
      );
  };
  await writeSys(libDir, "lib-", ["Widget"]);
  await write(
    path.join(libDir, "lib/st.ts"),
    'export class RootStore {}\nexport const st = Object.freeze({ mark: "lib-store-marker" });\n',
  );
  await write(
    path.join(libDir, "lib/widget/Widget.Zone.tsx"),
    '"use client";\nexport const Card = Object.freeze({ mark: "lib-ui-marker" });\n',
  );
  await write(
    path.join(libDir, "ui/Field.tsx"),
    '"use client";\nimport { cnst as kitCnst } from "@libs/kit/client";\nexport const Field = () => [kitCnst.Sample, "field-marker"];\n',
  );
  await writeSys(appDir, "", ["Memo", "Other"]);
  await write(
    path.join(appDir, "lib/st.ts"),
    'import { RootStore as kit } from "@libs/kit/client";\nexport class RootStore {}\nexport const st = Object.freeze({ mark: "store-marker", kit });\n',
  );
  await write(
    path.join(appDir, "lib/memo/Memo.Zone.tsx"),
    '"use client";\nimport { type cnst, Memo, st } from "@apps/demo/client";\nexport const Card = (props: { sample?: typeof cnst.Sample }) => [st, Memo, props, "memo-ui-marker"];\n',
  );
  await write(
    path.join(appDir, "lib/other/Other.Zone.tsx"),
    '"use client";\nexport const Card = Object.freeze({ mark: "other-ui-marker" });\n',
  );
  await write(path.join(appDir, "ui/A.tsx"), '"use client";\nexport const A = () => "a";\n');
  const app = {
    name: "demo",
    cwdPath: appDir,
    dist: { cwdPath: path.join(root, "dist/apps/demo") },
    workspace: { workspaceRoot: root },
    getConfig: async () => ({ barrelImports: fixtureBarrels, optimizeImports: [] }),
    getTsConfig: async () => ({ compilerOptions: { paths } }),
    getPublicEnv: () => ({}),
  } as never;
  return { root, appDir, app };
};

const bundledText = async (dir: string) =>
  (
    await Promise.all([...new Bun.Glob("**/*.js").scanSync(dir)].map((file) => Bun.file(path.join(dir, file)).text()))
  ).join("\n");

describe("route client store bootstrap", () => {
  test("wraps client entries with the client runtime and store bootstrap before re-exporting components", () => {
    const original = path.resolve("/repo/pkgs/akanjs/ui/Model/NewWrapper_Client.tsx");
    const source = RouteClientBuilder.createStoreBootstrapEntrySource({
      appName: "akan",
      originalEntry: original,
      exportNames: ["NewWrapper_Client", "default"],
    });

    expect(source).toBe(
      [
        'import "@apps/akan/lib/useClient";',
        'import "@apps/akan/lib/st";',
        `export { NewWrapper_Client } from ${JSON.stringify(original)};`,
        `export { default } from ${JSON.stringify(original)};`,
        "",
      ].join("\n"),
    );
  });

  test("remaps wrapper manifest keys back to original client entry paths", () => {
    const wrapper = "/repo/apps/akan/.akan/generated/client-entry-bootstrap/NewWrapper_Client.tsx";
    const original = "/repo/pkgs/akanjs/ui/Model/NewWrapper_Client.tsx";
    const remapped = RouteClientBuilder.resolveOriginalManifestEntry(
      "apps/akan/.akan/generated/client-entry-bootstrap/NewWrapper_Client.tsx#NewWrapper_Client",
      new Map([[wrapper, original]]),
      new Map([[wrapper, "apps/akan/.akan/generated/client-entry-bootstrap/NewWrapper_Client.tsx"]]),
      "/repo",
    );

    expect(remapped).toEqual({
      buildEntry: wrapper,
      originalEntry: original,
      name: "NewWrapper_Client",
      key: "pkgs/akanjs/ui/Model/NewWrapper_Client.tsx#NewWrapper_Client",
    });
  });

  test("emits browser chunks and assets with hash-only names", () => {
    expect(CLIENT_BUNDLE_NAMING).toEqual({
      entry: "[name]-[hash].[ext]",
      chunk: "chunks/[hash].[ext]",
      asset: "assets/[hash].[ext]",
    });
    expect(CLIENT_BUNDLE_NAMING.chunk.includes("[name]")).toBe(false);
    expect(CLIENT_BUNDLE_NAMING.asset.includes("[name]")).toBe(false);
  });

  test("keeps start SSR client React imports bare and rewrites resolved fetch imports", () => {
    const aliases = RouteClientBuilder.resolveSsrClientRuntimeAliases();

    expect(Object.keys(aliases)).not.toEqual(
      expect.arrayContaining(["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"]),
    );
    expect(aliases[Bun.resolveSync("akanjs/fetch", RouteClientBuilder.resolveAkanServerEntry())]).toBe("akanjs/fetch");
  });

  test("bundles akan fetch into production SSR client chunks", () => {
    expect(RouteClientBuilder.resolveSsrClientBundleOptions("start")).toMatchObject({
      external: expect.arrayContaining(["akanjs/fetch"]),
      externalSubpaths: ["akanjs/fetch"],
    });

    expect(RouteClientBuilder.resolveSsrClientBundleOptions("build")).toEqual({
      target: "bun",
      external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
    });
  });

  test("targets the server so SSR client chunks never resolve a browser export condition", async () => {
    const root = await makeTempRoot();
    const pkgDir = path.join(root, "node_modules/dom-conditioned-pkg");
    await write(
      path.join(pkgDir, "package.json"),
      JSON.stringify({
        name: "dom-conditioned-pkg",
        type: "module",
        exports: { ".": { browser: "./index.dom.js", default: "./index.js" } },
      }),
    );
    await write(path.join(pkgDir, "index.dom.js"), 'export const element = document.createElement("i");\n');
    await write(path.join(pkgDir, "index.js"), "export const element = null;\n");
    const entry = path.join(root, "entry.ts");
    await write(entry, 'export { element } from "dom-conditioned-pkg";\n');

    for (const command of ["start", "build"] as const) {
      const { target } = RouteClientBuilder.resolveSsrClientBundleOptions(command);
      const built = await Bun.build({ entrypoints: [entry], target, format: "esm" });

      expect(built.success).toBe(true);
      expect(await built.outputs[0].text()).not.toContain("document.createElement");
    }
  });

  test("rewrites SSR external imports to runtime aliases", () => {
    const source = [
      'import React, { useState } from "react";',
      'import { jsxDEV } from "react/jsx-dev-runtime";',
      'import { getRequest } from "/repo/pkgs/akanjs/fetch/index.ts";',
      'import "react-dom/client";',
      'import { clsx } from "clsx";',
      "",
    ].join("\n");

    expect(
      ClientEntriesBundler.rewriteExternalImportSpecifiers(source, {
        react: "/runtime/react.js",
        "react/jsx-dev-runtime": "/runtime/jsx-dev-runtime.js",
        "/repo/pkgs/akanjs/fetch/index.ts": "akanjs/fetch",
        "react-dom/client": "/runtime/react-dom-client.js",
      }),
    ).toBe(
      [
        'import React, { useState } from "/runtime/react.js";',
        'import { jsxDEV } from "/runtime/jsx-dev-runtime.js";',
        'import { getRequest } from "akanjs/fetch";',
        'import "/runtime/react-dom-client.js";',
        'import { clsx } from "clsx";',
        "",
      ].join("\n"),
    );
  });

  test("bundles every route's entries into one graph so a page never loads a module twice", async () => {
    const root = await makeTempRoot();
    const appDir = path.join(root, "apps/demo");
    const pageA = path.join(appDir, "page/a.tsx");
    const pageB = path.join(appDir, "page/b.tsx");
    const entryA = path.join(appDir, "ui/A.tsx");
    const entryB = path.join(appDir, "ui/B.tsx");
    const shared = path.join(appDir, "common/shared.ts");
    await write(pageA, 'import { A } from "../ui/A";\nexport default A;\n');
    await write(pageB, 'import { B } from "../ui/B";\nexport default B;\n');
    await write(entryA, '"use client";\nimport { mark } from "../common/shared";\nexport const A = () => mark;\n');
    await write(entryB, '"use client";\nimport { mark } from "../common/shared";\nexport const B = () => mark;\n');
    await write(shared, 'export const mark = "shared-module-marker";\n');
    const app = {
      name: "demo",
      cwdPath: appDir,
      dist: { cwdPath: path.join(root, "dist/apps/demo") },
      workspace: { workspaceRoot: root },
      getConfig: async () => ({ barrelImports: [], optimizeImports: [] }),
      getTsConfig: async () => ({ compilerOptions: { paths: {} } }),
      getPublicEnv: () => ({}),
    } as never;
    const discovery = new GraphClientEntryDiscovery({ barrelImports: [] }, async () => null);
    const build = (seeds: string[], knownEntries: Set<string>) =>
      new RouteClientBuilder({
        app,
        seeds,
        graphSeeds: [pageA, pageB],
        knownEntries,
        discovery,
        artifact: {} as never,
        browser: "chunks",
      }).build();

    const first = await build([pageA], new Set());
    const second = await build([pageB], new Set(first.newEntries));

    expect(first.newEntries).toEqual([entryA, entryB]);
    expect(first.discoveredEntries).toEqual([entryA]);
    expect(first.clientDeps).not.toContain(entryB);
    expect(Object.keys(first.clientDepsByEntry ?? {}).sort()).toEqual([entryA, entryB]);
    expect(second.newEntries).toEqual([]);
    expect(second.discoveredEntries).toEqual([entryB]);
    expect(Object.keys(second.manifestDelta)).toEqual([]);
    const clientOut = path.join(appDir, ".akan/artifact/client");
    const outputs = [...new Bun.Glob("**/*.js").scanSync(clientOut)];
    const carriers = await Promise.all(
      outputs.map(async (file) => (await Bun.file(path.join(clientOut, file)).text()).includes("shared-module-marker")),
    );
    expect(carriers.filter(Boolean)).toHaveLength(1);
  });

  test("names each entry's static chunks and the importmap specifiers every chunk imports", async () => {
    const root = await realpath(await makeTempRoot());
    const appDir = path.join(root, "apps/demo");
    const entryA = path.join(appDir, "ui/A.tsx");
    const entryB = path.join(appDir, "ui/B.tsx");
    await write(
      entryA,
      '"use client";\nimport { useState } from "react";\nimport { mark } from "../common/shared";\nexport const A = () => [useState, mark];\n',
    );
    await write(
      entryB,
      '"use client";\nimport { mark } from "../common/shared";\nexport const B = () => import("../common/lazy").then(() => mark);\n',
    );
    await write(
      path.join(appDir, "common/shared.ts"),
      'import { tag } from "akanjs/base";\nexport const mark = tag;\n',
    );
    await write(path.join(appDir, "common/lazy.ts"), 'import "tailwind-merge";\nexport const lazy = 1;\n');
    const app = {
      name: "demo",
      cwdPath: appDir,
      dist: { cwdPath: path.join(root, "dist/apps/demo") },
      workspace: { workspaceRoot: root },
      getConfig: async () => ({ barrelImports: [], optimizeImports: [] }),
      getPublicEnv: () => ({}),
    } as never;

    const bundle = await new ClientEntriesBundler({
      app,
      entries: [entryA, entryB],
      external: ["react", "akanjs/base", "tailwind-merge"],
      command: "build",
    }).bundle();

    const [urlA, sharedA] = bundle.entryChunkUrlsByAbsPath.get(entryA) ?? [];
    const [urlB, sharedB] = bundle.entryChunkUrlsByAbsPath.get(entryB) ?? [];
    expect(bundle.entryChunkUrlsByAbsPath.get(entryA)).toHaveLength(2);
    expect(bundle.entryChunkUrlsByAbsPath.get(entryB)).toHaveLength(2);
    expect(sharedA).toBe(sharedB);
    expect(bundle.externalsByChunkUrl.get(urlA ?? "")).toEqual(["react"]);
    expect(bundle.externalsByChunkUrl.get(urlB ?? "")).toEqual([]);
    expect(bundle.externalsByChunkUrl.get(sharedA ?? "")).toEqual(["akanjs/base"]);
    expect([...bundle.externalsByChunkUrl.values()].flat()).toContain("tailwind-merge");
  });

  test("a route carries the client runtime and stores, but no module UI it never imports", async () => {
    const { appDir, app } = await writeBarrelFixture();

    await new RouteClientBuilder({
      app,
      seeds: [],
      entries: [path.join(appDir, "ui/A.tsx")],
      artifact: {} as never,
      browser: "chunks",
    }).build();

    const bundled = await bundledText(path.join(appDir, ".akan/artifact/client"));
    for (const marker of ["runtime-marker", "store-marker", "lib-runtime-marker", "lib-store-marker"])
      expect(bundled).toContain(marker);
    for (const marker of ["memo-ui-marker", "other-ui-marker", "lib-ui-marker"]) expect(bundled).not.toContain(marker);
  });

  test("a route rendering one module's UI carries no other module's or lib's UI", async () => {
    const { appDir, app } = await writeBarrelFixture();

    await new RouteClientBuilder({
      app,
      seeds: [],
      entries: [path.join(appDir, "lib/memo/Memo.Zone.tsx")],
      artifact: {} as never,
      browser: "chunks",
    }).build();

    const bundled = await bundledText(path.join(appDir, ".akan/artifact/client"));
    expect(bundled).toContain("memo-ui-marker");
    expect(bundled).toContain("store-marker");
    expect(bundled).not.toContain("other-ui-marker");
    expect(bundled).not.toContain("lib-ui-marker");
  });

  test("a route's bundle runs the client runtime and the stores before the UI it renders, which reads them on load", async () => {
    const { appDir, app } = await writeBarrelFixture();
    const record = (label: string) =>
      `((globalThis as { __akanOrder?: string[] }).__akanOrder ??= []).push("${label}");`;
    await write(
      path.join(appDir, "lib/useClient.ts"),
      `${record("runtime")}\nexport const { msg, Err, usePage, fetch, sig } = { usePage: () => "page" } as Record<string, unknown>;\n`,
    );
    await write(
      path.join(appDir, "../../libs/kit/lib/st.ts"),
      `${record("lib-store")}\nexport class RootStore {}\nexport const st = Object.freeze({ mark: "lib-store-marker" });\n`,
    );
    await write(
      path.join(appDir, "lib/st.ts"),
      `import { RootStore as kit } from "@libs/kit/client";\n${record("store")}\nexport class RootStore {}\nexport const st = Object.freeze({ mark: "store-marker", kit });\n`,
    );
    await write(
      path.join(appDir, "lib/memo/Memo.Zone.tsx"),
      `"use client";\nimport { Memo, st } from "@apps/demo/client";\n${record("memo-ui")}\nexport const seen = [st.mark, typeof Memo];\n`,
    );

    await new RouteClientBuilder({
      app,
      seeds: [],
      entries: [path.join(appDir, "lib/memo/Memo.Zone.tsx")],
      artifact: {} as never,
      browser: "chunks",
    }).build();

    const clientOut = path.join(appDir, ".akan/artifact/client");
    const entries = [...new Bun.Glob("*.js").scanSync(clientOut)];
    expect(entries).toHaveLength(1);
    const loaded = (await import(path.join(clientOut, entries[0] ?? ""))) as { seen?: unknown };

    expect(loaded.seen).toEqual(["store-marker", "object"]);
    expect((globalThis as { __akanOrder?: string[] }).__akanOrder).toEqual([
      "runtime",
      "lib-store",
      "store",
      "memo-ui",
    ]);
  });

  test("a route reaching a lib's cnst through its client barrel carries no module UI", async () => {
    const { root, appDir, app } = await writeBarrelFixture();

    await new RouteClientBuilder({
      app,
      seeds: [],
      entries: [path.join(root, "libs/kit/ui/Field.tsx")],
      artifact: {} as never,
      browser: "chunks",
    }).build();

    const bundled = await bundledText(path.join(appDir, ".akan/artifact/client"));
    expect(bundled).toContain("field-marker");
    expect(bundled).toContain("lib-cnst-marker");
    for (const marker of ["memo-ui-marker", "other-ui-marker", "lib-ui-marker"]) expect(bundled).not.toContain(marker);
  });

  test("an import of the store through a client barrel discovers no module UI as a client entry", async () => {
    const { appDir, app } = await writeBarrelFixture();
    const seed = path.join(appDir, "page/_index.tsx");
    await write(seed, 'import { st } from "@apps/demo/client";\nexport default function Page() { return st; }\n');

    const discovery = new GraphClientEntryDiscovery(
      { barrelImports: fixtureBarrels },
      await createTsconfigPackageResolver(app),
    );

    expect(await discovery.discover([seed])).toEqual([]);
  });

  test("discovers client entries from installed akanjs package sources", async () => {
    const root = await makeTempRoot();
    const seed = path.join(root, "apps/demo/page/_index.tsx");
    const uiEntry = path.join(root, "node_modules/akanjs/ui/index.ts");
    const clientEntry = path.join(root, "node_modules/akanjs/ui/System/Client.tsx");
    await write(
      seed,
      'import { ClientPathWrapper } from "akanjs/ui";\nexport default function Page() { return null; }\n',
    );
    await write(uiEntry, 'export { ClientPathWrapper } from "./System/Client";\n');
    await write(clientEntry, '"use client";\nexport const ClientPathWrapper = () => null;\n');

    const entryFiles = new Map([
      ["akanjs/ui", uiEntry],
      ["akanjs/ui/System/Client.tsx", clientEntry],
    ]);
    const discovery = new GraphClientEntryDiscovery({ barrelImports: ["akanjs/ui"] }, async (specifier) => {
      const entryFile = entryFiles.get(specifier);
      if (!entryFile) return null;
      return { pkgName: specifier, entryFile, pkgDir: path.dirname(entryFile), preserveFilePath: true };
    });

    expect(await discovery.discover([seed])).toEqual([clientEntry]);
  });

  test("resolves package export wildcard subpaths for installed akanjs sources", async () => {
    const root = await makeTempRoot();
    const clientEntry = path.join(root, "node_modules/akanjs/ui/System/Client.tsx");
    await write(
      path.join(root, "node_modules/akanjs/package.json"),
      JSON.stringify({
        name: "akanjs",
        exports: {
          "./ui": "./ui/index.ts",
          "./ui/*": "./ui/*",
        },
      }),
    );
    await write(path.join(root, "node_modules/akanjs/ui/index.ts"), "export {};\n");
    await write(clientEntry, '"use client";\nexport const ClientPathWrapper = () => null;\n');

    const resolvePackage = await createTsconfigPackageResolver({
      workspace: { workspaceRoot: root },
      getTsConfig: async () => ({ compilerOptions: { paths: {} } }),
    } as never);

    expect(await resolvePackage("akanjs/ui/System/Client.tsx")).toMatchObject({
      entryFile: clientEntry,
      preserveFilePath: true,
    });
  });
});

describe("fast refresh named default function", () => {
  test("hoists a named default function into a declaration plus a trailing default export", () => {
    const source = `export default async function Page<T>(props: T) {\n  return null;\n}\n`;
    const next = RouteClientBuilder.normalizeNamedDefaultFunctionForFastRefresh(source, { path: "/app/page.tsx" });
    expect(next).toBe(`async function Page<T>(props: T) {\n  return null;\n}\n\nexport default Page;\n`);
  });

  test("leaves code quoted in a template literal or a comment alone", () => {
    const source = [
      `import { page } from "akanjs/client";`,
      `const snippet = \``,
      `export default function Page() {`,
      `  return <div />;`,
      `}\`;`,
      `/*`,
      `export default function Commented() {}`,
      `*/`,
      `export default page().render(() => <pre>{snippet}</pre>);`,
      "",
    ].join("\n");
    expect(
      RouteClientBuilder.normalizeNamedDefaultFunctionForFastRefresh(source, { path: "/app/page.tsx" }),
    ).toBeNull();
  });

  test("rewrites only the real declaration when the same name is also quoted", () => {
    const source = [
      "const snippet = `",
      "export default function Page() {}",
      "`;",
      "export default function Page() {",
      "  return snippet;",
      "}",
      "",
    ].join("\n");
    const next = RouteClientBuilder.normalizeNamedDefaultFunctionForFastRefresh(source, { path: "/app/page.tsx" });
    expect(next).toBe(
      [
        "const snippet = `",
        "export default function Page() {}",
        "`;",
        "function Page() {",
        "  return snippet;",
        "}",
        "",
        "export default Page;",
        "",
      ].join("\n"),
    );
  });

  test("leaves a file it cannot parse to the bundler", () => {
    expect(
      RouteClientBuilder.normalizeNamedDefaultFunctionForFastRefresh("export default function Page( {", {
        path: "/app/page.tsx",
      }),
    ).toBeNull();
  });
});
