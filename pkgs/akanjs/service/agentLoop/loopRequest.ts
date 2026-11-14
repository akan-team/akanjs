import { Err } from "akanjs/dictionary";
import type { AgentLoopRequest } from "./agentLoopTypes";
import { LoopAsk } from "./loopAsk";
import { LoopRemotes } from "./loopRemotes";
import { LoopToolkits } from "./loopToolkits";

export class LoopRequest {
  //? The most `setTimeout` takes: past it a timer fires at once, which would end the run as out of budget.
  static readonly maxWallMs = 2 ** 31 - 1;
  //? A screen lends six built-in tools, under 3,000 characters in all, beside its own actions. Definitions ride every
  //? round, so the ceiling is twenty times that count, at 1,500 characters a tool.
  static readonly maxClientTools = 128;
  static readonly maxClientToolChars = 200_000;
  //? A schema nests two levels a property; past a few thousand, `JSON.stringify` overflows the stack, here or in a dialect.
  static readonly maxClientToolDepth = 64;

  static assertValid(request: AgentLoopRequest) {
    const { allow, messages, maxRounds, budget, compact, toolkits, clientTools, ask, remotes, approve } = request;
    //? Security: `listAs` reads a missing `allow` as every tool the account may see.
    if (!Array.isArray(allow)) LoopRequest.#refuse("allow");
    if (!Array.isArray(messages)) LoopRequest.#refuse("messages");
    LoopRequest.#assertToolkits(toolkits, allow);
    LoopRequest.#assertRemotes(remotes, toolkits, allow);
    //? Security: a call's arguments leave for the remote, which names its own tools read-only, so someone must be asked.
    if (remotes?.length && typeof approve !== "function")
      throw new Err("base.error.requiredArgument", { name: "approve" });
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

  static #assertRemotes(
    remotes: AgentLoopRequest["remotes"],
    toolkits: AgentLoopRequest["toolkits"],
    allow: readonly string[],
  ) {
    if (remotes === undefined) return;
    if (!Array.isArray(remotes)) LoopRequest.#refuse("remotes");
    const names = new Set<string>();
    for (const remote of remotes as unknown[]) {
      const name = (remote as { name?: unknown } | null)?.name;
      //? One `openToolkit` opens both kinds, so a remote may not take a toolkit's name.
      const valid =
        LoopRemotes.isValid(remote) && !names.has(remote.name) && !Object.hasOwn(toolkits ?? {}, remote.name);
      if (!valid) LoopRequest.#refuse(`remotes.${typeof name === "string" ? name : ""}`);
      names.add(name as string);
    }
    if (names.size && allow.includes(LoopToolkits.toolName)) LoopRequest.#refuse("allow");
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
    if (clientTools.length > LoopRequest.maxClientTools)
      LoopRequest.#refuseClientTools("tools", LoopRequest.maxClientTools, clientTools.length);
    const depth = LoopRequest.#depthOf(clientTools, LoopRequest.maxClientToolDepth + 1);
    if (depth > LoopRequest.maxClientToolDepth)
      LoopRequest.#refuseClientTools("depth", LoopRequest.maxClientToolDepth, depth);
    const chars = JSON.stringify(clientTools).length;
    if (chars > LoopRequest.maxClientToolChars)
      LoopRequest.#refuseClientTools("chars", LoopRequest.maxClientToolChars, chars);
  }

  //? Level by level, as a recursive walk would overflow where `JSON.stringify` does. A level of more values than the
  //? character ceiling is past it already, a character a value at least, and is refused before the levels under it.
  static #depthOf(value: unknown, stopAt: number): number {
    let level: unknown[] = [value];
    let depth = 0;
    while (depth < stopAt) {
      level = level.flatMap((item) => (item && typeof item === "object" ? Object.values(item) : []));
      if (level.length > LoopRequest.maxClientToolChars)
        LoopRequest.#refuseClientTools("chars", LoopRequest.maxClientToolChars, level.length);
      if (!level.length) break;
      depth += 1;
    }
    return depth;
  }

  static #refuseClientTools(limit: "tools" | "chars" | "depth", max: number, sent: number): never {
    throw new Err("agent.error.clientToolsRefused", { limit, max, sent }, { statusCode: 413 });
  }

  static #assertCount(name: string, value: number | undefined) {
    if (value !== undefined && !(Number.isSafeInteger(value) && value >= 0)) LoopRequest.#refuse(name);
  }

  static #refuse(name: string): never {
    throw new Err("base.error.invalidArgument", { name });
  }
}
