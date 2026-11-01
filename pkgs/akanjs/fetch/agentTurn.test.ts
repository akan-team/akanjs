import { describe, expect, test } from "bun:test";
import { Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { AgentTurn, FetchClient } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";

// useClient.ts imports only FetchClient, and Bun links `export *` lazily per binding and drops unused imports, so
// the scalar must register from FetchClient's own module.
const agentSignal = {
  prefix: "agent",
  endpoint: {
    runAgentTurn: {
      type: "mutation",
      args: [{ type: "body", name: "messages", refName: "Any", arrDepth: 1 }],
      returns: { refName: "agentTurn", modelType: "scalar" },
    },
  },
} as unknown as SerializedSignal;

class TestErr extends Error {
  static fromJSON(payload: { error?: string }) {
    return new TestErr(payload.error ?? "unknown");
  }
}

describe("agentTurn scalar on the client graph", () => {
  test("a FetchClient-only import materializes fetch.runAgentTurn", () => {
    const proto = FetchClient.build<{ fetch: { runAgentTurn: unknown } }>(
      {},
      { agent: agentSignal },
      { origin: "http://localhost", Err: TestErr },
    );
    expect(typeof proto.fetch.runAgentTurn).toBe("function");
  });

  test("the registered scalar crystallizes a turn", () => {
    const Model = ConstantRegistry.getScalar("agentTurn").model as new (arg: unknown) => { isToolUse(): boolean };
    expect(new Model({ stop: "toolUse" }).isToolUse()).toBe(true);
    expect(new Model({}).isToolUse()).toBe(false);
  });

  test("names the framework when a lib declares agentTurn with other fields", () => {
    ConstantRegistry.buildScalar(
      "agentTurn",
      via((field) => ({ usage: field(Int) })),
      {},
      "legacyAgent",
    );
    try {
      expect(() => ConstantRegistry.assertConsistentRefNames()).toThrow(
        'scalar "agentTurn": "akanjs" (lib/__scalar/agentTurn) has text: String?, toolCalls: Any[], stop: enum agentStop(end|toolUse|length); "legacyAgent" (lib/__scalar/agentTurn) has usage: Int',
      );
    } finally {
      ConstantRegistry.buildScalar("agentTurn", AgentTurn, {}, "legacyAgent");
    }
    expect(() => ConstantRegistry.assertConsistentRefNames()).not.toThrow();
  });
});
