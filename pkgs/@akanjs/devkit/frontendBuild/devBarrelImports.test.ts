import { describe, expect, test } from "bun:test";
import { mkdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { DevBarrelImports } from "./devBarrelImports";

const makeTempRoot = tempDirs("akan-dev-barrel-imports-");

describe("DevBarrelImports", () => {
  test("points an installed package's import at the real file behind its link, relative to the importer", async () => {
    const root = await realpath(await makeTempRoot());
    const installed = path.join(root, "store/akanjs");
    await write(path.join(installed, "ui/index.ts"), 'export { Link } from "./Link";\n');
    await write(path.join(installed, "ui/Link/index.tsx"), "export const Link = () => null;\n");
    await mkdir(path.join(root, "node_modules"), { recursive: true });
    await symlink(installed, path.join(root, "node_modules/akanjs"));
    const uiEntry = path.join(root, "node_modules/akanjs/ui/index.ts");
    const importer = path.join(root, "apps/demo/page/_index.tsx");
    await write(importer, "");

    const barrels = new DevBarrelImports(["akanjs/ui"], async (specifier) =>
      specifier === "akanjs/ui"
        ? { pkgName: specifier, entryFile: uiEntry, pkgDir: path.dirname(uiEntry), preserveFilePath: true }
        : null,
    );
    const rewrite = await barrels.rewrite('import { Link } from "akanjs/ui";\n', importer);

    expect(rewrite?.contents).toBe('import { Link } from "../../../store/akanjs/ui/Link/index.tsx";\n');
  });
});
