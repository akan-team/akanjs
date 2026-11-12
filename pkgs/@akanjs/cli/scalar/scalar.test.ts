import { afterEach, describe, expect, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import { createTempApp, tempRoots } from "@akanjs/devkit/test/testHelpers";
import { ScalarRunner } from "./scalar.runner";
import { ScalarScript } from "./scalar.script";

afterEach(() => CommandContainer.clear());
const track = tempRoots();

describe("ScalarScript", () => {
  test("returns primitive write report for scalar template creation", async () => {
    const { app } = track(await createTempApp("demo"));
    const report = await CommandContainer.get(ScalarScript).createScalar(app, "money");

    expect(report).toMatchObject({
      schemaVersion: 1,
      command: "create-scalar",
      status: "passed",
      validationCommands: [{ command: "akan verify demo" }],
    });
    expect(report.changedFiles.map((file) => file.path)).toContain("apps/demo/lib/__scalar/money/money.constant.ts");
  });

  test("refuses a scalar name that is not one plain path segment, and touches no file", async () => {
    const { root, app } = track(await createTempApp("demo"));
    const script = CommandContainer.get(ScalarScript);
    await script.createScalar(app, "money");
    const filesOf = async () => (await Array.fromAsync(new Bun.Glob("**").scan({ cwd: root, dot: true }))).sort();
    const before = await filesOf();

    for (const name of ["..", "../..", "money/..", "a/b", `${root}/apps/demo`, ""]) {
      await expect(script.removeScalar(app, name)).rejects.toThrow(`${JSON.stringify(name)} is no scalar name`);
      await expect(script.createScalar(app, name)).rejects.toThrow(
        "use letters, digits, - and _, starting with a letter",
      );
    }

    expect(await filesOf()).toEqual(before);
    await script.removeScalar(app, "money");
    expect(await Bun.file(`${app.cwdPath}/lib/__scalar/money/money.constant.ts`).exists()).toBe(false);
  });
});

describe("ScalarRunner", () => {
  test("applies scalar templates without overwriting existing scalar files", async () => {
    const { app } = track(await createTempApp("demo"));
    const runner = new ScalarRunner();

    await runner.applyScalarTemplate(app, "money");
    const constantPath = `${app.cwdPath}/lib/__scalar/money/money.constant.ts`;
    const abstractPath = `${app.cwdPath}/lib/__scalar/money/money.abstract.md`;
    expect(await Bun.file(constantPath).exists()).toBe(true);
    expect(await Bun.file(abstractPath).text()).toStartWith("# money Abstract\n");
    const original = await Bun.file(constantPath).text();

    await Bun.write(constantPath, "custom constant");
    await runner.applyScalarTemplate(app, "money");
    expect(await Bun.file(constantPath).text()).toBe("custom constant");
    expect(original).toContain("export class Money");
  });
});
