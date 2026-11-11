import type { PromiseOrObject } from "akanjs/base";
import { Err } from "akanjs/dictionary";

/** `null` or `undefined` is a principal that may no longer act: a revoked session, a removed member. */
export type AgentAccountResolver = (principal: string) => PromiseOrObject<unknown>;

export class AgentAccounts {
  static #resolver: AgentAccountResolver | null = null;

  static use(resolver: AgentAccountResolver | null) {
    AgentAccounts.#resolver = resolver;
  }

  static async resolve(principal: string): Promise<unknown> {
    const resolver = AgentAccounts.#resolver;
    if (!resolver) throw new Err("agent.error.accountResolverMissing");
    return (await resolver(principal)) ?? null;
  }
}
