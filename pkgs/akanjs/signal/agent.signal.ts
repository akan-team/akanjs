import { Any } from "akanjs/base";
import {
  AgentMeter,
  AgentRelayPolicy,
  type AgentWireContext,
  type AgentWireMessage,
  type AgentWireTool,
  srv,
} from "akanjs/service";
import { AgentTurn } from "./agentTurn";
import { AgentTurnStream } from "./agentTurnStream";
import { endpoint } from "./endpoint";
import { AgentRelayAccess } from "./guards";
import { internal } from "./internal";
import { CallerAccount, Ip, Req } from "./internalArg";
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
    .with(Ip, { nullable: true })
    .exec(async function (messages, tools, context, instructions, request, account, ip) {
      const http = request as Bun.BunRequest;
      const scope = AgentMeter.turnOf(account, { headers: http.headers, ip });
      // Before the stream opens, so a refusal answers with its own status rather than as an error event.
      const turn = await AgentRelayPolicy.apply(
        {
          messages: messages as unknown as AgentWireMessage[],
          tools: tools as unknown as AgentWireTool[],
          context: context as unknown as AgentWireContext[],
          ...(instructions ? { instructions } : {}),
        },
        scope,
      );
      if (AgentTurnStream.wants(http))
        return AgentTurnStream.response((onDelta, signal) =>
          AgentMeter.run(account, () => this.agentService.runTurn(turn, { onDelta, signal }), {
            turn: scope,
            request: turn,
            signal,
          }),
        ) as unknown as AgentTurn;
      try {
        return AgentTurnStream.relayable(
          await AgentMeter.run(account, () => this.agentService.runTurn(turn, { signal: http.signal }), {
            turn: scope,
            request: turn,
            signal: http.signal,
          }),
        );
      } catch (error) {
        //? The client left, so nobody reads this answer; rethrown, its abort would be logged as a server error.
        if (http.signal.aborted)
          return new Response(null, { status: 499, headers: { "cache-control": "no-store" } }) as unknown as AgentTurn;
        throw error;
      }
    }),
})) {}

export class Agent extends serverSignal(AgentEndpoint, AgentInternal) {}
export const agent = SignalRegistry.registerService("agent" as const, AgentInternal, AgentEndpoint, Agent, "akanjs");
