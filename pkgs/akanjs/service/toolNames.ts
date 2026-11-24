import type { AgentWireMessage, AgentWireToolCall, LlmTurnRequest } from "./predefinedAdaptor/llm.adaptor";

const wireSafe = /^[A-Za-z0-9_-]+$/;

/**
 * OpenAI-dialect and Anthropic function names are `[A-Za-z0-9_-]{1,64}` while a zone scopes tools with `.`; DeepSeek
 * does not refuse an illegal name but calls a normalized one that the browser does not know.
 */
export class ToolNames {
  static readonly limit = 64;

  readonly #toWire = new Map<string, string>();
  readonly #toSurface = new Map<string, string>();

  /** The transcript's names too: a call to a tool that has since left the screen still reaches the wire. */
  static of(request: LlmTurnRequest): ToolNames {
    return new ToolNames([
      ...request.tools.map((tool) => tool.name),
      ...(request.deferred ?? []).map((tool) => tool.name),
      ...request.messages.flatMap((message) => ToolNames.#namesIn(message)),
    ]);
  }

  constructor(names: Iterable<string>) {
    const all = [...new Set(names)];
    // A name that already fits keeps itself, so it is claimed before any folded name can be assigned it.
    const taken = new Set(all.filter((name) => ToolNames.#fits(name)));
    // Sorted so the mapping depends on the set, not the order met: a moving suffix would name one tool two ways.
    for (const name of all.filter((candidate) => !ToolNames.#fits(candidate)).sort((a, b) => (a < b ? -1 : 1))) {
      const wire = ToolNames.#unique(ToolNames.#fold(name), taken);
      taken.add(wire);
      this.#toWire.set(name, wire);
      this.#toSurface.set(wire, name);
    }
  }

  get renamed() {
    return this.#toWire.size > 0;
  }

  wire(name: string) {
    return this.#toWire.get(name) ?? name;
  }

  /** An invented name stays as it came for the surface's `Unknown tool`: guessing the intended tool would run one. */
  surface(name: string) {
    return this.#toSurface.get(name) ?? name;
  }

  encode(request: LlmTurnRequest): LlmTurnRequest {
    if (!this.renamed) return request;
    return {
      ...request,
      tools: request.tools.map((tool) => ({ ...tool, name: this.wire(tool.name) })),
      ...(request.deferred
        ? { deferred: request.deferred.map((tool) => ({ ...tool, name: this.wire(tool.name) })) }
        : {}),
      messages: request.messages.map((message) => this.#encoded(message)),
    };
  }

  decode(calls: AgentWireToolCall[]): AgentWireToolCall[] {
    if (!this.renamed) return calls;
    return calls.map((call) => ({ ...call, name: this.surface(call.name) }));
  }

  #encoded(message: AgentWireMessage): AgentWireMessage {
    if (!message.toolCalls?.length && !message.toolResults?.length && !message.listed?.length) return message;
    return {
      ...message,
      ...(message.listed?.length ? { listed: message.listed.map((name) => this.wire(name)) } : {}),
      ...(message.toolCalls?.length
        ? { toolCalls: message.toolCalls.map((call) => ({ ...call, name: this.wire(call.name) })) }
        : {}),
      ...(message.toolResults?.length
        ? { toolResults: message.toolResults.map((result) => ({ ...result, name: this.wire(result.name) })) }
        : {}),
    };
  }

  static #namesIn(message: AgentWireMessage): string[] {
    return [
      ...(message.toolCalls ?? []).map((call) => call.name),
      ...(message.toolResults ?? []).map((result) => result.name),
      ...(message.listed ?? []),
    ];
  }

  static #fits(name: string) {
    return name.length <= ToolNames.limit && wireSafe.test(name);
  }

  /** `.` is the one character the surface itself adds, so it folds to the `__` every MCP client already reads. */
  static #fold(name: string) {
    const folded = name.replaceAll(".", "__").replace(/[^A-Za-z0-9_-]/g, "-");
    // Trimmed from the front: the tail is the tool's own name, and the scope prefix is what a long name has spare.
    return folded.length <= ToolNames.limit ? folded : folded.slice(folded.length - ToolNames.limit);
  }

  static #unique(candidate: string, taken: Set<string>) {
    if (!taken.has(candidate)) return candidate;
    for (let idx = 2; ; idx += 1) {
      const suffix = `_${idx}`;
      const next = `${candidate.slice(0, ToolNames.limit - suffix.length)}${suffix}`;
      if (!taken.has(next)) return next;
    }
  }
}
