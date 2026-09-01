import { describe, expect, test } from "bun:test";
import { ConstantRegistry } from "akanjs/constant";
import { FetchClient } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";

// A generated useClient.ts imports only FetchClient from this barrel, so the framework scalar must register
// through FetchClient's own module: Bun links `export *` barrel modules lazily per used binding and its
// transpiler drops unused imports, so neither the barrel re-export nor a bare reference runs ../agentTurn.
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
});
