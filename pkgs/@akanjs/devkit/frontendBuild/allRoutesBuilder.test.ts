import { describe, expect, test } from "bun:test";
import { mkdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { AllRoutesBuilder } from "./allRoutesBuilder";

const makeTempRoot = tempDirs("akan-all-routes-");
const akanjsRoot = path.resolve(import.meta.dir, "../../../akanjs");

const linkPackage = async (root: string, name: string, dir: string) => {
  await mkdir(path.join(root, "node_modules"), { recursive: true });
  await symlink(dir, path.join(root, "node_modules", name));
};

//? As this monorepo maps it, so the generated root layout's `akanjs/ui/System/index.tsx` resolves through a wildcard.
const paths = { "@apps/*": ["./apps/*"], "akanjs/*": ["./node_modules/akanjs/*"] };

const writeApp = async () => {
  const root = await realpath(await makeTempRoot());
  const appDir = path.join(root, "apps/demo");
  await linkPackage(root, "akanjs", akanjsRoot);
  await linkPackage(root, "react", path.dirname(Bun.resolveSync("react/package.json", akanjsRoot)));
  await write(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths } }));
  await write(path.join(appDir, "client.ts"), "export {};\n");
  await write(path.join(appDir, "env/env.client.ts"), "export const env = {};\n");
  await write(path.join(appDir, "lib/dict.ts"), "export const getAllDictionary = () => ({});\n");
  await write(path.join(appDir, "ui/Home.tsx"), '"use client";\nexport const Home = () => "home-marker";\n');
  await write(path.join(appDir, "ui/Memo.tsx"), '"use client";\nexport const Memo = () => "memo-marker";\n');
  await write(
    path.join(appDir, "page/_index.tsx"),
    'import { Home } from "../ui/Home";\nexport default function Page() {\n  return <Home />;\n}\n',
  );
  await write(
    path.join(appDir, "page/memo.tsx"),
    'import { System } from "akanjs/ui/System";\nimport { Memo } from "../ui/Memo";\nexport default function Page() {\n  return <><Memo /><System.ThemeToggle /></>;\n}\n',
  );
  await write(
    path.join(appDir, "page/shell.tsx"),
    'import { CSR } from "akanjs/ui/System/CSR";\nexport default function Page() {\n  return <CSR />;\n}\n',
  );
  const app = {
    name: "demo",
    cwdPath: appDir,
    dist: { cwdPath: path.join(root, "dist/apps/demo") },
    workspace: { workspaceRoot: root },
    getPageKeys: async () => ["./_index.tsx", "./memo.tsx", "./shell.tsx"],
    getConfig: async () => ({ basePaths: [], optimizeImports: [], barrelImports: [] }),
    getTsConfig: async () => ({ compilerOptions: { paths } }),
    getPublicEnv: () => ({}),
    log: () => undefined,
    verbose: () => undefined,
    logger: { warn: () => undefined },
  };
  return app;
};

describe("AllRoutesBuilder", () => {
  test("writes the route manifest, then the preload table once the runtime chunks are known, and each route's modules without System's CSR and MCP App providers unless the page imports one", async () => {
    const app = await writeApp();
    const routes = new AllRoutesBuilder(app as never, "build");
    const { manifest, manifestPath } = await routes.build();

    expect(new Set(manifest.routeIds)).toEqual(new Set(["/:lang", "/:lang/memo", "/:lang/shell"]));
    expect(await Bun.file(manifestPath).json()).not.toHaveProperty("modulePreloads");

    const runtimeChunks = { runtime: ["/_akan/client/rsc.js"], vendors: { react: ["/_akan/client/react.js"] } };
    const preloads = await routes.writeModulePreloads(runtimeChunks);
    expect(preloads.table).toMatchObject(runtimeChunks);
    expect(new Set(Object.values(preloads.table.chunkVendors).flat())).toEqual(new Set(["react"]));
    expect((await Bun.file(manifestPath).json()).modulePreloads).toEqual(preloads.table);

    const chunksOf = (suffix: string) =>
      Object.entries(manifest.clientManifest).find(([key]) => key.endsWith(suffix))?.[1].chunks ?? [];
    const [home] = chunksOf("apps/demo/ui/Home.tsx#Home");
    const [memo] = chunksOf("apps/demo/ui/Memo.tsx#Memo");
    const shell = chunksOf("akanjs/ui/System/Client.tsx#Client");
    const [csrShell] = chunksOf("akanjs/ui/System/CSR.tsx#CSR");
    const [mcpAppShell] = chunksOf("akanjs/ui/System/App.tsx#AppProvider");
    const [themeToggle] = chunksOf("akanjs/ui/System/ThemeToggle.tsx#ThemeToggle");
    const modules = preloads.modulesByRoute();
    expect(shell.length).toBeGreaterThan(0);
    expect([csrShell, mcpAppShell, themeToggle]).not.toContain(undefined);
    expect(modules["/:lang/memo"]).toContain(themeToggle);
    expect(modules["/:lang/shell"]).toContain(csrShell);
    for (const [routeId, own, other] of [
      ["/:lang", home, memo],
      ["/:lang/memo", memo, home],
    ] as const) {
      expect(modules[routeId]?.slice(0, 2)).toEqual(["/_akan/client/rsc.js", "/_akan/client/react.js"]);
      expect(modules[routeId]).toEqual(expect.arrayContaining([own, ...shell]));
      expect(modules[routeId]).not.toContain(other);
      expect(modules[routeId]).not.toContain(csrShell);
      expect(modules[routeId]).not.toContain(mcpAppShell);
    }
  }, 30_000);
});
