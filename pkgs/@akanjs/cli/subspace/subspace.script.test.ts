import { describe, expect, spyOn, test } from "bun:test";
import { CommandContainer } from "@akanjs/devkit/commandDecorators";
import type { SubspacePlan } from "@akanjs/devkit/subspace";
import { createFakeExecutor } from "@akanjs/devkit/testHelpers";
import { Logger } from "akanjs/common";
import { SubspaceRunner } from "./subspace.runner";
import { SubspaceScript } from "./subspace.script";

const planWith = (refusals: Partial<SubspacePlan>): SubspacePlan => ({
  name: "acme",
  repo: "git@github.com:acme/app.git",
  branch: "develop",
  branchRefusal: null,
  workspaceRefusal: null,
  apps: ["acme"],
  libs: [],
  files: 1,
  rootEntries: ["package.json"],
  excludedRootEntries: [],
  subspaceOwnedRootEntries: [],
  prunedDependencies: [],
  lockProblem: null,
  warnings: [],
  ...refusals,
});

describe("SubspaceScript.plan", () => {
  test("exits 1 when a push would be refused, and leaves the code alone when nothing stands in its way", async () => {
    const plan = spyOn(CommandContainer.get(SubspaceRunner), "plan");
    const printed = spyOn(Logger, "rawLog").mockImplementation(() => undefined);
    const exitCode = process.exitCode;
    try {
      for (const refusal of [
        { workspaceRefusal: "workspace working tree is dirty" },
        { branchRefusal: 'Branch "feature/x" is not pushable' },
        { lockProblem: "bun.lock resolves packages from http://127.0.0.1:4873" },
      ]) {
        process.exitCode = 0;
        plan.mockResolvedValue(planWith(refusal));
        await CommandContainer.get(SubspaceScript).plan(createFakeExecutor("repo") as never, "acme", "json");
        expect(process.exitCode).toBe(1);
      }

      process.exitCode = 0;
      plan.mockResolvedValue(planWith({}));
      await CommandContainer.get(SubspaceScript).plan(createFakeExecutor("repo") as never, "acme", "json");
      expect(process.exitCode).toBe(0);
    } finally {
      plan.mockRestore();
      printed.mockRestore();
      //? Bun ignores `process.exitCode = undefined`, so restoring an unset code needs the 0.
      process.exitCode = exitCode ?? 0;
    }
  });
});
