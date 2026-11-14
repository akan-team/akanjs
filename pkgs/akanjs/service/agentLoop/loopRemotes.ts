import type { AgentTool } from "../predefinedAdaptor/agentTools.adaptor";
import type { AgentWireToolCall, AgentWireToolResult } from "../predefinedAdaptor/llm.adaptor";
import type { AgentLoopRemote, AgentLoopView } from "./agentLoopTypes";

interface RemoteEntry {
  tool: AgentTool;
  real: string;
}

type Opened = { tools: string[]; omitted: number } | { error: string } | null;

export class LoopRemotes {
  static readonly namePattern = /^[a-z][A-Za-z0-9]{0,15}$/;
  //? `<remote>.<tool>` folds to `<remote>__<tool>` on the wire, which trims a name past 64 characters from the front.
  static readonly toolLimit = 46;
  static readonly descriptionLimit = 1_000;
  //? A remote's listing rides every later round, and its size is the remote's to choose: past these it is cut.
  static readonly maxTools = 120;
  static readonly schemaLimit = 8_000;
  static readonly listingLimit = 120_000;
  static readonly unavailable = "remoteUnavailable";
  /** A remote answers a call with this code once its connection is gone, so the run offers the toolkit again. */
  static readonly disconnected = "remoteDisconnected";
  static readonly #wireSafe = /^[A-Za-z0-9_-]+$/;

  readonly #remotes: ReadonlyMap<string, AgentLoopRemote>;
  readonly #tools = new Map<string, Map<string, RemoteEntry>>();
  readonly #views = new Map<string, AgentLoopView>();

  constructor(remotes: readonly AgentLoopRemote[] | undefined) {
    const valid = Array.isArray(remotes) ? remotes.filter((remote) => LoopRemotes.isValid(remote)) : [];
    this.#remotes = new Map(valid.map((remote) => [remote.name, remote]));
  }

  static isValid(remote: unknown): remote is AgentLoopRemote {
    const { name, description, list, call } = (remote ?? {}) as Record<string, unknown>;
    return (
      typeof name === "string" &&
      LoopRemotes.namePattern.test(name) &&
      typeof description === "string" &&
      typeof list === "function" &&
      typeof call === "function"
    );
  }

  get kits(): ReadonlyMap<string, string> {
    return new Map([...this.#remotes].map(([name, remote]) => [name, remote.description]));
  }

  ownerOf(toolName: string): string | null {
    const at = toolName.indexOf(".");
    const name = at > 0 ? toolName.slice(0, at) : "";
    return this.#remotes.has(name) ? name : null;
  }

  /** `null`: the account holds no live connection to it. */
  async open(name: string): Promise<Opened> {
    const remote = this.#remotes.get(name);
    if (!remote) return { error: `No remote named "${name}".` };
    try {
      const listed = await remote.list();
      if (listed === null) return null;
      const entries = LoopRemotes.#entriesOf(name, listed);
      this.#tools.set(name, entries);
      return { tools: [...entries.keys()], omitted: Math.max(0, listed.length - entries.size) };
    } catch (error) {
      return { error: `Could not reach "${name}": ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /** `lost`: opened earlier in the transcript, and no longer answering, so the toolkit closes until it is opened again. */
  async listed(opened: readonly string[]): Promise<{ tools: AgentTool[]; lost: string[] }> {
    const tools: AgentTool[] = [];
    const lost: string[] = [];
    for (const name of opened) {
      if (!this.#remotes.has(name)) continue;
      const answer = this.#tools.has(name) ? "known" : await this.open(name);
      const entries = this.#tools.get(name);
      if (answer === null || !entries) lost.push(name);
      else tools.push(...[...entries.values()].map((entry) => entry.tool));
    }
    return { tools, lost };
  }

  forget(name: string) {
    this.#tools.delete(name);
  }

  async call({ id, name, args }: AgentWireToolCall): Promise<AgentWireToolResult> {
    const owner = this.ownerOf(name);
    const remote = owner ? this.#remotes.get(owner) : undefined;
    const entry = owner ? this.#tools.get(owner)?.get(name) : undefined;
    if (!owner || !remote || !entry) return { id, name, error: `Unknown tool: ${name}.`, code: "unknownTool" };
    try {
      const { view, ...answer } = await remote.call(entry.real, args);
      const shown = LoopRemotes.#viewOf(view);
      if (shown) this.#views.set(id, { ...shown, remote: owner, tool: entry.real, args });
      return { ...answer, id, name };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { id, name, error: `"${owner}" did not answer: ${message}`, code: LoopRemotes.unavailable };
    }
  }

  takeView(id: string): AgentLoopView | undefined {
    const view = this.#views.get(id);
    this.#views.delete(id);
    return view;
  }

  //? Security: the remote wrote this object and a page draws from it, so only the declared fields pass, each by type.
  static #viewOf(view: unknown): Omit<AgentLoopView, "remote" | "tool" | "args"> | null {
    if (!view || typeof view !== "object") return null;
    const { href, static: drawn, resourceUri } = view as Record<string, unknown>;
    const known = {
      ...(typeof href === "string" ? { href } : {}),
      ...(typeof drawn === "boolean" ? { static: drawn } : {}),
      ...(typeof resourceUri === "string" ? { resourceUri } : {}),
    };
    return Object.keys(known).length ? known : null;
  }

  //? Security: a remote's annotations are its own claim, so a tool it does not call read-only needs a person.
  static #entriesOf(remote: string, listed: readonly AgentTool[]): Map<string, RemoteEntry> {
    const entries = new Map<string, RemoteEntry>();
    let room = LoopRemotes.listingLimit;
    for (const { name: real, description, parameters, readOnly } of listed) {
      if (entries.size >= LoopRemotes.maxTools) break;
      if (typeof real !== "string" || !real) continue;
      const name = `${remote}.${LoopRemotes.#aliasOf(real)}`;
      if (entries.has(name)) continue;
      const text = typeof description === "string" ? LoopRemotes.#clip(description) : "";
      const tool: AgentTool = {
        name,
        ...(text ? { description: text } : {}),
        ...(parameters && typeof parameters === "object" ? { parameters: LoopRemotes.#schemaOf(parameters) } : {}),
        readOnly: readOnly === true,
        needsConfirm: readOnly !== true,
      };
      room -= JSON.stringify(tool).length;
      if (room < 0) break;
      entries.set(name, { tool, real });
    }
    return entries;
  }

  static #schemaOf(parameters: Record<string, unknown>): Record<string, unknown> {
    const size = JSON.stringify(parameters)?.length ?? 0;
    return size <= LoopRemotes.schemaLimit ? parameters : { type: "object", additionalProperties: true };
  }

  static #aliasOf(real: string): string {
    if (real.length <= LoopRemotes.toolLimit && LoopRemotes.#wireSafe.test(real)) return real;
    const suffix = `-${LoopRemotes.#hash(real)}`;
    return `${real.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, LoopRemotes.toolLimit - suffix.length)}${suffix}`;
  }

  //? FNV-1a: only tells two long names apart in one listing, so it needs no more than to be stable.
  static #hash(text: string): string {
    let hash = 0x811c9dc5;
    for (let at = 0; at < text.length; at += 1) hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193);
    return (hash >>> 0).toString(36).padStart(7, "0");
  }

  static #clip(text: string): string {
    return text.length <= LoopRemotes.descriptionLimit ? text : `${text.slice(0, LoopRemotes.descriptionLimit)}…`;
  }
}
