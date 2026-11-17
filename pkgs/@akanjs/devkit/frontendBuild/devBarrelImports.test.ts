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

  test("narrows an object's part under a route runtime as a build does, keyed by the object and the importer's side", async () => {
    const root = await realpath(await makeTempRoot());
    const file = (name: string) => path.join(root, name);
    const memoIndex = (zone: string) =>
      `import * as Template from "./Memo.Template";\nimport * as Zone from "./${zone}";\nexport const Memo = { Template, Zone };\n`;
    await write(file("lib/memo/index.ts"), memoIndex("Memo.Zone"));
    for (const part of ["Template", "Zone", "Panel"])
      await write(file(`lib/memo/Memo.${part}.tsx`), '"use client";\nexport const View = () => null;\n');
    const importer = file("page/_index.tsx");
    const page = 'import { Memo } from "../lib/memo";\nexport const Page = () => <Memo.Zone.View />;\n';
    const key = `object:${file("lib/memo/index.ts")}#Memo`;
    const round = () => new DevBarrelImports([], async () => null, { packageRoot: root });

    const server = await round().rewrite(page, importer);
    const client = await round().rewrite(`"use client";\n${page}`, importer);
    const stamp = async () => (await round().stamps([key], (id) => path.relative(root, id)))[key];

    expect(await new DevBarrelImports(["akanjs/ui"], async () => null).rewrite(page, importer)).toBeNull();
    expect(server?.contents).toBe(
      'import { View as Memo$Zone$View } from "../lib/memo/Memo.Zone.tsx";\nexport const Page = () => <Memo$Zone$View />;\n',
    );
    expect(Object.keys(server?.narrowed ?? {})).toEqual([key]);
    expect(server?.narrowed[key]?.names).toEqual(["@server", "Zone.View"]);
    expect(client?.narrowed[key]?.names).toEqual(["@client", "Zone.View"]);
    expect(Object.keys((await stamp())?.read ?? {}).sort()).toEqual([
      "lib/memo",
      "lib/memo/Memo.Template.tsx",
      "lib/memo/Memo.Zone.tsx",
      "lib/memo/index.ts",
    ]);

    const hash = server?.narrowed[key]?.hash;
    const digest = (await stamp())?.digest;
    await write(file("lib/memo/Memo.Zone.tsx"), '"use client";\nexport const View = () => "saved";\n');
    expect(await round().fingerprint(key, ["@server", "Zone.View"])).toBe(hash ?? "");
    expect((await stamp())?.digest).toBe(digest ?? "");

    await write(
      file("lib/memo/Memo.Zone.tsx"),
      '"use client";\nexport const View = () => null;\nexport const Added = () => null;\n',
    );
    expect((await stamp())?.digest).not.toBe(digest ?? "");

    await write(file("lib/memo/index.ts"), memoIndex("Memo.Panel"));
    expect(await round().fingerprint(key, ["@server", "Zone.View"])).not.toBe(hash ?? "");
  });

  test("hashes a part called through the object with whether it reads `this`, so a save that makes it read one moves both", async () => {
    const root = await realpath(await makeTempRoot());
    const file = (name: string) => path.join(root, name);
    await write(file("lib/memo/index.ts"), 'import * as Util from "./Memo.Util";\nexport const Memo = { Util };\n');
    await write(file("lib/memo/Memo.Util.ts"), "export function format() {\n  return 1;\n}\n");
    const importer = file("page/_index.tsx");
    const key = `object:${file("lib/memo/index.ts")}#Memo`;
    const round = () => new DevBarrelImports([], async () => null, { packageRoot: root });
    const digest = async () => (await round().stamps([key], (id) => path.relative(root, id)))[key]?.digest;

    const narrowed = (
      await round().rewrite('import { Memo } from "../lib/memo";\nexport const n = Memo.Util.format();\n', importer)
    )?.narrowed[key];
    const before = await digest();
    await write(file("lib/memo/Memo.Util.ts"), "export function format() {\n  return 2;\n}\n");
    expect(narrowed?.names).toEqual(["@server", "Util.format()"]);
    expect(await digest()).toBe(before ?? "");

    await write(file("lib/memo/Memo.Util.ts"), "export function format(this: unknown) {\n  return this;\n}\n");
    expect(await digest()).not.toBe(before ?? "");
    expect(await round().fingerprint(key, narrowed?.names ?? [])).not.toBe(narrowed?.hash ?? "");
  });
});
