import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createTempApp, tempRoots, writeJson, writeText } from "../test/testHelpers";
import { GuardCatalog } from "./guardCatalog";

const track = tempRoots();

const guardFile = (names: string[]) =>
  names.map((name) => `export class ${name} implements Guard {\n  canPass() {\n    return true;\n  }\n}\n`).join("\n");

const createAppWithLibs = async () => {
  const temp = track(await createTempApp("demo"));
  const lib = (name: string, files: Record<string, string>) =>
    Promise.all([
      writeText(path.join(temp.root, "libs", name, "akan.config.ts"), "export default {};\n"),
      ...Object.entries(files).map(([file, content]) => writeText(path.join(temp.root, "libs", name, file), content)),
    ]);
  await lib("shared", {
    "srvkit/guards.ts": guardFile(["Admin", "User"]),
    "srvkit/internalArgs.ts": "export class Self implements InternalArg {}\n",
    "srvkit/guards.signal.test.ts": guardFile(["TestOnly"]),
    "akan.lib.json": JSON.stringify({ libDeps: ["util"] }),
  });
  await lib("util", { "srvkit/guards.ts": guardFile(["Machine"]) });
  await lib("other", { "srvkit/guards.ts": guardFile(["Elsewhere"]) });
  await writeText(path.join(temp.root, "apps/demo/srvkit/guards.ts"), guardFile(["LocalOnly"]));
  return temp;
};

describe("GuardCatalog", () => {
  test("reads the target's srvkit, the libs it reaches, and the framework's Public", async () => {
    const { root, app } = await createAppWithLibs();
    await writeJson(path.join(root, "apps/demo/akan.app.json"), { libDeps: ["shared"] });

    const catalog = await GuardCatalog.load(app);

    expect(catalog.reachedLibs).toEqual(["shared", "util"]);
    expect(catalog.names.sort()).toEqual(["Admin", "LocalOnly", "Machine", "Public", "User"]);
    expect(catalog.resolve("LocalOnly").specifier).toBe("@apps/demo/srvkit");
    expect(catalog.resolve("Admin").specifier).toBe("@libs/shared/srvkit");
    expect(catalog.resolve("Public").specifier).toBe("akanjs/signal");
    expect(catalog.resolve("Elsewhere").specifier).toBeNull();
  });

  test("falls back to every workspace lib before a sync has recorded the target's deps", async () => {
    const { app } = await createAppWithLibs();

    expect((await GuardCatalog.load(app)).resolve("Elsewhere").specifier).toBe("@libs/other/srvkit");
  });

  test("names the acting user only when the guard guarantees one and its internal arg exists", async () => {
    const { app } = await createAppWithLibs();
    const catalog = await GuardCatalog.load(app);

    expect(catalog.actingUserOf(["User"])).toMatchObject({ argName: "Self", specifier: "@libs/shared/srvkit" });
    expect(catalog.actingUserOf(["Admin"])).toBeNull();
    expect(catalog.actingUserOf(["SignedIn"])).toBeNull();
  });
});
