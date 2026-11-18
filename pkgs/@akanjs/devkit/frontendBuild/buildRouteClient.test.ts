import { describe, expect, spyOn, test } from "bun:test";
import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { StoreBootstrap } from "../artifact/storeBootstrap";
import { RouteRuntimeReport } from "../quality/routeRuntimeReport";
import { printedInOwnProcess, tempDirs, writeText as write } from "../test/testHelpers";
import { createTsconfigPackageResolver } from "../transforms/barrelImportsPlugin";
import { ModelReference } from "../transforms/modelReference";
import { RouteRuntime } from "../transforms/routeRuntime";
import { CLIENT_BUNDLE_NAMING } from "./clientBuildTypes";
import { ClientEntriesBundler } from "./clientEntriesBundler";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { RouteClientBuilder } from "./routeClientBuilder";
import { RouteModulePreloads } from "./routeModulePreloads";

const makeTempRoot = tempDirs("akan-client-entry-");

const fixtureBarrels = ["@apps/demo/client", "@libs/kit/client"];

const writeBarrelFixture = async (rootDir?: string) => {
  const root = rootDir ?? (await makeTempRoot());
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
    logger: { warn: () => undefined },
  } as never;
  return { root, appDir, app };
};

const signalFixture = `const serialized = { draft: { endpoint: { draftOf: { type: "query", args: [], returns: { refName: "draft-descriptor-ref" } } } } };
export const fetch = { ownSerializedSignal: serialized };
export const getSerializedSignalOf = (name: string) => (name === "base" ? {} : { [name]: serialized[name as "draft"] });
`;

