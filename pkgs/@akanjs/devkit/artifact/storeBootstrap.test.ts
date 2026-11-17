import { describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { App } from "../commandDecorators";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { StoreBootstrap } from "./storeBootstrap";

const makeTempRoot = tempDirs("akan-store-bootstrap-");
const synced = ["st", "usePage", "__client/_base.fetch", "__client/_useClient", "__client/_st", "__client/refs"];

const syncedApp = async () => {
  const cwdPath = await makeTempRoot();
  for (const file of synced) await write(path.join(cwdPath, "lib", `${file}.ts`), "export {};\n");
  return { cwdPath } as unknown as App;
};

describe("StoreBootstrap.scopeOf", () => {
  test("is the page runtime for a synced app", async () => {
    expect(await StoreBootstrap.scopeOf(await syncedApp())).toBe("page");
  });

  test.each(synced)("keeps the whole runtime while lib/%s.ts was not generated yet", async (file) => {
    const app = await syncedApp();
    await rm(path.join(app.cwdPath, "lib", `${file}.ts`));

    expect(await StoreBootstrap.scopeOf(app)).toBe("whole");
  });
});
