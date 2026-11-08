import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ModuleLayout } from "./moduleLayout";

let root = "";
const touch = async (file: string) => {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), "");
};

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "akan-module-"));
  for (const role of ["store", "constant", "signal", "document", "service", "dictionary"])
    await touch(`apps/demo/lib/memo/memo.${role}.ts`);
  await touch("apps/demo/lib/memo/Memo.Template.tsx");
  for (const role of ["dictionary", "service", "signal"]) await touch(`apps/demo/lib/_oauth/oauth.${role}.ts`);
  for (const role of ["constant", "dictionary"]) await touch(`libs/shared/lib/__scalar/geo/geo.${role}.ts`);
  await touch("apps/demo/lib/cnst.ts");
  await touch("apps/demo/lib/__lib/lib.constant.ts");
  await mkdir(path.join(root, "apps/demo/lib/empty"), { recursive: true });
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("ModuleLayout", () => {
  test("finds the module a file sits in, a service or scalar module included", () => {
    expect(ModuleLayout.folderOf(root, path.join(root, "apps/demo/lib/memo/Memo.Template.tsx"))).toEqual({
      dir: path.join(root, "apps/demo/lib/memo"),
      name: "memo",
      system: "demo",
    });
    expect(ModuleLayout.folderOf(root, path.join(root, "apps/demo/lib/_oauth/oauth.signal.ts"))?.name).toBe("oauth");
    expect(ModuleLayout.folderOf(root, path.join(root, "libs/shared/lib/__scalar/geo/geo.constant.ts"))?.dir).toBe(
      path.join(root, "libs/shared/lib/__scalar/geo"),
    );
    expect(ModuleLayout.folderOf(root, path.join(root, "apps/demo/lib/cnst.ts"))).toBeNull();
    expect(ModuleLayout.folderOf(root, path.join(root, "apps/demo/lib/__lib/lib.constant.ts"))).toBeNull();
    expect(ModuleLayout.folderOf(root, path.join(root, "apps/demo/page/_index.tsx"))).toBeNull();
    expect(ModuleLayout.folderOf(root, path.join(root, "../elsewhere/apps/demo/lib/memo/memo.store.ts"))).toBeNull();
  });

  test("lists a module's files in the order a change flows through them", () => {
    const memo = ModuleLayout.folderFor(root, "demo", "memo");
    expect(memo && ModuleLayout.filesIn(memo).map((file) => path.basename(file))).toEqual([
      "memo.constant.ts",
      "memo.dictionary.ts",
      "memo.document.ts",
      "memo.service.ts",
      "memo.signal.ts",
      "memo.store.ts",
    ]);
    const oauth = ModuleLayout.folderFor(root, "demo", "oauth");
    expect(oauth && ModuleLayout.filesIn(oauth).map((file) => path.basename(file))).toEqual([
      "oauth.dictionary.ts",
      "oauth.service.ts",
      "oauth.signal.ts",
    ]);
    expect(ModuleLayout.folderFor(root, "shared", "geo")?.dir).toBe(path.join(root, "libs/shared/lib/__scalar/geo"));
    expect(ModuleLayout.folderFor(root, "demo", "ghost")).toBeNull();
  });

  test("takes only plain names, so no argument reaches outside lib/ or a generated folder", () => {
    expect(ModuleLayout.folderFor(root, "demo", "_lib")).toBeNull();
    expect(ModuleLayout.folderFor(root, "demo", "_oauth")).toBeNull();
    expect(ModuleLayout.folderFor(root, "../../demo", "memo")).toBeNull();
    expect(ModuleLayout.folderFor(root, "demo", "../memo")).toBeNull();
  });

  test("lists every module with files to open", () => {
    expect(ModuleLayout.modulesOf(root).map(({ system, name }) => `${system}/${name}`)).toEqual([
      "demo/oauth",
      "demo/memo",
      "shared/geo",
    ]);
  });

  test("lays files out in columns of two once there are more than three", () => {
    expect(ModuleLayout.gridOf(2)).toEqual({ orientation: 0, groups: [{}, {}] });
    expect(ModuleLayout.gridOf(6)).toEqual({
      orientation: 0,
      groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }, { groups: [{}, {}] }],
    });
    expect(ModuleLayout.gridOf(5).groups.at(-1)).toEqual({ groups: [{}] });
    expect(ModuleLayout.gridOf(2, { besideStudio: true })).toEqual({ orientation: 0, groups: [{}, {}, {}] });
    expect(ModuleLayout.gridOf(4, { besideStudio: true }).groups).toEqual([
      { groups: [{}, {}] },
      { groups: [{}, {}] },
      {},
    ]);
  });
});
