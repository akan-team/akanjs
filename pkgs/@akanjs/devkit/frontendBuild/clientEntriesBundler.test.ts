import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { ClientEntriesBundler } from "./clientEntriesBundler";

const makeTempRoot = tempDirs("akan-client-entries-");
//? Bun's metafile names real paths, and macOS's temp dir sits behind the /var symlink.
const realTempRoot = async () => fs.realpathSync(await makeTempRoot());

const vendorApp = async () => {
  const root = await realTempRoot();
  const appDir = path.join(root, "apps/demo");
  const vendor = path.join(root, "vendor/facet.ts");
  await write(path.join(root, "vendor/lib.ts"), "export const real = 1;\nexport const other = 2;\n");
  await write(vendor, 'export * from "./lib";\n');
  const app = {
    name: "demo",
    cwdPath: appDir,
    dist: { cwdPath: path.join(root, "dist/apps/demo") },
    workspace: { workspaceRoot: root },
    getConfig: async () => ({ optimizeImports: [] }),
    getPublicEnv: () => ({}),
  } as never;
  const bundle = (command: "build" | "start", entryExports?: Record<string, string[]>) =>
    new ClientEntriesBundler({ app, entries: [vendor], command, entryExports }).bundle();
  return { appDir, vendor, bundle };
};

describe("ClientEntriesBundler narrowed entries", () => {
  test("fails the build, naming each name a route imports that its vendor does not export", async () => {
    const { vendor, bundle } = await vendorApp();

    await expect(bundle("build", { [vendor]: ["real", "notThere"] })).rejects.toThrow("facet.ts: notThere");
    await expect(bundle("build", { [vendor]: ["real"] })).resolves.toBeDefined();
  }, 30_000);

  test("writes a narrowed alias apart from the whole one `akan start` keeps for the same entry", async () => {
    const { appDir, vendor, bundle } = await vendorApp();
    await bundle("start");
    await bundle("build", { [vendor]: ["real"] });

    const aliasDir = path.join(appDir, ".akan/generated/client-entry-alias/client");
    const aliases = await Promise.all(
      [...new Bun.Glob("*.tsx").scanSync(aliasDir)].map((file) => Bun.file(path.join(aliasDir, file)).text()),
    );

    expect(aliases).toHaveLength(2);
    expect(aliases).toContain(ClientEntriesBundler.narrowedAliasSource(vendor, ["real"]));
  }, 30_000);
});
