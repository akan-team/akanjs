import type { AgentWireMessage, AgentWireTool } from "../predefinedAdaptor/llm.adaptor";
import { LoopRequest } from "./loopRequest";

//? A page lends its tools run by run, so a screen left behind takes its tools with it, while a provider that kept
//? thinking binds it to every definition the earlier turns saw. The run stores each lent definition once, on the answer
//? that first listed it, and declares it again in a later run without listing it.
export class LoopLent {
  #names = new Set<string>();
  #left: AgentWireTool[] = [];

  lend(lent: readonly AgentWireTool[], messages: readonly AgentWireMessage[], free: (name: string) => boolean) {
    this.#names = new Set(lent.map((tool) => tool.name));
    this.#left = LoopLent.stored(messages).filter((tool) => !this.#names.has(tool.name) && free(tool.name));
  }

  has(name: string): boolean {
    return this.#names.has(name);
  }

  get left(): readonly AgentWireTool[] {
    return this.#left;
  }

  tracks(messages: readonly AgentWireMessage[]): boolean {
    return this.#names.size > 0 || messages.some((message) => message.listed);
  }

  listingOf(tools: readonly AgentWireTool[], messages: readonly AgentWireMessage[]) {
    const lent = LoopLent.fresh(
      tools.filter((tool) => this.#names.has(tool.name)),
      messages,
    );
    return { listed: tools.map((tool) => tool.name), ...(lent.length ? { lent } : {}) };
  }

  static definition({ name, description, parameters }: AgentWireTool): AgentWireTool {
    return { name, ...(description ? { description } : {}), ...(parameters ? { parameters } : {}) };
  }

  //? Security: page input the host stored back, so a definition is read only in a lent tool's shape, newest first
  //? within the count and size ceilings a request's own `clientTools` meets.
  static stored(messages: readonly AgentWireMessage[]): AgentWireTool[] {
    const latest = new Map<string, AgentWireTool>();
    for (const message of messages)
      for (const tool of Array.isArray(message.lent) ? message.lent : [])
        if (LoopLent.#valid(tool)) {
          latest.delete(tool.name);
          latest.set(tool.name, LoopLent.definition(tool));
        }
    const kept: AgentWireTool[] = [];
    let chars = 0;
    for (const tool of [...latest.values()].reverse()) {
      chars += JSON.stringify(tool).length;
      if (kept.length >= LoopRequest.maxClientTools || chars > LoopRequest.maxClientToolChars) break;
      kept.push(tool);
    }
    return kept.reverse();
  }

  //? A provider reads them from `deferred`, as the definitions the run declares.
  static unlent(messages: AgentWireMessage[]): AgentWireMessage[] {
    return messages.map((message) => {
      if (!message.lent) return message;
      const { lent: _lent, ...rest } = message;
      return rest;
    });
  }

  static fresh(lent: readonly AgentWireTool[], messages: readonly AgentWireMessage[]): AgentWireTool[] {
    const known = new Map(LoopLent.stored(messages).map((tool) => [tool.name, JSON.stringify(tool)]));
    return lent
      .map((tool) => LoopLent.definition(tool))
      .filter((tool) => known.get(tool.name) !== JSON.stringify(tool));
  }

  static #valid(tool: unknown): tool is AgentWireTool {
    const { name, description, parameters } = (tool ?? {}) as Record<string, unknown>;
    return (
      typeof name === "string" &&
      !!name &&
      (description === undefined || typeof description === "string") &&
      (parameters === undefined ||
        (typeof parameters === "object" && parameters !== null && !Array.isArray(parameters)))
    );
  }
}
