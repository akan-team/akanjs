import { Any, enumOf } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";

export class AgentStop extends enumOf("agentStop", ["end", "toolUse", "length"] as const) {}

// Here because both bundles register the scalar and `akanjs/signal` never reaches the client; not in `akanjs/constant`,
// where via() would run before that barrel finished initializing (the macro loader dies on the TDZ).
export class AgentTurn extends via((field) => ({
  text: field(String, { default: "" }), // the assistant's words; empty when the turn is only tool calls
  toolCalls: field([Any]), // { id, name, args } per call — args carries the tool's own schema, not a model's
  stop: field(AgentStop, { default: "end" }),
})) {
  isToolUse() {
    return this.stop === "toolUse";
  }
}

export const agentTurnConstant = ConstantRegistry.buildScalar(
  "agentTurn" as const,
  AgentTurn,
  { AgentTurn, AgentStop },
  "akanjs",
);
