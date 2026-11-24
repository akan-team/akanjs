import type { AgentTool } from "../predefinedAdaptor/agentTools.adaptor";
import type { AgentWireMessage, AgentWireToolCall, AgentWireToolResult } from "../predefinedAdaptor/llm.adaptor";
import type { AgentLoopOptions, AgentLoopToolkit } from "./agentLoopTypes";
import { LoopRemotes } from "./loopRemotes";
import { LoopToolBudget } from "./loopToolBudget";
import { LoopToolSearch } from "./loopToolSearch";
import { LoopTranscript } from "./loopTranscript";

interface Loaded {
  kind: "kit" | "tool";
  name: string;
}
interface Arranged {
  shown: AgentTool[];
  loaded: { tool: AgentTool; from: Loaded }[];
}

export class LoopToolkits {
  static readonly toolName = "openToolkit";

  readonly #kits: ReadonlyMap<string, AgentLoopToolkit>;
  //? A remote: its tools are known only once it is opened, so the run lists and opens it itself.
  readonly #external: ReadonlyMap<string, string>;
  readonly #search: LoopToolSearch | null;
  readonly #budget: LoopToolBudget;
  readonly #pinned: Loaded[];
  //? In the order loaded: prompt caches match a prefix, so what loads later lists after everything already listed.
  readonly #loaded = new Map<string, Loaded>();
  readonly #evicted = new Set<string>();
  #visible: AgentTool[] = [];

  constructor(
    { toolkits, search, listed, toolBudget }: Pick<AgentLoopOptions, "toolkits" | "search" | "listed" | "toolBudget">,
    external: ReadonlyMap<string, string> = new Map(),
  ) {
    this.#kits = new Map(Object.entries(toolkits ?? {}));
    this.#external = external;
    this.#search = search ? new LoopToolSearch(search) : null;
    this.#budget = new LoopToolBudget(toolBudget);
    this.#pinned = [...new Set(listed ?? [])].map((name) => ({ kind: this.#kits.has(name) ? "kit" : "tool", name }));
  }

  get opened(): string[] {
    return this.#names("kit");
  }

  get found(): string[] {
    return this.#names("tool");
  }

  isMeta(name: string): boolean {
    return (this.#any && name === LoopToolkits.toolName) || (!!this.#search && name === LoopToolSearch.toolName);
  }

  get #any(): boolean {
    return this.#kits.size > 0 || this.#external.size > 0;
  }

