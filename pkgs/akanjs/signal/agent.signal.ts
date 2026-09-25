import { Any } from "akanjs/base";
import type { AgentWireContext, AgentWireMessage, AgentWireTool, LlmTurnRequest } from "akanjs/service";
import { srv } from "akanjs/service";
import { AgentTurn } from "./agentTurn";
import { AgentTurnStream } from "./agentTurnStream";
import { endpoint } from "./endpoint";
import { AgentRelayAccess } from "./guards";
import { internal } from "./internal";
import { Req } from "./internalArg";
import { serverSignal } from "./serverSignal";
import { SignalRegistry } from "./signalRegistry";

export class AgentInternal extends internal(srv.agent, () => ({})) {}

export class AgentEndpoint extends endpoint(srv.agent, ({ mutation }) => ({
  // No policy registered ⇒ `canPass` is false, the same answer `None` gives. `AgentRelayAccess.use(policy)` at
  // boot is what opens it; tools still execute only in the caller's own browser session. The `Any` bodies keep
  // the endpoint off MCP whatever the guard answers.
  runAgentTurn: mutation(AgentTurn, { guards: [AgentRelayAccess] })
    .body("messages", [Any])
    .body("tools", [Any])
    .body("context", [Any])
    .body("instructions", String, { nullable: true })
    // `Req` binds the endpoint to the HTTP transport (a ws call has no request to inject) — which is what the
    // chat's runner speaks, and what SSE negotiation needs the Accept header for.
    .with(Req)
    .exec(async function (messages, tools, context, instructions, request) {
      const turn: LlmTurnRequest = {
        messages: messages as unknown as AgentWireMessage[],
        tools: tools as unknown as AgentWireTool[],
        context: context as unknown as AgentWireContext[],
        ...(instructions ? { instructions } : {}),
      };
      if (AgentTurnStream.wants(request as Bun.BunRequest))
        // The signal layer sends a raw Response as-is, so the declared return stays the JSON path's contract.
        return AgentTurnStream.response((onDelta) => this.agentService.runTurn(turn, onDelta)) as unknown as AgentTurn;
      return await this.agentService.runTurn(turn);
    }),
})) {}

export class Agent extends serverSignal(AgentEndpoint, AgentInternal) {}
export const agent = SignalRegistry.registerService("agent" as const, AgentInternal, AgentEndpoint, Agent);
