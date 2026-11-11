import { describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../test/testHelpers";
import { DevGeneratedIndexSync } from "./devGeneratedIndexSync";

const makeTempRoot = tempDirs("akan-generated-index-");

const seedFacet = async (root: string, facet: string, { files, dirs }: { files: string[]; dirs: string[] }) => {
  const dir = path.join(root, "libs", "util", facet);
  await mkdir(dir, { recursive: true });
  await Promise.all(files.map((name) => writeFile(path.join(dir, name), "export const x = 1;\n")));
  await Promise.all(dirs.map((name) => mkdir(path.join(dir, name), { recursive: true })));
  return dir;
};

const barrelFor = async (root: string, facet: string, seed: { files: string[]; dirs: string[]; trigger: string }) => {
  const dir = await seedFacet(root, facet, seed);
  const sync = new DevGeneratedIndexSync({ workspaceRoot: root });
  const result = await sync.syncForBatch([path.join(dir, seed.trigger)]);
  expect(result.errors).toEqual([]);
  return readFile(path.join(dir, "index.ts"), "utf8");
};

describe("DevGeneratedIndexSync facet barrels", () => {
  test("camelCase facets export only clean camelCase names", async () => {
    const content = await barrelFor(await makeTempRoot(), "srvkit", {
      files: [
        "aes.ts",
        "cloudflareApi.ts",
        "cloudflareApi.helper.ts",
        "pushNotificationServer.type.ts",
        "PushNotificationServer.ts",
        "my_snake.ts",
        "kebab-case.ts",
      ],
      dirs: ["storageApi", "BadDir"],
      trigger: "aes.ts",
    });
    expect(content).toBe(`export * from "./aes";\nexport * from "./cloudflareApi";\nexport * from "./storageApi";\n`);
  });

  test("a facet with nothing to export keeps an empty barrel, and a deleted facet gets none", async () => {
    const root = await makeTempRoot();
    const content = await barrelFor(root, "common", { files: ["foo.helper.ts"], dirs: [], trigger: "foo.helper.ts" });
    expect(content).toBe("export {};\n");

    const dir = path.join(root, "libs", "util", "common");
    await rm(dir, { recursive: true });
    const sync = new DevGeneratedIndexSync({ workspaceRoot: root });
    expect(await sync.syncForBatch([path.join(dir, "foo.helper.ts")])).toEqual({ changedFiles: [], errors: [] });
    expect(await Bun.file(path.join(dir, "index.ts")).exists()).toBe(false);
  });

  test("ui facet exports only clean PascalCase names", async () => {
    const content = await barrelFor(await makeTempRoot(), "ui", {
      files: ["Globe.tsx", "AkanLogo.tsx", "Globe_Dynamic.tsx", "lowerStart.tsx"],
      dirs: ["Code", "badDir"],
      trigger: "Globe.tsx",
    });
    expect(content).toBe(`export * from "./AkanLogo";\nexport * from "./Code";\nexport * from "./Globe";\n`);
  });
});
