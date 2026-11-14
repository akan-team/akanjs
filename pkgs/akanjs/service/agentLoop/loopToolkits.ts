import type { AgentTool } from "../predefinedAdaptor/agentTools.adaptor";
import type { AgentWireMessage, AgentWireToolCall, AgentWireToolResult } from "../predefinedAdaptor/llm.adaptor";
import type { AgentLoopToolkit } from "./agentLoopTypes";
import { LoopRemotes } from "./loopRemotes";
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

  openExternal({ id, name }: AgentWireToolCall, kit: string, tools: string[], omitted = 0): AgentWireToolResult {
    this.#open.add(kit);
    return { id, name, result: { opened: kit, tools, ...(omitted ? { omitted } : {}) } };
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

  //? A summary carries what the calls it replaced opened; a call opened its toolkit only if its result is no error. Read
  //? in stored order, a result with the call it answers, so a remote a later call found disconnected is closed here as
  //? the run that stored it closed it. Security: `true` once any remote was opened, open still or not.
  restore(messages: readonly AgentWireMessage[]): boolean {
    if (!this.#any) return false;
    const calls = new Map(LoopTranscript.answered(messages));
    let reached = false;
    for (const message of messages) {
      for (const kit of message.summary ? (message.toolkits ?? []) : []) reached = this.#reopen(kit) || reached;
      for (const result of message.role === "tool" ? (message.toolResults ?? []) : []) {
        const call = calls.get(result);
        if (!call) continue;
        const kit = call.name === LoopToolkits.toolName ? call.args.name : null;
        if (typeof kit === "string" && !result.error) reached = this.#reopen(kit) || reached;
        if (result.code === LoopRemotes.disconnected) this.#open.delete(this.#ownerOf(call.name) ?? "");
      }
    }
    return reached;
  }

  #reopen(kit: string): boolean {
    if (!this.#has(kit)) return false;
    this.#open.add(kit);
    return this.#external.has(kit);
  }

  #ownerOf(toolName: string): string | undefined {
    return [...this.#external.keys()].find((kit) => toolName.startsWith(`${kit}.`));
  }

  #has(kit: string): boolean {
    return this.#kits.has(kit) || this.#external.has(kit);
  }
}
