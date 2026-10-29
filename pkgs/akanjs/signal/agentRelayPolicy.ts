import type { PromiseOrObject } from "akanjs/base";
import type { LlmTurnRequest } from "akanjs/service";

export interface AgentRequestContext {
  /** What the account middleware resolved for this call, as the access guard saw it; `null` for an anonymous one. */
  account: unknown;
  ip: string | null;
}

export type AgentRequestPolicy = (
  request: LlmTurnRequest,
  context: AgentRequestContext,
) => PromiseOrObject<LlmTurnRequest>;

//? The browser writes the whole request: the access guard decides who spends the key, and only this decides on what.
export class AgentRelayPolicy {
  static #policy: AgentRequestPolicy | null = null;

  static use(policy: AgentRequestPolicy | null) {
    AgentRelayPolicy.#policy = policy;
  }

  static async apply(request: LlmTurnRequest, context: AgentRequestContext): Promise<LlmTurnRequest> {
    const policy = AgentRelayPolicy.#policy;
    return policy ? await policy(request, context) : request;
  }
}
