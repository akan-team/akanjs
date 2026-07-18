import { describe, expect, test } from "bun:test";
import { createAkanValidationContract } from "./akanMcpContract";

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