  listed(visible: AgentTool[]): AgentTool[] {
    this.#visible = visible;
    if (!this.#any) return visible;
    let { shown, loaded } = this.#arrange();
    const over = this.#budget.over(loaded.map(({ tool }) => tool));
    if (over.length) {
      this.#unlist(over, loaded);
      ({ shown } = this.#arrange());
    }
    const offered = this.#offered();
    const searchable = this.#search ? [this.#search.tool()] : [];
    return [...shown, ...(offered.length ? [this.#metaTool(offered)] : []), ...searchable];
  }

  deferred(listed: readonly AgentTool[]): AgentTool[] {
    if (!this.#any) return [];
    const names = new Set(listed.map((tool) => tool.name));
    return this.#visible.filter((tool) => this.#inKit(tool.name) && !names.has(tool.name));
  }

  get tracksListing(): boolean {
    return this.#any;
  }

  #arrange(): Arranged {
    const shown = this.#visible.filter((tool) => !this.#inKit(tool.name));
    const loaded: Arranged["loaded"] = [];
    const list = (from: Loaded, budgeted: boolean) => {
      for (const tool of this.#toolsOfEntry(from)) {
        if (shown.includes(tool)) continue;
        shown.push(tool);
        if (budgeted) loaded.push({ tool, from });
      }
    };
    for (const entry of this.#pinned) list(entry, false);
    for (const entry of this.#loaded.values()) list(entry, true);
    return { shown, loaded };
  }

  #toolsOfEntry({ kind, name }: Loaded): AgentTool[] {
    if (kind === "tool") return this.#visible.filter((tool) => tool.name === name && this.#inKit(name));
    const tools = this.#kits.get(name)?.tools ?? [];
    return this.#visible.filter((tool) => tools.includes(tool.name) && !this.#evicted.has(tool.name));
  }

  #unlist(names: string[], loaded: Arranged["loaded"]) {
    for (const name of names) {
      const from = loaded.find(({ tool }) => tool.name === name)?.from;
      if (from?.kind === "tool") this.#loaded.delete(LoopToolkits.#key(from));
      else this.#evicted.add(name);
    }
    const left = this.#arrange().loaded;
    for (const entry of [...this.#loaded.values()]) {
      if (entry.kind !== "kit" || !this.#kits.has(entry.name) || left.some(({ from }) => from === entry)) continue;
      this.#close(entry.name);
    }
  }

  //? Only for a tool this account may see, so it names nothing `allow` or the guards keep from the run.
  refusalOf(name: string): string | null {
    const remote = [...this.#external.keys()].find((kit) => !this.#isOpen(kit) && name.startsWith(`${kit}.`));
    if (remote)
      return `Not run: ${name} is in the "${remote}" toolkit, which is not open. Open it with ${LoopToolkits.toolName}, then call a tool it lists.`;
    if (!this.#kits.size || !this.#visible.some((tool) => tool.name === name)) return null;
    const find = this.#search ? `, or find it with ${LoopToolSearch.toolName}` : "";
    const kit = [...this.#kits].find(([kitName, { tools }]) => !this.#isOpen(kitName) && tools.includes(name))?.[0];
    if (kit)
      return `Not run: ${name} is in the "${kit}" toolkit, which was not open when this call was written. Open it with ${LoopToolkits.toolName}${find}, then call ${name} again.`;
    const unlisted = [...this.#kits].find(([, { tools }]) => tools.includes(name) && this.#evicted.has(name))?.[0];
    if (!unlisted) return null;
    return `Not run: ${name} was taken off your list to keep it short. Open the "${unlisted}" toolkit again with ${LoopToolkits.toolName}${find}, then call ${name} again.`;
  }

  //? Security: a toolkit marked `asked` opens on a person's word, so `approve` hears it as the write it lets in.
  gateOf({ name, args }: AgentWireToolCall): AgentTool | null {
    if (name !== LoopToolkits.toolName || typeof args.name !== "string") return null;
    const kit = this.#kits.get(args.name);
    if (!kit?.asked || this.#isOpen(args.name) || !this.#toolsOf(args.name).length) return null;
    return {
      name,
      description: `Opens the "${args.name}" toolkit: ${kit.description}`,
      readOnly: false,
      needsConfirm: true,
    };
  }

  async answer(call: AgentWireToolCall): Promise<AgentWireToolResult> {
    return call.name === LoopToolSearch.toolName ? await this.#find(call) : this.open(call);
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
    if (tools.some((tool) => this.#evicted.has(tool))) this.#close(kit);
    this.#load({ kind: "kit", name: kit });
    this.#budget.loaded(tools);
    const instructions = this.#kits.get(kit)?.instructions;
    return { id, name, result: { opened: kit, tools, ...(instructions ? { instructions } : {}) } };
  }

  async #find({ id, name, args }: AgentWireToolCall): Promise<AgentWireToolResult> {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!this.#search || !query) return { id, name, error: LoopToolSearch.noQuery, code: "invalidArgument" };
    const unlisted = this.#unlisted(this.#arrange().shown);
    const found = await this.#search.find(query, args.limit, unlisted);
    for (const tool of found) this.#load({ kind: "tool", name: tool });
    this.#budget.loaded(found);
    const tools = found.map((tool) => ({
      name: tool,
      description: unlisted.find((candidate) => candidate.name === tool)?.description ?? "",
    }));
    return { id, name, result: { tools } };
  }

  #unlisted(shown: readonly AgentTool[]): AgentTool[] {
    return this.#visible.filter((tool) => this.#findable(tool.name) && !shown.includes(tool));
  }

  //? Security: a tool only `asked` toolkits hold is found once one of them is open, or a run would list it past `approve`.
  #findable(name: string): boolean {
    for (const [kit, { tools, asked }] of this.#kits)
      if (tools.includes(name) && (!asked || this.#isOpen(kit))) return true;
    return false;
  }

  #loadFound(tool: string) {
    if (this.#findable(tool)) this.#load({ kind: "tool", name: tool });
  }

  //? Of each toolkit `listed` opens: the run never hears an `openToolkit` answer for it.
  pinnedInstructions(): string[] {
    return this.#pinned.flatMap(({ kind, name }) => {
      const instructions = kind === "kit" ? this.#kits.get(name)?.instructions : undefined;
      return instructions && this.#toolsOf(name).length ? [`Toolkit "${name}": ${instructions}`] : [];
    });
  }

  used(calls: readonly AgentWireToolCall[]) {
    this.#budget.called(calls.map((call) => call.name));
  }

  externalOf({ name, args }: AgentWireToolCall): string | null {
    return name === LoopToolkits.toolName && typeof args.name === "string" && this.#external.has(args.name)
      ? args.name
      : null;
  }

  openExternal({ id, name }: AgentWireToolCall, kit: string, tools: string[], omitted = 0): AgentWireToolResult {
    this.#load({ kind: "kit", name: kit });
    return { id, name, result: { opened: kit, tools, ...(omitted ? { omitted } : {}) } };
  }

  close(kit: string) {
    this.#close(kit);
  }

  //? A remote stays open: opening one again lists it from its server, and parks the run once that connection is gone.
  keepUsed(kept: readonly AgentWireMessage[]) {
    const calls = kept.flatMap((message) => message.toolCalls ?? []);
    const found = new Set(LoopToolkits.#foundIn(kept));
    for (const entry of [...this.#loaded.values()]) {
      if (entry.kind === "tool") {
        if (!found.has(entry.name) && !calls.some((call) => call.name === entry.name))
          this.#loaded.delete(LoopToolkits.#key(entry));
        continue;
      }
      const tools = this.#kits.get(entry.name)?.tools;
      if (!tools) continue;
      const opens = (call: AgentWireToolCall) => call.name === LoopToolkits.toolName && call.args.name === entry.name;
      if (!calls.some((call) => tools.includes(call.name) || opens(call))) this.#close(entry.name);
    }
  }

  static #foundIn(messages: readonly AgentWireMessage[]): string[] {
    return messages.flatMap((message) =>
      (message.toolResults ?? []).flatMap((result) => LoopToolkits.#foundBy(result)),
    );
  }

  static #foundBy(result: AgentWireToolResult): string[] {
    if (result.name !== LoopToolSearch.toolName || result.error) return [];
    const tools = (result.result as { tools?: unknown } | undefined)?.tools;
    if (!Array.isArray(tools)) return [];
    return tools.flatMap((tool) => (typeof tool?.name === "string" ? [tool.name as string] : []));
  }

  #inKit(name: string): boolean {
    for (const { tools } of this.#kits.values()) if (tools.includes(name)) return true;
    return false;
  }

  #toolsOf(kit: string): string[] {
    const tools = this.#kits.get(kit)?.tools ?? [];
    return this.#visible.filter((tool) => tools.includes(tool.name)).map((tool) => tool.name);
  }

  //? Every toolkit, open or not, so openToolkit reads the same on every round: a definition that changes between rounds
  //? is a new prompt to a provider's cache, and to Anthropic a new conversation for the thinking it kept.
  #offered(): string[] {
    const pinned = (kit: string) => this.#pinned.some((entry) => entry.kind === "kit" && entry.name === kit);
    return [
      ...[...this.#kits.keys()].filter((kit) => !pinned(kit) && this.#toolsOf(kit).length),
      ...this.#external.keys(),
    ];
  }

  //? A toolkit some of whose tools `toolBudget` took off the list is offered again, so they can be listed again.
  #closed(): string[] {
    const partial = (kit: string) => this.#toolsOf(kit).some((tool) => this.#evicted.has(tool));
    return [
      ...[...this.#kits.keys()].filter(
        (kit) => (!this.#isOpen(kit) || (this.#loaded.has(`kit:${kit}`) && partial(kit))) && this.#toolsOf(kit).length,
      ),
      ...[...this.#external.keys()].filter((kit) => !this.#isOpen(kit)),
    ];
  }

  #metaTool(offered: string[]): AgentTool {
    const lines = offered.map((kit) =>
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
        properties: { name: { type: "string", enum: offered } },
        required: ["name"],
        additionalProperties: false,
      },
      readOnly: true,
    };
  }

  //? A summary carries what the calls it replaced opened and found; a call opened its toolkit, or found its tools, only
  //? if its result is no error. Read in stored order, a result with the call it answers, so a remote a later call found
  //? disconnected is closed here as the run that stored it closed it. Security: `true` once any remote was opened, open
  //? still or not.
  restore(messages: readonly AgentWireMessage[]): boolean {
    if (!this.#any) return false;
    const calls = new Map(LoopTranscript.answered(messages));
    let reached = false;
    for (const message of messages) {
      if (message.summary) {
        for (const kit of message.toolkits ?? []) reached = this.#reopen(kit) || reached;
        for (const tool of this.#search ? (message.foundTools ?? []) : []) this.#loadFound(tool);
      }
      if (message.toolCalls?.length) this.used(message.toolCalls);
      for (const result of message.role === "tool" ? (message.toolResults ?? []) : []) {
        const call = calls.get(result);
        if (!call) continue;
        const kit = call.name === LoopToolkits.toolName ? call.args.name : null;
        if (typeof kit === "string" && !result.error) reached = this.#reopen(kit) || reached;
        for (const tool of this.#search ? LoopToolkits.#foundBy(result) : []) this.#loadFound(tool);
        if (result.code === LoopRemotes.disconnected) this.#close(this.#ownerOf(call.name) ?? "");
      }
    }
    return reached;
  }

  #reopen(kit: string): boolean {
    if (!this.#has(kit)) return false;
    this.#load({ kind: "kit", name: kit });
    return this.#external.has(kit);
  }

  #load(entry: Loaded) {
    const key = LoopToolkits.#key(entry);
    if (!this.#loaded.has(key)) this.#loaded.set(key, entry);
  }

  #close(kit: string) {
    this.#loaded.delete(`kit:${kit}`);
    for (const tool of this.#kits.get(kit)?.tools ?? []) this.#evicted.delete(tool);
  }

  #isOpen(kit: string): boolean {
    return this.#loaded.has(`kit:${kit}`) || this.#pinned.some((entry) => entry.kind === "kit" && entry.name === kit);
  }

  #names(kind: Loaded["kind"]): string[] {
    return [...this.#loaded.values()].filter((entry) => entry.kind === kind).map((entry) => entry.name);
  }

  static #key({ kind, name }: Loaded): string {
    return `${kind}:${name}`;
  }

  #ownerOf(toolName: string): string | undefined {
    return [...this.#external.keys()].find((kit) => toolName.startsWith(`${kit}.`));
  }

  #has(kit: string): boolean {
    return this.#kits.has(kit) || this.#external.has(kit);
  }
}
