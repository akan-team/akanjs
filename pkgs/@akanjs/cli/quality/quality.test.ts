import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { createTempApp, tempRoots, writeJson, writeText } from "@akanjs/devkit/testHelpers";
import { Logger } from "akanjs/common";
import { QualityScript } from "./quality.script";

afterEach(() => {
  CommandContainer.clear();
  mock.restore();
});
const track = tempRoots();

describe("QualityScript", () => {
  test("baseline records the breaches of every app, lib and package, scoped packages included", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
    await writeText(`${root}/apps/demo/lib/court/Court.Zone.tsx`, "// line\n".repeat(450));
    await writeJson(`${root}/pkgs/@sample/tool/package.json`, { name: "@sample/tool", version: "0.1.0" });
    const body = Array.from({ length: 160 }, (_, idx) => `  // line ${idx}`).join("\n");
    await writeText(`${root}/pkgs/@sample/tool/boot.ts`, `export function boot() {\n${body}\n}\n`);
    const logged: string[] = [];
    spyOn(Logger, "rawLog").mockImplementation((message: string) => {
      logged.push(message);
    });

    await CommandContainer.get(QualityScript).baseline(workspace);

    expect(await readFile(`${root}/apps/demo/akan.baseline.json`, "utf8")).toContain('"lib/court/Court.Zone.tsx": 450');
    expect(await readFile(`${root}/pkgs/@sample/tool/akan.baseline.json`, "utf8")).toBe(
      '{\n  "akan.size.function": {\n    "boot.ts#boot": 162\n  }\n}\n',
    );
    expect(logged).toEqual([
      "apps/demo: wrote akan.baseline.json with 1 entries",
      "pkgs/@sample/tool: wrote akan.baseline.json with 1 entries",
    ]);
  });
});
