import type { AgentTool } from "../predefinedAdaptor/agentTools.adaptor";
import type { AgentWireMessage, AgentWireToolCall, AgentWireToolResult } from "../predefinedAdaptor/llm.adaptor";
import type { AgentLoopToolkit } from "./agentLoopTypes";
import { LoopTranscript } from "./loopTranscript";

export class LoopToolkits {
  static readonly toolName = "openToolkit";

  readonly #kits: ReadonlyMap<string, AgentLoopToolkit>;
  //? A remote: its tools are known only once it is opened, so the run lists and opens it itself.
  readonly #external: ReadonlyMap<string, string>;
  readonly #open = new Set<string>();
  #visible: AgentTool[] = [];

  constructor(kits: Record<string, AgentLoopToolkit> | undefined, external: ReadonlyMap<string, string> = new Map()) {
    this.#kits = new Map(Object.entries(kits ?? {}));
    this.#external = external;
  }

  get opened(): string[] {
    return [...this.#open];
  }

  isMeta(name: string): boolean {
    return this.#any && name === LoopToolkits.toolName;
  }

  get #any(): boolean {
    return this.#kits.size > 0 || this.#external.size > 0;
  }

  listed(visible: AgentTool[]): AgentTool[] {
    this.#visible = visible;
    if (!this.#any) return visible;
    const shown = visible.filter((tool) => this.#isOn(tool.name));
    const closed = this.#closed();
    return closed.length ? [...shown, this.#metaTool(closed)] : shown;
  }

  //? Only for a tool this account may see, so it names nothing `allow` or the guards keep from the run.
  refusalOf(name: string): string | null {
    const remote = [...this.#external.keys()].find((kit) => !this.#open.has(kit) && name.startsWith(`${kit}.`));
    if (remote)
      return `Not run: ${name} is in the "${remote}" toolkit, which is not open. Open it with ${LoopToolkits.toolName}, then call a tool it lists.`;
    if (!this.#kits.size || !this.#visible.some((tool) => tool.name === name)) return null;
    const kit = [...this.#kits].find(([kitName, { tools }]) => !this.#open.has(kitName) && tools.includes(name))?.[0];
    if (!kit) return null;
    return `Not run: ${name} is in the "${kit}" toolkit, which was not open when this call was written. Open it with ${LoopToolkits.toolName}, then call ${name} again.`;
  }

  open({ id, name, args }: AgentWireToolCall): AgentWireToolResult {
    const kit = typeof args.name === "string" ? args.name : "";
    const tools = this.#toolsOf(kit);
    if (!tools.length) {
      const known = this.#closed().join(", ");
      return {
        id,
        name,
        error: `No toolkit named "${kit}".${known ? ` Open one of: ${known}.` : " Every toolkit is already open."}`,
        code: "unknownToolkit",
      };
    }
    this.#open.add(kit);
    return { id, name, result: { opened: kit, tools } };
  }

  externalOf({ name, args }: AgentWireToolCall): string | null {
    return name === LoopToolkits.toolName && typeof args.name === "string" && this.#external.has(args.name)
      ? args.name
      : null;
  }

  openExternal({ id, name }: AgentWireToolCall, kit: string, tools: string[]): AgentWireToolResult {
    this.#open.add(kit);
    return { id, name, result: { opened: kit, tools } };
  }

  close(kit: string) {
    this.#open.delete(kit);
  }

  #isOn(name: string): boolean {
    let inKit = false;
    for (const [kitName, { tools }] of this.#kits) {
      if (!tools.includes(name)) continue;
      if (this.#open.has(kitName)) return true;
      inKit = true;
    }
    return !inKit;
  }

  #toolsOf(kit: string): string[] {
    const tools = this.#kits.get(kit)?.tools ?? [];
    return this.#visible.filter((tool) => tools.includes(tool.name)).map((tool) => tool.name);
  }

  #closed(): string[] {
    return [
      ...[...this.#kits.keys()].filter((kit) => !this.#open.has(kit) && this.#toolsOf(kit).length),
      ...[...this.#external.keys()].filter((kit) => !this.#open.has(kit)),
    ];
  }

  #metaTool(closed: string[]): AgentTool {
    const lines = closed.map((kit) =>
      `- ${kit}: ${this.#kits.get(kit)?.description ?? this.#external.get(kit) ?? ""}`.trimEnd(),
    );
    return {
      name: LoopToolkits.toolName,
      description: [
        "Adds a toolkit's tools to the ones listed to you, from your next step on. Open a toolkit only when the request needs its tools.",
        "Toolkits:",
        ...lines,
      ].join("\n"),
      parameters: {
        type: "object",
        properties: { name: { type: "string", enum: closed } },
        required: ["name"],
        additionalProperties: false,
      },
      readOnly: true,
    };
  }

  //? A summary carries what the calls it replaced opened; a call opened its toolkit only if its result is no error.
  restore(messages: readonly AgentWireMessage[]) {
    if (!this.#any) return;
    const answered = new Map(LoopTranscript.results(messages).map((result) => [result.id, result]));
    for (const message of messages) {
      for (const kit of message.summary ? (message.toolkits ?? []) : []) if (this.#has(kit)) this.#open.add(kit);
      for (const call of message.toolCalls ?? []) {
        if (call.name !== LoopToolkits.toolName) continue;
        const result = answered.get(call.id);
        const kit = call.args.name;
        if (result && !result.error && typeof kit === "string" && this.#has(kit)) this.#open.add(kit);
      }
    }
  }

  #has(kit: string): boolean {
    return this.#kits.has(kit) || this.#external.has(kit);
  }
}
