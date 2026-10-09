import { Any } from "akanjs/base";
import type { AgentWireContext, AgentWireMessage, AgentWireTool, LlmTurnRequest } from "akanjs/service";
import { srv } from "akanjs/service";
import { AgentMeter } from "./agentMeter";
import { AgentTurn } from "./agentTurn";
import { AgentTurnStream } from "./agentTurnStream";
import { endpoint } from "./endpoint";
import { AgentRelayAccess } from "./guards";
import { internal } from "./internal";
import { CallerAccount, Req } from "./internalArg";
import { serverSignal } from "./serverSignal";
import { SignalRegistry } from "./signalRegistry";

export class AgentInternal extends internal(srv.agent, () => ({})) {}

export class AgentEndpoint extends endpoint(srv.agent, ({ mutation }) => ({
  // The `Any` bodies keep the endpoint off MCP whatever the guard answers.
  runAgentTurn: mutation(AgentTurn, { guards: [AgentRelayAccess] })
    .body("messages", [Any])
    .body("tools", [Any])
    .body("context", [Any])
    .body("instructions", String, { nullable: true })
    // `Req` binds the endpoint to HTTP, where SSE negotiation reads the Accept header.
    .with(Req)
    .with(CallerAccount, { nullable: true })
    .exec(async function (messages, tools, context, instructions, request, account) {
      const turn: LlmTurnRequest = {
        messages: messages as unknown as AgentWireMessage[],
        tools: tools as unknown as AgentWireTool[],
        context: context as unknown as AgentWireContext[],
        ...(instructions ? { instructions } : {}),
      };
      if (AgentTurnStream.wants(request as Bun.BunRequest))
        return AgentTurnStream.response((onDelta) =>
          AgentMeter.run(account, () => this.agentService.runTurn(turn, onDelta)),
        ) as unknown as AgentTurn;
      return await AgentMeter.run(account, () => this.agentService.runTurn(turn));
    }),
})) {}

export class Agent extends serverSignal(AgentEndpoint, AgentInternal) {}
export const agent = SignalRegistry.registerService("agent" as const, AgentInternal, AgentEndpoint, Agent, "akanjs");
