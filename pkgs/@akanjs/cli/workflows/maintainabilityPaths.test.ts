import { describe, expect, test } from "bun:test";
import { MaintainabilityContract, type MultiWriteViolation } from "@akanjs/devkit/maintainabilityContract";
import { MaintainabilityReport } from "@akanjs/devkit/maintainabilityReport";
import type { WorkflowSpec } from "@akanjs/devkit/workflow";
import { workflowSpecs } from "./index";
import { MaintainabilityPaths } from "./maintainabilityPaths";
import { sysInputs } from "./shared";

const specOf = (name: string, inputs: WorkflowSpec["inputs"], replacesRules: string[]): WorkflowSpec => ({
  schemaVersion: 1,
  name,
  description: name,
  whenToUse: name,
  inputs,
  steps: [],
  predictedChanges: [],
  validation: [],
  completionCriteria: [],
  replacesRules,
});

describe("MaintainabilityPaths", () => {
  test("every gate rule has a workflow that replaces it, or is listed as pathless", () => {
    const replaced = new Set(workflowSpecs.flatMap((spec) => spec.replacesRules ?? []));
    const uncovered = MaintainabilityContract.ruleIds.filter(
      (rule) => !replaced.has(rule) && !MaintainabilityPaths.pathless.has(rule),
    );

    expect(uncovered).toEqual([]);
    expect([...MaintainabilityPaths.pathless].filter((rule) => replaced.has(rule))).toEqual([]);
  });

  test("every replacesRules entry names a real gate rule", () => {
    const unknown = workflowSpecs.flatMap((spec) =>
      (spec.replacesRules ?? [])
        .filter((rule) => !MaintainabilityPaths.isRule(rule))
        .map((rule) => `${spec.name}:${rule}`),
    );

    expect(unknown).toEqual([]);
  });

  test("fills the target flag with the linted target and leaves every other required input a placeholder", () => {
    const commands = new MaintainabilityPaths().commandsOf("shared");

    expect(commands["akan.store.multi-write"]).toEqual([
      "akan workflow plan add-mutation --app shared --module <module> --mutation <mutation> --guard <guard>",
    ]);
    expect(commands["akan.component.store-access"]).toEqual([
      "akan workflow plan create-interaction --app shared --interaction <interaction>",
    ]);
  });

  test("lists every workflow that replaces one rule, each on its own Path line", () => {
    const paths = new MaintainabilityPaths([
      specOf("bundle-writes", { ...sysInputs, flowName: { type: "string", required: true, description: "" } }, [
        "akan.store.multi-write",
      ]),
      specOf("move-writes", { ...sysInputs, note: { type: "string", description: "" } }, [
        "akan.store.multi-write",
        "akan.unknown.rule",
      ]),
    ]);
    const commands = paths.commandsOf("demo");
    const failure: MultiWriteViolation = {
      kind: "multiWrite",
      rule: "akan.store.multi-write",
      key: "lib/court/court.store.ts#assign",
      file: "lib/court/court.store.ts",
      line: 5,
      owner: "assign",
      writes: ["fetch.assign", "fetch.push"],
      writeCount: 2,
    };

    expect(commands).toEqual({
      "akan.store.multi-write": [
        "akan workflow plan bundle-writes --app demo --flow-name <flow-name>",
        "akan workflow plan move-writes --app demo",
      ],
    });
    expect(
      MaintainabilityReport.describe("apps/demo", [failure], commands)
        .split("\n")
        .filter((line) => line.startsWith("    Path: ")),
    ).toEqual([
      "    Path: akan workflow plan bundle-writes --app demo --flow-name <flow-name>",
      "    Path: akan workflow plan move-writes --app demo",
    ]);
  });
});
