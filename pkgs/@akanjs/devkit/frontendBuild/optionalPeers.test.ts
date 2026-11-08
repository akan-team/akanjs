import { describe, expect, spyOn, test } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import type { BunPlugin } from "bun";
import { resolveSsrPageEntries } from "../artifact/implicitRootLayout";
import { tempDirs, writeText as write } from "../testHelpers";
import { CsrArtifactBuilder } from "./csrArtifactBuilder";
import { VENDOR_SPECIFIERS } from "./vendorSpecifiers";

const makeTempRoot = tempDirs("akan-optional-peers-");
const akanjsRoot = path.resolve(import.meta.dir, "../../../akanjs");
const { peerDependenciesMeta } = (await Bun.file(path.join(akanjsRoot, "package.json")).json()) as {
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
};
//? The app installs these itself: they are peers so that it renders with one React.
const appRenderer = new Set(["react", "react-dom", "react-server-dom-webpack"]);
const optionalPeers = Object.entries(peerDependenciesMeta)
  .filter(([name, meta]) => meta.optional && !appRenderer.has(name))
  .map(([name]) => name);
const optionalPeerImport = new RegExp(
  `^(?:${optionalPeers.map((name) => name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|")})(?:/|$)`,
);

const recordOptionalPeers = (reached: string[]): BunPlugin => ({
  name: "record-optional-peers",
  setup(build) {
    build.onResolve({ filter: optionalPeerImport }, ({ path: specifier, importer }) => {
      reached.push(`${path.relative(akanjsRoot, importer)} -> ${specifier}`);
      return { path: specifier, external: true };
    });
  },
});

const linkPackage = async (root: string, name: string, dir: string) => {
  await mkdir(path.join(root, "node_modules"), { recursive: true });
  await symlink(dir, path.join(root, "node_modules", name));
};

const writeApp = async (indexPage: string) => {
  const root = await makeTempRoot();
  const appDir = path.join(root, "apps/demo");
  await linkPackage(root, "akanjs", akanjsRoot);
  await linkPackage(root, "react", path.dirname(Bun.resolveSync("react/package.json", akanjsRoot)));
  await write(
    path.join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { paths: { "@apps/*": ["./apps/*"] } } }),
  );
  await write(path.join(appDir, "client.ts"), "export {};\n");
  await write(path.join(appDir, "env/env.client.ts"), "export const env = {};\n");
  await write(path.join(appDir, "lib/dict.ts"), "export const getAllDictionary = () => ({});\n");
  await write(path.join(appDir, "page/_index.tsx"), indexPage);
  await write(path.join(appDir, "page/_overrides.tsx"), "export default {};\n");
  return { root, appDir, pageKeys: ["./_index.tsx", "./_overrides.tsx"] };
};

const buildCsr = async (indexPage: string) => {
  const { root, appDir, pageKeys } = await writeApp(indexPage);
  const app = {
    name: "demo",
    cwdPath: appDir,
    dist: { cwdPath: path.join(root, "dist/apps/demo") },
    workspace: { workspaceRoot: root },
    getPageKeys: async () => pageKeys,
    getConfig: async () => ({ basePaths: [], optimizeImports: [], barrelImports: [] }),
    getTsConfig: async () => ({ compilerOptions: { paths: { "@apps/*": ["./apps/*"] } } }),
    getPublicEnv: () => ({}),
    log: () => undefined,
    verbose: () => undefined,
    logger: { warn: () => undefined },
  };
  const reached: string[] = [];
  const build = Bun.build;
  const recorded = spyOn(Bun, "build").mockImplementation((config) =>
    build({ ...config, plugins: [recordOptionalPeers(reached), ...(config.plugins ?? [])] }),
  );

  try {
    await new CsrArtifactBuilder(app as never, "build").build();
  } finally {
    recorded.mockRestore();
  }
  return { root, reached };
};

describe("optional peers of akanjs", () => {
  test("the generated root layout, the _overrides.tsx wrapper and the runtime entries import none", async () => {
    const { appDir, pageKeys } = await writeApp("export default function Page() {\n  return null;\n}\n");
    const generated = (await resolveSsrPageEntries({ appCwdPath: appDir, appName: "demo", pageKeys }))
      .map(({ moduleAbsPath }) => moduleAbsPath)
      .filter((file) => file.includes(`${path.sep}.akan${path.sep}`));
    const runtime = [
      path.join(akanjsRoot, "server/rscClient.tsx"),
      path.join(akanjsRoot, "server/rscSegmentOutlet.tsx"),
      path.join(akanjsRoot, "webkit/index.ts"),
      ...VENDOR_SPECIFIERS.map((specifier) =>
        path.join(akanjsRoot, "server/vendor", `${specifier.replaceAll("/", "-").replaceAll(".", "-")}.ts`),
      ),
    ];
    expect(generated).toHaveLength(2);

    //? No barrel rewrite, as a dev registry compiles every module an import names.
    for (const target of ["browser", "bun"] as const) {
      const reached: string[] = [];
      const result = await Bun.build({
        entrypoints: [...generated, ...runtime],
        target,
        throw: false,
        plugins: [recordOptionalPeers(reached)],
      });

      expect(result.logs.map((log) => log.message)).toEqual([]);
      expect(reached).toEqual([]);
    }
  });

  test("the CSR shell build of a page drawing akanjs/ui components imports none", async () => {
    const { reached } = await buildCsr(
      'import { Link, System } from "akanjs/ui";\n\nexport default function Page() {\n  return (\n    <Link href="/">\n      <System.ThemeToggle />\n    </Link>\n  );\n}\n',
    );

    expect(reached).toEqual([]);
  });

  test("the MCP App view build of a page drawing akanjs/ui components imports none", async () => {
    const { root, reached } = await buildCsr(
      'import { page } from "akanjs/client";\nimport { Link } from "akanjs/ui";\n\nexport default page()\n  .app("showHome", "Show the home link.", () => <Link href="/">home</Link>)\n  .render(() => null);\n',
    );

    expect(await Bun.file(path.join(root, "dist/apps/demo/mcp-apps/showHome.html")).exists()).toBe(true);
    expect(reached).toEqual([]);
  });
});
