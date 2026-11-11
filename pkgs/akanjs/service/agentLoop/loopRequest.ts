import { Err } from "akanjs/dictionary";
import type { AgentLoopRequest } from "./agentLoopTypes";

export class LoopRequest {
  //? The most `setTimeout` takes: past it a timer fires at once, which would end the run as out of budget.
  static readonly maxWallMs = 2 ** 31 - 1;

  static assertValid({ allow, messages, maxRounds, budget, compact }: AgentLoopRequest) {
    //? Security: `listAs` reads a missing `allow` as every tool the account may see.
    if (!Array.isArray(allow)) LoopRequest.#refuse("allow");
    if (!Array.isArray(messages)) LoopRequest.#refuse("messages");
    LoopRequest.#assertCount("maxRounds", maxRounds);
    LoopRequest.#assertCount("compact.at", compact?.at);
    LoopRequest.#assertCount("compact.keep", compact?.keep);
    LoopRequest.#assertCount("budget.tokens", budget?.tokens);
    LoopRequest.#assertCount("budget.toolCalls", budget?.toolCalls);
    const wallMs = budget?.wallMs;
    if (wallMs !== undefined && !(Number.isFinite(wallMs) && wallMs <= LoopRequest.maxWallMs))
      LoopRequest.#refuse("budget.wallMs");
  }

  static #assertCount(name: string, value: number | undefined) {
    if (value !== undefined && !(Number.isSafeInteger(value) && value >= 0)) LoopRequest.#refuse(name);
  }

  static #refuse(name: string): never {
    throw new Err("base.error.invalidArgument", { name });
  }
}
