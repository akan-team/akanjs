import { Any, enumOf } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";

export class AgentStop extends enumOf("agentStop", ["end", "toolUse"] as const) {}

// Defined in the fetch facet because both bundles must register the scalar: the client materializes
// `fetch.runAgentTurn` from serialized signal metadata and resolves this refName at handler build, and every
// generated useClient.ts loads this barrel — while `akanjs/signal`, which re-imports it for the server graph,
// never reaches the client. It cannot live in `akanjs/constant` itself: via() runs at class-definition time,
// and inside that package's own barrel it would run before the package finished initializing (the bundler's
// macro loader dies on the TDZ).
export class AgentTurn extends via((field) => ({
  text: field(String, { default: "" }), // the assistant's words; empty when the turn is only tool calls
  toolCalls: field([Any]), // { id, name, args } per call — args carries the tool's own schema, not a model's
  stop: field(AgentStop, { default: "end" }),
})) {
  isToolUse() {
    return this.stop === "toolUse";
  }
}

export const agentTurnConstant = ConstantRegistry.buildScalar("agentTurn" as const, AgentTurn, {
  AgentTurn,
  AgentStop,
});
