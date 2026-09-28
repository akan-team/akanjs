import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { createTsconfigPackageResolver } from "../transforms/barrelImportsPlugin";
import { CLIENT_BUNDLE_NAMING } from "./clientBuildTypes";
import { ClientEntriesBundler } from "./clientEntriesBundler";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { RouteClientBuilder } from "./routeClientBuilder";

const makeTempRoot = tempDirs("akan-client-entry-");

describe("route client store bootstrap", () => {
  test("wraps client entries with app client bootstrap before re-exporting components", () => {
    const original = path.resolve("/repo/pkgs/akanjs/ui/Model/NewWrapper_Client.tsx");
    const source = RouteClientBuilder.createStoreBootstrapEntrySource({
      appName: "akan",
      originalEntry: original,
      exportNames: ["NewWrapper_Client", "default"],
    });

    expect(source).toBe(
      [
        'import "@apps/akan/client";',
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
