import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { createBarrelImportsPlugin } from "../transforms/barrelImportsPlugin";

const makeTempRoot = tempDirs("akan-native-core-");
const akanjsRoot = path.resolve(import.meta.dir, "../../../akanjs");
const repoRoot = path.resolve(akanjsRoot, "../..");
const frameworkBarrels = ["akanjs/webkit", "akanjs/common", "akanjs/ui", "akanjs/server"];
const reactExternals = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "scheduler",
  "react-server-dom-webpack/client.browser",
];
const pageRuntime = [
  path.join(akanjsRoot, "server/rscClient.tsx"),
  path.join(akanjsRoot, "server/rscSegmentOutlet.tsx"),
  path.join(akanjsRoot, "ui/System/Client.tsx"),
];

interface PageBuild {
  workspaceRoot: string;
  paths: Record<string, string[]>;
  barrelImports: string[];
  entries: string[];
}

const eagerInputsOf = async ({ workspaceRoot, paths, barrelImports, entries }: PageBuild) => {
  const app = {
    name: "demo",
    cwdPath: path.join(workspaceRoot, "apps/demo"),
    workspace: { workspaceRoot },
    getConfig: async () => ({ barrelImports }),
    getTsConfig: async () => ({ compilerOptions: { paths } }),
  };
  const result = await Bun.build({
    entrypoints: entries,
    target: "browser",
    format: "esm",
    splitting: true,
    metafile: true,
    throw: true,
    conditions: ["production"],
    external: reactExternals,
    plugins: [await createBarrelImportsPlugin(app as never)],
  });
  const outputs = result.metafile?.outputs ?? {};
  const eager = new Set<string>();
  const load = (outputPath: string) => {
    if (eager.has(outputPath) || !outputs[outputPath]) return;
    eager.add(outputPath);
    for (const imp of outputs[outputPath].imports) if (imp.kind === "import-statement") load(imp.path);
  };
  //? A dynamically imported module gets an entry chunk of its own too: only the page's entries start the walk.
  for (const [outputPath, output] of Object.entries(outputs))
    if (output.entryPoint && entries.includes(path.resolve(output.entryPoint))) load(outputPath);
  return {
    eager: [...eager].flatMap((outputPath) => Object.keys(outputs[outputPath]?.inputs ?? {})),
    all: Object.keys(result.metafile?.inputs ?? {}),
  };
};

const eagerInputsOfAPage = async (store: string) => {
  //? Real path: Bun names entry points through /private on macOS, where the temp dir is a symlink.
  const root = await realpath(await makeTempRoot());
  await mkdir(path.join(root, "node_modules"), { recursive: true });
  await symlink(akanjsRoot, path.join(root, "node_modules/akanjs"));
  const paths = { "@apps/*": ["./apps/*"] };
  await write(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths } }));
  await write(path.join(root, "apps/demo/lib/st.ts"), store);
  return await eagerInputsOf({
    workspaceRoot: root,
    paths,
    barrelImports: frameworkBarrels,
    entries: [...pageRuntime, path.join(akanjsRoot, "ui/Link/Anchor.tsx"), path.join(root, "apps/demo/lib/st.ts")],
  });
};

const isCore = (input: string) => /native\/packages\/core\//.test(input);

//? `akan sync` generates these, which a fresh checkout lacks; CI's sync job sets REQUIRE_SYNCED_LIBS after syncing.
const syncedLibFiles = [
  ...["shared", "util"].flatMap((lib) =>
    [
      "client.ts",
      "server.ts",
      "index.ts",
      "ui/index.ts",
      "webkit/index.ts",
      "common/index.ts",
      "lib/cnst.ts",
      "lib/st.ts",
      "lib/useClient.ts",
    ].map((file) => `libs/${lib}/${file}`),
  ),
  ...["user", "admin"].map((module) => `libs/shared/lib/${module}/index.ts`),
];
const libsSynced = syncedLibFiles.every((file) => existsSync(path.join(repoRoot, file)));

describe("@akanjs/native/core on a web page", () => {
  test("the runtime, the system shell, Link and a store reading the host stay off it", async () => {
    const { eager, all } = await eagerInputsOfAPage(
      'import { isNativeShell, router } from "akanjs/client";\nimport { store } from "akanjs/store";\nexport const st = { isNativeShell, router, store };\n',
    );

    expect(eager.filter(isCore)).toEqual([]);
    expect(all.some(isCore)).toBe(true);
  });

  test("a store importing akanjs/client/native statically puts it on the page", async () => {
    const { eager } = await eagerInputsOfAPage(
      'import { isNativeShell } from "akanjs/client/native";\nexport const st = { isNativeShell };\n',
    );

    expect(eager.some(isCore)).toBe(true);
  });

  test.skipIf(!libsSynced && !process.env.REQUIRE_SYNCED_LIBS)(
    "a page drawing a shared Field and User template, on a store merging shared, stays off it",
    async () => {
      const { eager, all } = await eagerInputsOf({
        workspaceRoot: repoRoot,
        paths: (await Bun.file(path.join(repoRoot, "tsconfig.json")).json()).compilerOptions.paths,
        barrelImports: [
          ...frameworkBarrels,
          ...["shared", "util"].flatMap((lib) =>
            ["ui", "webkit", "common", "client", "server"].map((facet) => `@libs/${lib}/${facet}`),
          ),
        ],
        entries: [
          ...pageRuntime,
          ...["lib/useClient.ts", "lib/st.ts", "ui/Field.tsx", "lib/user/User.Template.tsx"].map((file) =>
            path.join(repoRoot, "libs/shared", file),
          ),
        ],
      });

      expect(eager.filter(isCore)).toEqual([]);
      expect(all.some(isCore)).toBe(true);
    },
  );
});
