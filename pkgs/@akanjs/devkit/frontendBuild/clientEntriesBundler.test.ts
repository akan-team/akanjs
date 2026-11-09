import { describe, expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText } from "../testHelpers";
import { ClientEntriesBundler } from "./clientEntriesBundler";

const makeTempRoot = tempDirs("akan-client-entries-");

describe("ClientEntriesBundler", () => {
  test("takes a package's production build in a build and its default one under start", async () => {
    const root = await realpath(await makeTempRoot());
    await writeText(
      path.join(root, "node_modules/twobuild/package.json"),
      '{ "name": "twobuild", "exports": { ".": { "production": "./prod.js", "default": "./switch.js" } } }\n',
    );
    await writeText(path.join(root, "node_modules/twobuild/prod.js"), 'export const mark = "prod-build";\n');
    await writeText(path.join(root, "node_modules/twobuild/switch.js"), 'export const mark = "switch-build";\n');
    const entry = path.join(root, "Mark.tsx");
    await writeText(entry, '"use client";\nimport { mark } from "twobuild";\nexport const Mark = () => mark;\n');
    const app = {
      name: "probe",
      cwdPath: path.join(root, "app"),
      dist: { cwdPath: path.join(root, "dist") },
      workspace: { workspaceRoot: root },
      getConfig: async () => ({ optimizeImports: [] }),
      getPublicEnv: () => ({}),
    };
    const bundle = async (command: "build" | "start") => {
      const result = await new ClientEntriesBundler({ app: app as never, entries: [entry], command }).bundle();
      const output = result.entryOutputAbsByAbsPath.get(entry);
      return output ? await Bun.file(output).text() : "";
    };

    expect(await bundle("build")).toContain("prod-build");
    expect(await bundle("start")).toContain("switch-build");
  });
});
