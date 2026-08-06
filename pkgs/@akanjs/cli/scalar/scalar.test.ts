import { afterEach, describe, expect, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { cleanupCliTempWorkspace, createTempApp } from "../testHelpers";
import { ScalarRunner } from "./scalar.runner";
import { ScalarScript } from "./scalar.script";

const tempRoots: string[] = [];

afterEach(async () => {
  CommandContainer.clear();
  await Promise.all(tempRoots.splice(0).map((root) => cleanupCliTempWorkspace(root)));
});

describe("ScalarScript", () => {
  test("returns primitive write report for scalar template creation", async () => {
    const { root, app } = await createTempApp("demo");
    tempRoots.push(root);
    const report = await CommandContainer.get(ScalarScript).createScalar(app, "money");

    expect(report).toMatchObject({
      schemaVersion: 1,
      command: "create-scalar",
      status: "passed",
      validationCommands: [{ command: "akan sync demo" }, { command: "akan lint demo" }],
    });
    expect(report.changedFiles.map((file) => file.path)).toContain("apps/demo/lib/__scalar/money/money.constant.ts");
  });
});

describe("ScalarRunner", () => {
  test("applies scalar templates without overwriting existing scalar files", async () => {
    const { root, app } = await createTempApp("demo");
    tempRoots.push(root);
    const runner = new ScalarRunner();

    await runner.applyScalarTemplate(app, "money");
    const constantPath = `${app.cwdPath}/lib/__scalar/money/money.constant.ts`;
    const abstractPath = `${app.cwdPath}/lib/__scalar/money/money.abstract.md`;
    expect(await Bun.file(constantPath).exists()).toBe(true);
    expect(await Bun.file(abstractPath).exists()).toBe(true);
    const original = await Bun.file(constantPath).text();

    await Bun.write(constantPath, "custom constant");
    await runner.applyScalarTemplate(app, "money");
    expect(await Bun.file(constantPath).text()).toBe("custom constant");
    expect(original).toContain("export class Money");
  });
});
