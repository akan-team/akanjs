import { afterEach, describe, expect, test } from "bun:test";
import { rm, symlink } from "node:fs/promises";
import path from "node:path";
import { createTempPackage, writeJson, writeText } from "@akanjs/devkit/testHelpers";
import { ApplicationRunner } from "../application/application.runner";
import { WorkspaceRunner } from "../workspace/workspace.runner";
import { VerifyPipeline } from "./verifyPipeline";
import { VerifyReport } from "./verifyReport";
import { VerifyScope } from "./verifyScope";

const repoRoot = path.resolve(import.meta.dir, "../../../..");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const brokenPackage = async () => {
  const { root, workspace } = await createTempPackage("@sample/tool");
  roots.push(root);
  await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  const dir = path.join(root, "pkgs/@sample/tool");
  await writeJson(path.join(dir, "tsconfig.json"), {
    compilerOptions: { strict: true, noEmit: true, types: [], target: "esnext", module: "esnext" },
    include: ["index.ts"],
  });
  await writeText(path.join(dir, "index.ts"), 'export const port: number = "8282";\nexport const ok = 1\n');
  return { root, workspace };
};

describe("VerifyPipeline", () => {
  test("lints with fixes and typechecks a package in one run, reporting one line per problem", async () => {
    const { root, workspace } = await brokenPackage();
    const scope = VerifyScope.resolve([{ code: " M", file: "pkgs/@sample/tool/index.ts" }], {
      apps: [],
      libs: [],
      pkgs: ["@sample/tool"],
    });

    const result = await new VerifyPipeline(workspace, new WorkspaceRunner(), new ApplicationRunner()).run(scope);

    expect(result.ok).toBe(false);
    expect(result.steps.map((step) => [step.name, step.status])).toEqual([
      ["lint", "pass"],
      ["typecheck", "fail"],
    ]);
    expect(result.steps.find((step) => step.name === "lint")?.fixed).toBe(1);
    expect(await Bun.file(path.join(root, "pkgs/@sample/tool/index.ts")).text()).toContain("export const ok = 1;");
    expect(VerifyReport.text(result).split("\n").slice(1)).toEqual([
      "pkgs/@sample/tool/index.ts:1:14 TS2322 Type 'string' is not assignable to type 'number'.",
    ]);
  }, 60_000);
});
