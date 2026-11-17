import { describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { App } from "../commandDecorators";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { StoreBootstrap } from "./storeBootstrap";

const makeTempRoot = tempDirs("akan-store-bootstrap-");
const synced = ["st", "usePage", "__client/_base.fetch", "__client/_useClient", "__client/_st", "__client/refs"];

const appOf = async (clientRuntime: "all" | "route") => {
  const cwdPath = await makeTempRoot();
  for (const file of synced) await write(path.join(cwdPath, "lib", `${file}.ts`), "export {};\n");
  return { cwdPath, getConfig: async () => ({ clientRuntime }) } as unknown as App;
};

describe("StoreBootstrap.scopeOf", () => {
  test("is the page runtime for a synced app on clientRuntime route, and the whole runtime on all", async () => {
    expect(await StoreBootstrap.scopeOf(await appOf("route"))).toBe("page");
    expect(await StoreBootstrap.scopeOf(await appOf("all"))).toBe("whole");
  });

  test.each(synced)("keeps the whole runtime while lib/%s.ts was not generated yet", async (file) => {
    const app = await appOf("route");
    await rm(path.join(app.cwdPath, "lib", `${file}.ts`));

    expect(await StoreBootstrap.scopeOf(app)).toBe("whole");
  });
});
