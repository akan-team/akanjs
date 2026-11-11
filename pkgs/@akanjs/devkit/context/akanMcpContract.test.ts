import { describe, expect, test } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import path from "node:path";
import { createTempApp, tempRoots } from "../test/testHelpers";
import { createAkanValidationContract, workflowArtifactPath } from "./akanMcpContract";

const track = tempRoots();

describe("createAkanValidationContract", () => {
  test("exposes reference-first tooling rollout gate semantics", () => {
    const contract = createAkanValidationContract();

    expect(contract.toolingRolloutGate).toMatchObject({
      schemaVersion: 1,
      strategy: "reference-first-dependency-later",
    });
    expect(contract.toolingRolloutGate.candidates).toContainEqual(
      expect.objectContaining({
        packageName: "typescript",
        status: "allowed",
      }),
    );
    expect(contract.toolingRolloutGate.candidates).toContainEqual(
      expect.objectContaining({
        packageName: "@ttsc/graph",
        status: "reference-only",
      }),
    );
  });

  test("keeps dependency adoption gated by package and source-body constraints", () => {
    const contract = createAkanValidationContract();

    expect(contract.toolingRolloutGate.gateConditions).toContain(
      "Works in Bun runtime and published package artifacts.",
    );
    expect(contract.toolingRolloutGate.gateConditions).toContain("Does not break dist/pkgs package verification.");
    expect(contract.toolingRolloutGate.gateConditions).toContain(
      "Does not move MCP responses toward returning source bodies.",
    );
  });
});

describe("workflowArtifactPath", () => {
  test("keeps the plans and reports an MCP call names inside the workspace's workflow folder", async () => {
    const { root, workspace } = track(await createTempApp("demo"));
    const workflows = path.join(root, ".akan/workflows");
    await mkdir(path.join(workflows, "plans"), { recursive: true });
    await symlink(path.join(root, "package.json"), path.join(workflows, "plans/linked.json"));

    expect(workflowArtifactPath(workspace, ".akan/workflows/plans/a.json")).toBe(path.join(workflows, "plans/a.json"));
    expect(workflowArtifactPath(workspace, `${workflows}/runs/b.json`)).toBe(path.join(workflows, "runs/b.json"));
    expect(workflowArtifactPath(workspace, "add-field-123")).toBe(path.join(workflows, "runs/add-field-123.json"));
    for (const outside of [
      "package.json",
      `${root}/package.json`,
      ".akan/workflows/../../package.json",
      ".akan/workflows",
      ".akan/workflows/plans/linked.json",
      "/tmp/plan.json",
    ])
      expect(() => workflowArtifactPath(workspace, outside)).toThrow("MCP workflow files live under .akan/workflows/");
  });
});
