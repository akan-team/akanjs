import { Err } from "akanjs/dictionary";
import type { AgentLoopRequest } from "./agentLoopTypes";
import { LoopAsk } from "./loopAsk";
import { LoopToolkits } from "./loopToolkits";

export class LoopRequest {
  //? The most `setTimeout` takes: past it a timer fires at once, which would end the run as out of budget.
  static readonly maxWallMs = 2 ** 31 - 1;

  static assertValid({ allow, messages, maxRounds, budget, compact, toolkits, clientTools, ask }: AgentLoopRequest) {
    //? Security: `listAs` reads a missing `allow` as every tool the account may see.
    if (!Array.isArray(allow)) LoopRequest.#refuse("allow");
    if (!Array.isArray(messages)) LoopRequest.#refuse("messages");
    LoopRequest.#assertToolkits(toolkits, allow);
    if (ask !== undefined && typeof ask !== "boolean") LoopRequest.#refuse("ask");
    if (ask && allow.includes(LoopAsk.toolName)) LoopRequest.#refuse("allow");
    LoopRequest.#assertClientTools(clientTools);
    LoopRequest.#assertCount("maxRounds", maxRounds);
    LoopRequest.#assertCount("compact.at", compact?.at);
    LoopRequest.#assertCount("compact.keep", compact?.keep);
    LoopRequest.#assertCount("budget.tokens", budget?.tokens);
    LoopRequest.#assertCount("budget.toolCalls", budget?.toolCalls);
    const wallMs = budget?.wallMs;
    if (wallMs !== undefined && !(Number.isFinite(wallMs) && wallMs <= LoopRequest.maxWallMs))
      LoopRequest.#refuse("budget.wallMs");
  }

  static #assertToolkits(toolkits: AgentLoopRequest["toolkits"], allow: readonly string[]) {
    if (toolkits === undefined) return;
    if (typeof toolkits !== "object" || Array.isArray(toolkits)) LoopRequest.#refuse("toolkits");
    for (const [name, kit] of Object.entries(toolkits)) {
      const tools = (kit as { tools?: unknown } | null)?.tools;
      const valid =
        !!name &&
        typeof kit?.description === "string" &&
        Array.isArray(tools) &&
        tools.every((tool) => typeof tool === "string");
      if (!valid) LoopRequest.#refuse(`toolkits.${name}`);
    }
    //? The run answers that name itself, so a real tool by it would be shadowed.
    if (allow.includes(LoopToolkits.toolName)) LoopRequest.#refuse("allow");
  }

  static #assertClientTools(clientTools: AgentLoopRequest["clientTools"]) {
    if (clientTools === undefined) return;
    if (!Array.isArray(clientTools)) LoopRequest.#refuse("clientTools");
    for (const tool of clientTools as unknown[]) {
      const { name, description, parameters } = (tool ?? {}) as Record<string, unknown>;
      const valid =
        typeof name === "string" &&
        !!name &&
        (description === undefined || typeof description === "string") &&
        (parameters === undefined || (typeof parameters === "object" && parameters !== null));
      if (!valid) LoopRequest.#refuse("clientTools");
    }
  }

  static #assertCount(name: string, value: number | undefined) {
    if (value !== undefined && !(Number.isSafeInteger(value) && value >= 0)) LoopRequest.#refuse(name);
  }

  static #refuse(name: string): never {
    throw new Err("base.error.invalidArgument", { name });
  }
}
