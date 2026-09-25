import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTsconfigPackageResolver } from "../transforms/barrelImportsPlugin";
import { CLIENT_BUNDLE_NAMING } from "./clientBuildTypes";
import { ClientEntriesBundler } from "./clientEntriesBundler";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { RouteClientBuilder } from "./routeClientBuilder";

const tempRoots: string[] = [];

const makeTempRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-client-entry-"));
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

describe("route client store bootstrap", () => {
  test("wraps client entries with app client bootstrap before re-exporting components", () => {
    const original = "/repo/pkgs/akanjs/ui/Model/NewWrapper_Client.tsx";
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
    expect(RouteClientBuilder.resolveSsrClientExternalOptions("start")).toMatchObject({
      external: expect.arrayContaining(["akanjs/fetch"]),
      externalSubpaths: ["akanjs/fetch"],
    });

    expect(RouteClientBuilder.resolveSsrClientExternalOptions("build")).toEqual({
      external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
    });
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

    const discovery = new GraphClientEntryDiscovery(
      { barrelImports: ["akanjs/ui"], externalLibs: [], optimizeImports: true },
      async (specifier) => {
        if (specifier === "akanjs/ui") {
          return {
            pkgName: "akanjs/ui",
            entryFile: uiEntry,
            pkgDir: path.dirname(uiEntry),
            preserveFilePath: true,
          };
        }
        if (specifier === "akanjs/ui/System/Client.tsx") {
          return {
            pkgName: "akanjs/ui/System/Client.tsx",
            entryFile: clientEntry,
            pkgDir: path.dirname(clientEntry),
            preserveFilePath: true,
          };
        }
        return null;
      },
    );

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
