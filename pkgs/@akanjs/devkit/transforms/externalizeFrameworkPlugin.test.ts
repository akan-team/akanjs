import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { createExternalizeFrameworkPlugin } from "./externalizeFrameworkPlugin";

const makeTempRoot = tempDirs("akan-devkit-externalize-");

const akanServerPaths = {
  akanjs: ["./pkgs/akanjs/index.ts"],
  "akanjs/*": ["./pkgs/akanjs/*"],
  "akanjs/server": ["./pkgs/akanjs/server/index.ts"],
  "akanjs/server/*": ["./pkgs/akanjs/server/*"],
};

const bundle = async (root: string, paths: Record<string, string[]>, entryLines: string[]) => {
  const entry = path.join(root, "entry.ts");
  await write(entry, [...entryLines, ""].join("\n"));
  const plugin = await createExternalizeFrameworkPlugin({
    app: { workspace: { workspaceRoot: root }, getTsConfig: async () => ({ compilerOptions: { paths } }) } as never,
  });
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: path.join(root, "out"),
    target: "bun",
    format: "esm",
    plugins: [plugin],
  });
  expect(result.success).toBe(true);
  return await result.outputs.find((artifact) => artifact.kind === "entry-point")?.text();
};

describe("createExternalizeFrameworkPlugin", () => {
  test("bundles akanjs/server workspace sources into production pages artifacts", async () => {
    const root = await makeTempRoot();
    await write(path.join(root, "pkgs/akanjs/server/index.ts"), 'export const optionMarker = "akan-option";\n');
    await write(path.join(root, "pkgs/akanjs/server/decorators.ts"), 'export const tryMarker = "akan-try";\n');

    const output = await bundle(root, akanServerPaths, [
      'import { optionMarker } from "akanjs/server";',
      'import { tryMarker } from "akanjs/server/decorators";',
      'import { jsx } from "react/jsx-runtime";',
      "export const markers = [optionMarker, tryMarker, jsx];",
    ]);
    expect(output).toContain("akan-option");
    expect(output).toContain("akan-try");
    expect(output).not.toMatch(/from\s+["']akanjs\/server(?:\/decorators)?["']/);
    expect(output).toContain("react/jsx-runtime");
  });

  test("externalizes optional backend dependencies reached through bundled akanjs/server sources", async () => {
    const root = await makeTempRoot();
    await write(
      path.join(root, "pkgs/akanjs/server/index.ts"),
      [
        'import { loadRedis } from "akanjs/service";',
        'export const optionMarker = "akan-option";',
        "export const redisLoader = loadRedis;",
        "",
      ].join("\n"),
    );
    await write(path.join(root, "pkgs/akanjs/service/index.ts"), 'export * from "./predefinedAdaptor";\n');
    await write(
      path.join(root, "pkgs/akanjs/service/predefinedAdaptor/index.ts"),
      'export const loadRedis = async () => import("ioredis");\n',
    );

    const output = await bundle(root, akanServerPaths, [
      'import { optionMarker, redisLoader } from "akanjs/server";',
      "export const marker = optionMarker;",
      "export const loader = redisLoader;",
    ]);
    expect(output).toContain("akan-option");
    expect(output).toContain("ioredis");
    expect(output).not.toMatch(/from\s+["']akanjs\/(?:server|service)["']/);
  });

  test("lets published akanjs package exports resolve when workspace paths are absent", async () => {
    const root = await makeTempRoot();
    await write(
      path.join(root, "node_modules/akanjs/package.json"),
      JSON.stringify({
        name: "akanjs",
        type: "module",
        exports: {
          "./server": {
            import: "./server/index.ts",
            default: "./server/index.ts",
          },
        },
      }),
    );
    await write(
      path.join(root, "node_modules/akanjs/server/index.ts"),
      'export const optionMarker = "published-option";\n',
    );

    const output = await bundle(root, {}, [
      'import { optionMarker } from "akanjs/server";',
      'import { jsx } from "react/jsx-runtime";',
      "export const markers = [optionMarker, jsx];",
    ]);
    expect(output).toContain("published-option");
    expect(output).not.toMatch(/from\s+["']akanjs\/server["']/);
    expect(output).toContain("react/jsx-runtime");
  });
});
