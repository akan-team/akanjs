import type { AgentWireMessage, AgentWireToolCall, LlmTurnRequest } from "./predefinedAdaptor/llm.adaptor";

const wireSafe = /^[A-Za-z0-9_-]+$/;

/**
 * Renames a turn's tools onto what a provider's function-calling wire accepts, and reads the answer back.
 *
 * A zone publishes its tools scope-prefixed — `videoProjectDraft.createVideoProject` — which is legal for MCP,
 * where `.` is an allowed character and the scope join. Every OpenAI-compatible and Anthropic function schema is
 * narrower: `[A-Za-z0-9_-]`, at most 64 characters. A provider that validates answers 400; DeepSeek does not, and
 * what happened instead was worse to debug — the model normalized the illegal name itself, called the bare
 * `createVideoProject`, and the browser answered `Unknown tool`, spending a turn on a tool that was published all
 * along.
 *
 * Renamed here rather than in each adaptor for the reason `AgentService.explained` gives: every adaptor would
 * otherwise have to remember, and forgetting is silent. A name the wire already accepts is left alone, so the
 * root agent's request is byte-for-byte what it was.
 */
export class ToolNames {
  /** Both dialects reject a longer name, and neither says so in terms of the tool you wrote. */
  static readonly limit = 64;

  readonly #toWire = new Map<string, string>();
  readonly #toSurface = new Map<string, string>();

  /**
   * Every name the request carries, not just the published ones: the transcript holds calls to tools that have
   * since left the screen, and one of those reaching the wire unrenamed is the same failure a turn later.
   */
  static of(request: LlmTurnRequest): ToolNames {
    return new ToolNames([
      ...request.tools.map((tool) => tool.name),
      ...request.messages.flatMap((message) => ToolNames.#namesIn(message)),
    ]);
  }

  constructor(names: Iterable<string>) {
    const all = [...new Set(names)];
    // A name that already fits keeps itself, so it is claimed before any folded name can be assigned it.
    const taken = new Set(all.filter((name) => ToolNames.#fits(name)));
    // Sorted so the mapping depends on the set of names and not on the order they were met: a suffix that moved
    // between turns would leave the transcript naming one tool two ways.
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

  /**
   * Unknown stays as it came. A model that invented a name is answered by the surface's own `Unknown tool`, which
   * lands in the transcript as a tool result it can correct from — guessing which tool it meant would run one.
   */
  surface(name: string) {
    return this.#toSurface.get(name) ?? name;
  }

  encode(request: LlmTurnRequest): LlmTurnRequest {
    if (!this.renamed) return request;
    return {
      ...request,
      tools: request.tools.map((tool) => ({ ...tool, name: this.wire(tool.name) })),
      messages: request.messages.map((message) => this.#encoded(message)),
    };
  }

  decode(calls: AgentWireToolCall[]): AgentWireToolCall[] {
    if (!this.renamed) return calls;
    return calls.map((call) => ({ ...call, name: this.surface(call.name) }));
  }

  #encoded(message: AgentWireMessage): AgentWireMessage {
    if (!message.toolCalls?.length && !message.toolResults?.length) return message;
    return {
      ...message,
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