const signalPiece = `import { getSerializedSignalOf } from "../sig" with { type: "macro" };
export const descriptors = getSerializedSignalOf("draft");
`;

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
      logger: { warn: () => undefined },
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

  describe("loading per module", () => {
    const routeFixture = async () => {
      const fixture = await writeBarrelFixture(await realpath(await makeTempRoot()));
      await write(
        path.join(fixture.appDir, `lib/${StoreBootstrap.pageRuntime}.ts`),
        'export const mark = Object.freeze({ mark: "page-runtime-only" });\n',
      );
      await write(
        path.join(fixture.appDir, `lib/${StoreBootstrap.baseDescriptors}.ts`),
        'export const base = Object.freeze({ mark: "base-descriptors" });\n',
      );
      await write(path.join(fixture.appDir, `lib/${ModelReference.registry}.ts`), "export {};\n");
      for (const file of StoreBootstrap.assembled)
        await write(
          path.join(fixture.appDir, `lib/${file}.ts`),
          `export const st = Object.freeze({ mark: "assembled:${file}" });\nexport const { fetch, sig } = st as never;\n`,
        );
      const akanjsRoot = path.dirname(Bun.resolveSync("akanjs/package.json", import.meta.dir));
      for (const file of ["package.json", "store/baseSt.ts", "signal/base.signal.ts", "signal/agent.signal.ts"])
        await write(
          path.join(fixture.root, "node_modules/akanjs", file),
          await Bun.file(path.join(akanjsRoot, file)).text(),
        );
      const warnings: string[] = [];
      const said: string[] = [];
      const app = {
        ...(fixture.app as object),
        logger: { warn: (message: string) => warnings.push(message) },
        log: (message: string) => said.push(message),
        verbose: () => undefined,
      } as never;
      return { ...fixture, app, warnings, said };
    };
    const build = (app: never, entry: string) =>
      new RouteClientBuilder({ app, seeds: [], entries: [entry], artifact: {} as never, browser: "chunks" }).build();

    test("a store-free route's browser chunks carry the page runtime and the framework's own descriptors, its SSR chunks the whole runtime", async () => {
      const { appDir, app, warnings } = await routeFixture();
      const entry = path.join(appDir, "ui/A.tsx");

      const result = await build(app, entry);

      const browser = await bundledText(path.join(appDir, ".akan/artifact/client"));
      const ssr = await bundledText(path.join(appDir, ".akan/artifact/client-ssr"));
      for (const marker of ["page-runtime-only", "base-descriptors"]) expect(browser).toContain(marker);
      for (const marker of ['"runtime-marker"', '"store-marker"', "lib-store-marker"])
        expect(browser).not.toContain(marker);
      for (const marker of ['"runtime-marker"', '"store-marker"', "lib-store-marker"]) expect(ssr).toContain(marker);
      expect(warnings).toEqual([]);
      expect(Object.keys(result.manifestDelta)).toEqual(["apps/demo/ui/A.tsx#A"]);
      const row = result.manifestDelta["apps/demo/ui/A.tsx#A"];
      expect(result.ssrManifestDelta.moduleMap[row?.id ?? ""]?.A?.id).toContain(`${path.sep}client-ssr${path.sep}`);
    });

    const assembledMarkers = StoreBootstrap.assembled.map((file) => `assembled:${file}`);

    test("a framework file importing the model runtime marker keeps the whole runtime a build of every module loads", async () => {
      const { root, appDir, app } = await routeFixture();
      const entry = path.join(root, "node_modules/akanjs/ui/Data/List.tsx");
      await write(path.join(root, "node_modules/akanjs/ui/modelRuntime.ts"), "export {};\n");
      await write(entry, '"use client";\nimport "../modelRuntime";\nexport const List = () => "list-marker";\n');

      await build(app, entry);

      const browser = await bundledText(path.join(appDir, ".akan/artifact/client"));
      for (const marker of ["list-marker", '"runtime-marker"', '"store-marker"']) expect(browser).toContain(marker);
      for (const marker of assembledMarkers) expect(browser).not.toContain(marker);
    });

    test("a file reading a store by a name picked at run time keeps the whole runtime, with no copy assembled from pieces", async () => {
      const { appDir, app } = await routeFixture();
      const entry = path.join(appDir, "ui/Pick.tsx");
      await write(
        entry,
        '"use client";\nimport { st } from "@apps/demo/client";\nexport const Pick = (name: string) => [st.use[name], "pick-marker"];\n',
      );

      await build(app, entry);

      const browser = await bundledText(path.join(appDir, ".akan/artifact/client"));
      for (const marker of ["pick-marker", '"runtime-marker"', '"store-marker"']) expect(browser).toContain(marker);
      for (const marker of assembledMarkers) expect(browser).not.toContain(marker);
    });

    const writeStorePieces = async (appDir: string) => {
      for (const [name, key] of [
        ["draft", "draftText"],
        ["tally", "tallyCount"],
      ]) {
        await write(
          path.join(appDir, `lib/_${name}/${name}.store.ts`),
          `import { store } from "akanjs/store";\nexport class ${name}Store extends store("${name}" as const, () => ({ ${key}: 0 })) {}\n`,
        );
        await write(
          path.join(appDir, `lib/__client/${name}.st.ts`),
          `export const ${name} = Object.freeze({ mark: "piece:${name}.st" });\n(globalThis as { pieces?: unknown[] }).pieces?.push(${name});\n`,
        );
      }
      await write(
        path.join(appDir, `lib/${StoreBootstrap.pageRuntime}.ts`),
        'export const st = Object.freeze({ mark: "page-runtime-only", use: { draftText: () => 0 } });\n',
      );
    };
    const writeDraftEntry = async (appDir: string) => {
      const entry = path.join(appDir, "ui/Draft.tsx");
      await write(
        entry,
        '"use client";\nimport { st } from "@apps/demo/client";\nexport const Draft = () => [st.use.draftText(), "draft-ui-marker"];\n',
      );
      return entry;
    };
    const wholeOrOtherPieces = ["piece:tally.st", ...assembledMarkers, '"runtime-marker"', '"store-marker"'];

    test("a file naming one module's state brings that module's store piece, no other module's and no assembled runtime", async () => {
      const { appDir, app } = await routeFixture();
      await writeStorePieces(appDir);

      await build(app, await writeDraftEntry(appDir));

      const browser = await bundledText(path.join(appDir, ".akan/artifact/client"));
      for (const marker of ["draft-ui-marker", "page-runtime-only", "piece:draft.st"])
        expect(browser).toContain(marker);
      for (const marker of wholeOrOtherPieces) expect(browser).not.toContain(marker);
    });

    test("a file importing one module's store piece by hand brings that piece and keeps the whole runtime", async () => {
      const { appDir, app } = await routeFixture();
      await writeStorePieces(appDir);
      const entry = path.join(appDir, "ui/Hand.tsx");
      await write(
        entry,
        '"use client";\nimport "@apps/demo/lib/__client/draft.st";\nexport const Hand = () => "hand-ui-marker";\n',
      );

      await build(app, entry);

      const browser = await bundledText(path.join(appDir, ".akan/artifact/client"));
      for (const marker of ["hand-ui-marker", "piece:draft.st", '"runtime-marker"', '"store-marker"'])
        expect(browser).toContain(marker);
      for (const marker of ["piece:tally.st", ...assembledMarkers]) expect(browser).not.toContain(marker);
    });

    describe("a build told which entries each route loads", () => {
      const seen = "((globalThis as { __akanSeen?: string[] }).__akanSeen ??= [])";
      const weightOf = (hashes: number, salt: string) =>
        hashes > 0
          ? `(globalThis as { __akanWeight?: string[] }).__akanWeight = ["${Array.from({ length: hashes }, (_, index) => Bun.hash(`${salt}-${index}`).toString(36)).join("")}"];\n`
          : "";
      const describedSignal = `const serialized = {
  draft: { endpoint: { draftOf: { type: "query", args: [], returns: { refName: "draft-descriptor-ref" } } } },
  tally: { endpoint: { tallyOf: { type: "query", args: [], returns: { refName: "tally-descriptor-ref" } } } },
};
export const fetch = { ownSerializedSignal: serialized };
export const getSerializedSignal = () => serialized;
export const getSerializedSignalOf = (name: string) => (name === "base" ? {} : { [name]: serialized[name as "draft"] });
`;
      const picking =
        '"use client";\nimport { st } from "@apps/demo/client";\nexport const Pick = (name: string) => [st.use[name], "pick-marker"];\n';
      const namingDraft =
        'import { st } from "@apps/demo/client";\nexport const shared = () => [st.use.draftText(), "shared-marker"];\n';
      const describedFixture = async ({ whole = 600, draft = 0, tally = 0 } = {}) => {
        const fixture = await routeFixture();
        const { appDir } = fixture;
        await writeStorePieces(appDir);
        await write(path.join(appDir, "lib/sig.ts"), describedSignal);
        await write(path.join(fixture.root, "libs/kit/lib/sig.ts"), signalFixture);
        for (const [facet, source] of [
          ["base", "export const loadedAfter = (..._modules: unknown[]): void => {};\n"],
          ["store", "export const st = { use: {} };\nexport const store = (..._args: unknown[]) => class {};\n"],
        ])
          await write(path.join(fixture.root, `node_modules/akanjs/${facet}/index.ts`), source);
        for (const [file, name] of [
          ["_base", "base"],
          ["draft", "draft"],
          ["tally", "tally"],
        ])
          await write(
            path.join(appDir, `lib/__client/${file}.fetch.ts`),
            `import { getSerializedSignalOf } from "../sig" with { type: "macro" };\nexport const loaded = getSerializedSignalOf("${name}");\n${seen}.push(...Object.keys(loaded).map((key) => "piece:" + key));\n`,
          );
        await write(
          path.join(appDir, "lib/useClient.ts"),
          `import { getSerializedSignal } from "./sig" with { type: "macro" };\nconst whole = getSerializedSignal();\n${seen}.push(...Object.keys(whole).map((key) => "whole:" + key));\nexport const { msg, Err, usePage, fetch, sig } = { usePage: () => "page" } as Record<string, unknown>;\n`,
        );
        await write(
          path.join(appDir, "lib/st.ts"),
          `export class RootStore {}\nexport const st = Object.freeze({ mark: "store-marker" });\n${weightOf(whole, "whole")}`,
        );
        for (const [name, hashes] of Object.entries({ draft, tally }))
          await write(
            path.join(appDir, `lib/__client/${name}.st.ts`),
            `export const ${name} = Object.freeze({ mark: "piece:${name}.st" });\n${weightOf(hashes, name)}`,
          );
        const file = (name: string) => path.join(appDir, `ui/${name}.tsx`);
        const buildRoutes = async (routes: Record<string, string[]>) => {
          const entriesByRoute = new Map(Object.entries(routes));
          const entries = [...new Set(Object.values(routes).flat())];
          const result = await new RouteClientBuilder({
            app: fixture.app,
            seeds: [],
            entries,
            artifact: {} as never,
            browser: "chunks",
            entriesByRoute,
          }).build();
          const clientOut = path.join(appDir, ".akan/artifact/client");
          const state = globalThis as { __akanSeen?: string[]; $RefreshReg$?: unknown; $RefreshSig$?: unknown };
          const seenNow = () => [...(state.__akanSeen ?? [])].sort();
          const load = async (route: string) => {
            state.__akanSeen = [];
            state.$RefreshReg$ ??= () => undefined;
            state.$RefreshSig$ ??= () => (type: unknown) => type;
            const ids = new Set(
              (routes[route] ?? []).map((entry) => `${path.relative(fixture.root, entry).split(path.sep).join("/")}#`),
            );
            const exported: Record<string, unknown> = {};
            for (const [key, row] of Object.entries(result.manifestDelta))
              if ([...ids].some((id) => key.startsWith(id)))
                Object.assign(exported, await import(path.join(clientOut, path.basename(row.chunks[0] ?? ""))));
            return exported;
          };
          const run = async (route: string) => {
            await load(route);
            return seenNow();
          };
          return { browser: await bundledText(clientOut), run, load, seenNow };
        };
        return { ...fixture, file, buildRoutes };
      };
      const timesIn = (text: string, marker: string) => text.split(marker).length - 1;
      const mixed =
        "[client-runtime] 1 route loads per module, 0 keep the whole runtime because per module would not be smaller, 1 keeps it for a reason `akan quality runtime` names";

      test("a route with an entry keeping the whole runtime and a narrowed entry sharing a file holds each module's descriptors once, and runs them once", async () => {
        const { file, buildRoutes, warnings, said } = await describedFixture();
        await write(file("Shared"), namingDraft);
        await write(file("Pick"), `${picking}export { shared } from "./Shared";\n`);
        await write(
          file("Draft"),
          '"use client";\nimport { shared } from "./Shared";\nexport const Draft = () => [shared, "draft-ui-marker"];\n',
        );

        const { browser, run } = await buildRoutes({
          "/pick": [file("Pick"), file("Draft")],
          "/draft": [file("Draft")],
        });

        expect(said).toEqual([mixed]);
        expect(warnings).toEqual([]);
        for (const marker of ["draft-descriptor-ref", "tally-descriptor-ref"]) expect(timesIn(browser, marker)).toBe(1);
        expect(await run("/pick")).toEqual(["piece:draft", "whole:tally"]);
        expect(await run("/draft")).toEqual([]);
      }, 30_000);

      test("a page loading per module that asks with import() for a file needing every module gets the whole runtime then, and no module's descriptors twice", async () => {
        const { file, buildRoutes, warnings, said } = await describedFixture();
        await write(file("Shared"), namingDraft);
        await write(
          file("Later"),
          'import { st } from "@apps/demo/client";\nexport const later = (name: string) => [st.use[name], "later-marker"];\n',
        );
        await write(
          file("Draft"),
          '"use client";\nimport { shared } from "./Shared";\nexport const Draft = () => [shared, "draft-ui-marker"];\nexport const ask = () => import("./Later");\n',
        );

        const { browser, load, seenNow } = await buildRoutes({ "/draft": [file("Draft")] });

        expect(said).toEqual([
          "[client-runtime] 1 route loads per module, 0 keep the whole runtime because per module would not be smaller",
        ]);
        expect(warnings).toEqual([]);
        for (const marker of ["draft-descriptor-ref", "tally-descriptor-ref"]) expect(timesIn(browser, marker)).toBe(1);
        const { ask } = (await load("/draft")) as { ask: () => Promise<unknown> };
        expect(seenNow()).toEqual(["piece:draft"]);
        await ask();
        expect(seenNow()).toEqual(["piece:draft", "whole:tally"]);
      }, 30_000);

      test("a reference handed over on a whole page and on a page loading per module brings no second copy to the whole page", async () => {
        const { appDir, file, buildRoutes, warnings, said } = await describedFixture();
        await write(
          path.join(appDir, "lib/_draft/draft.store.ts"),
          'import { store } from "akanjs/store";\nexport class draftStore extends store("draft" as const, () => ({ draftText: 0, draft: null })) {}\n',
        );
        const reference = path.join(appDir, "lib/__client/draft.ref.ts");
        await write(reference, '"use client";\n\nexport const reference = "draft";\n');
        await write(file("Pick"), picking);
        await write(file("Plain"), '"use client";\nexport const Plain = () => "plain-ui-marker";\n');

        const { browser } = await buildRoutes({
          "/pick": [file("Pick"), reference],
          "/plain": [file("Plain"), reference],
        });

        expect(said).toEqual([mixed]);
        expect(warnings).toEqual([]);
        expect(browser).toContain("piece:draft.st");
        expect(timesIn(browser, "draft-descriptor-ref")).toBe(1);
      }, 30_000);

      test("a route that would be no smaller loading per module keeps the whole runtime, and the build it was measured against leaves nothing behind", async () => {
        const { appDir, file, buildRoutes, warnings, said } = await describedFixture({ whole: 0, draft: 600 });
        await write(file("Draft"), `"use client";\n${namingDraft}`);

        const { browser, run } = await buildRoutes({ "/draft": [file("Draft")] });

        expect(said).toEqual([
          "[client-runtime] 0 routes load per module, 1 keeps the whole runtime because per module would not be smaller",
        ]);
        expect(warnings).toEqual([]);
        expect(browser).toContain("shared-marker");
        expect(browser).not.toContain("piece:draft.st");
        expect(await run("/draft")).toEqual(["whole:draft", "whole:tally"]);
        expect(await Bun.file(path.join(appDir, ".akan/artifact/client-whole")).exists()).toBe(false);
        expect((await readdir(path.join(appDir, ".akan/artifact"))).sort()).toEqual(["client", "client-ssr"]);
      }, 30_000);

      test("a route no smaller per module than where every page is whole, yet larger still keeping the whole runtime beside a page that loads per module, loads per module", async () => {
        const { appDir, file, buildRoutes, warnings, said } = await describedFixture({
          whole: 500,
          draft: 450,
          tally: 100,
        });
        await write(file("Shared"), namingDraft);
        await write(file("Draft"), '"use client";\nexport { shared } from "./Shared";\n');
        await write(
          file("Board"),
          '"use client";\nimport { st } from "@apps/demo/client";\nimport { shared } from "./Shared";\nexport const Board = () => [shared, st.use.tallyCount(), "board-marker"];\n',
        );

        const { browser } = await buildRoutes({ "/draft": [file("Draft")], "/board": [file("Board")] });

        expect(said).toEqual([
          "[client-runtime] 2 routes load per module, 0 keep the whole runtime because per module would not be smaller",
        ]);
        expect(warnings).toEqual([]);
        for (const marker of ["piece:draft.st", "piece:tally.st", "board-marker"]) expect(browser).toContain(marker);
        expect(browser).not.toContain("store-marker");
        const report = await Bun.file(path.join(appDir, RouteRuntimeReport.file)).json();
        expect(report).toMatchObject({ perModule: ["/draft", "/board"], notSmaller: [], refused: ["/board"] });
      }, 30_000);

      test("a production build answers each export of a client file from its own entry, so a route asking one loads no import of the other; under start the file is one entry", async () => {
        const { root, appDir, app, file, warnings } = await describedFixture();
        for (const name of ["a", "b"])
          await write(file(`heavy-${name}`), `export const heavy = { mark: "heavy-${name}-marker" };\n`);
        const pair = file("Pair");
        await write(
          pair,
          '"use client";\nimport { heavy as a } from "./heavy-a";\nimport { heavy as b } from "./heavy-b";\nexport const A = () => a.mark;\nexport const B = () => b.mark;\n',
        );
        const entriesByRoute = new Map([
          ["/a", [pair]],
          ["/b", [pair]],
        ]);
        const askedByRoute = new Map([
          ["/a", new Map([[pair, ["A"]]])],
          ["/b", new Map([[pair, ["B"]]])],
        ]);
        const buildAs = async (command: "build" | "start") => {
          const { manifestDelta } = await new RouteClientBuilder({
            app,
            seeds: [],
            entries: [pair],
            artifact: {} as never,
            browser: "chunks",
            command,
            entriesByRoute,
            askedByRoute,
          }).build();
          const artifact = path.join(
            command === "build" ? path.join(root, "dist/apps/demo") : appDir,
            ".akan/artifact",
          );
          const sized = new RouteModulePreloads({
            runtimeChunks: { runtime: [], vendors: {} },
            entriesByRoute,
            askedByRoute,
            clientManifest: manifestDelta,
            externalsByChunkUrl: {},
            workspaceRoot: root,
          }).modulesByRoute();
          const loadedBy = async (route: string) =>
            (
              await Promise.all(
                (sized[route] ?? []).map((url) => Bun.file(path.join(artifact, url.replace(/^\/_akan\//, ""))).text()),
              )
            ).join("\n");
          const idOf = (name: string) => manifestDelta[`apps/demo/ui/Pair.tsx#${name}`]?.id;
          return { rows: Object.keys(manifestDelta).sort(), idOf, a: await loadedBy("/a"), b: await loadedBy("/b") };
        };

        const built = await buildAs("build");
        expect(built.rows).toEqual(["apps/demo/ui/Pair.tsx#A", "apps/demo/ui/Pair.tsx#B"]);
        expect(built.idOf("A")).not.toBe(built.idOf("B"));
        expect(built.a).toContain("heavy-a-marker");
        expect(built.a).not.toContain("heavy-b-marker");
        expect(built.b).toContain("heavy-b-marker");
        expect(built.b).not.toContain("heavy-a-marker");

        const started = await buildAs("start");
        expect(started.rows).toEqual(built.rows);
        expect(started.idOf("A")).toBe(started.idOf("B"));
        for (const marker of ["heavy-a-marker", "heavy-b-marker"]) expect(started.a).toContain(marker);
        expect(warnings).toEqual([]);
      }, 30_000);
    });

    test("the files a route is sized by hold the store piece of the module its client code names, and no assembled runtime", async () => {
      const { root, appDir, app } = await routeFixture();
      await writeStorePieces(appDir);
      const entry = await writeDraftEntry(appDir);

      const { manifestDelta } = await build(app, entry);

      const sizedUrls = new RouteModulePreloads({
        runtimeChunks: { runtime: [], vendors: {} },
        entriesByRoute: new Map([["/:lang/draft", [entry]]]),
        clientManifest: manifestDelta,
        externalsByChunkUrl: {},
        workspaceRoot: root,
      }).modulesByRoute()["/:lang/draft"];
      const sized = (
        await Promise.all(
          (sizedUrls ?? []).map((url) =>
            Bun.file(path.join(appDir, ".akan/artifact", url.replace(/^\/_akan\//, ""))).text(),
          ),
        )
      ).join("\n");
      for (const marker of ["draft-ui-marker", "page-runtime-only", "piece:draft.st"]) expect(sized).toContain(marker);
      for (const marker of wholeOrOtherPieces) expect(sized).not.toContain(marker);
    });

    test.each([
      ["the object first", "Memo, cnst"],
      ["the constants first", "cnst, Memo"],
    ])(
      "a file naming one component of an object and one constant, %s, brings that component's file and that model's registration, never every constant",
      async (_, names) => {
        const { appDir, app } = await routeFixture();
        await write(
          path.join(appDir, "client.ts"),
          [
            'export * as cnst from "./lib/cnst";',
            'export { msg, Err, usePage } from "./lib/usePage";',
            'export { fetch, sig } from "./lib/useClient";',
            'export { st, RootStore } from "./lib/st";',
            'export { Memo } from "./lib/memo";',
            "",
          ].join("\n"),
        );
        await write(
          path.join(appDir, "lib/memo/Memo.Zone.tsx"),
          '"use client";\nexport const View = Object.freeze({ mark: "memo-view-marker" });\n',
        );
        await write(
          path.join(appDir, "lib/memo/memo.constant.ts"),
          'export const MemoStatus = Object.freeze({ mark: "memo-status-marker" });\n',
        );
        await write(
          path.join(appDir, "lib/__client/memo.cnst.ts"),
          'import * as cnst from "../memo/memo.constant";\nexport const memo = Object.freeze({ mark: "piece:memo.cnst", cnst });\n',
        );
        const entry = path.join(appDir, "ui/Status.tsx");
        await write(
          entry,
          `"use client";\nimport { ${names} } from "@apps/demo/client";\nexport const Status = () => [Memo.Zone.View, cnst.MemoStatus, "status-ui-marker"];\n`,
        );
        await build(app, entry);

        const browser = await bundledText(path.join(appDir, ".akan/artifact/client"));
        for (const marker of ["status-ui-marker", "memo-view-marker", "memo-status-marker", "piece:memo.cnst"])
          expect(browser).toContain(marker);
        for (const marker of ["cnst-marker", "other-ui-marker", ...assembledMarkers, '"runtime-marker"'])
          expect(browser).not.toContain(marker);
      },
    );

    for (const file of [StoreBootstrap.pageRuntime, StoreBootstrap.baseDescriptors, ...StoreBootstrap.assembled])
      test(`an app not synced to lib/${file}.ts keeps the whole runtime in its browser chunks and is told to sync`, async () => {
        const { appDir, app, warnings } = await routeFixture();
        await Bun.file(path.join(appDir, `lib/${file}.ts`)).delete();

        await build(app, path.join(appDir, "ui/A.tsx"));

        const browser = await bundledText(path.join(appDir, ".akan/artifact/client"));
        for (const marker of ['"runtime-marker"', '"store-marker"']) expect(browser).toContain(marker);
        expect(warnings).toEqual([expect.stringContaining("Run `akan sync demo`")]);
        expect(warnings[0]).toContain("runtime files of demo or a lib it mounts are missing");
      });

    test("a route's browser build answers a module piece with descriptors read from the signal, not by its macro", async () => {
      const { root, appDir } = await routeFixture();
      for (const scope of ["apps/demo", "libs/kit"]) await write(path.join(root, scope, "lib/sig.ts"), signalFixture);
      await write(path.join(appDir, "lib/__client/draft.fetch.ts"), signalPiece);
      const entry = path.join(appDir, "ui/Fetch.tsx");
      await write(
        entry,
        '"use client";\nimport { descriptors } from "@apps/demo/lib/__client/draft.fetch";\nexport const Fetch = () => descriptors;\n',
      );

      const built = await printedInOwnProcess(
        `
const { RouteClientBuilder } = await import(${JSON.stringify(path.join(import.meta.dir, "routeClientBuilder.ts"))});
const { SignalDescriptors } = await import(${JSON.stringify(path.join(import.meta.dir, "../transforms/signalDescriptors.ts"))});
const [root, entry, barrelImports] = ${JSON.stringify([root, entry, fixtureBarrels])};
let answered = 0;
const inline = SignalDescriptors.prototype.inline;
SignalDescriptors.prototype.inline = async function (...args) {
  const contents = await inline.apply(this, args);
  if (contents !== null) answered += 1;
  return contents;
};
const warnings = [];
const app = {
  name: "demo",
  cwdPath: root + "/apps/demo",
  dist: { cwdPath: root + "/dist/apps/demo" },
  workspace: { workspaceRoot: root },
  getConfig: async () => ({ barrelImports, optimizeImports: [] }),
  getTsConfig: async () => ({ compilerOptions: { paths: { "@apps/*": ["./apps/*"], "@libs/*": ["./libs/*"] } } }),
  getPublicEnv: () => ({}),
  logger: { warn: (message) => warnings.push(message) },
  verbose: () => undefined,
};
await new RouteClientBuilder({ app, seeds: [], entries: [entry], artifact: {}, browser: "chunks" }).build();
console.log(JSON.stringify({ answered, warnings }));
`,
        root,
      );

      expect(built).toEqual({ answered: 1, warnings: [] });
      expect(await bundledText(path.join(appDir, ".akan/artifact/client"))).toContain("draft-descriptor-ref");
    }, 30_000);

    test("an app whose modules cannot be read keeps the whole runtime in its browser chunks and is told what failed", async () => {
      const { appDir, app, warnings } = await routeFixture();
      const read = spyOn(RouteRuntime, "read").mockRejectedValue(new Error("memo.store.ts is unreadable"));
      try {
        await build(app, path.join(appDir, "ui/A.tsx"));
      } finally {
        read.mockRestore();
      }

      const browser = await bundledText(path.join(appDir, ".akan/artifact/client"));
      for (const marker of ['"runtime-marker"', '"store-marker"']) expect(browser).toContain(marker);
      expect(warnings).toEqual([
        expect.stringContaining(
          "the modules of demo or a lib it mounts could not be read (memo.store.ts is unreadable)",
        ),
      ]);
      expect(warnings[0]).toContain("Fix that, then run `akan sync demo` and build again.");
      expect(warnings[0]).not.toContain("missing");
    });
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

    const discovery = new GraphClientEntryDiscovery({ barrelImports: ["akanjs/ui"] }, async (specifier) => {
      if (specifier !== "akanjs/ui") return null;
      return { pkgName: specifier, entryFile: uiEntry, pkgDir: path.dirname(uiEntry), preserveFilePath: true };
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
