import type {
  AgentCall,
  PublishedResource,
  PublishedTool,
  ResourceDiff,
  ResourceEntry,
  ScopeEntry,
  SurfaceSnapshot,
  SurfaceSource,
  SurfaceView,
  ToolEntry,
} from "./types";

const SHARED_KEY = Symbol.for("useAgentic.sharedSurface");

/**
 * The live registry of what the mounted screen offers an agent: tools, readable resources, and scopes.
 *
 * Entries come and go with component lifetimes, so unlike a static catalogue this is subscribable and every
 * snapshot answers "now". A registration stack backs each name — remounts are ordinary React behavior, so a
 * duplicate name warns and the newest wins instead of throwing, and unregistering restores what it shadowed.
 */
export class AgenticSurface {
  /** One surface per runtime unless a provider isolates its own. Keyed on `globalThis` so duplicated module copies still meet. */
  static get shared(): AgenticSurface {
    const holder = globalThis as typeof globalThis & { [SHARED_KEY]?: AgenticSurface };
    holder[SHARED_KEY] ??= new AgenticSurface();
    return holder[SHARED_KEY];
  }

  /** MCP tool names allow `[A-Za-z0-9_.-]`, and `.` is the scope join — so every part is folded into `[A-Za-z0-9_-]`. */
  static sanitize(part: string) {
    return part.replace(/[^A-Za-z0-9_-]/g, "-");
  }

  static childPath(parent: string[], id: string) {
    return [...parent, AgenticSurface.sanitize(id)];
  }

  static fullName(scope: string[], name: string) {
    return [...scope.map((part) => AgenticSurface.sanitize(part)), AgenticSurface.sanitize(name)].join(".");
  }

  #tools = new Map<string, ToolEntry[]>();
  #resources = new Map<string, ResourceEntry[]>();
  #scopes = new Map<string, ScopeEntry[]>();
  #guides: { scope: string; text: string }[] = [];
  readonly #calls: AgentCall[] = [];
  #sources = new Set<SurfaceSource>();
  #listeners = new Set<() => void>();
  #warned = new Set<string>();

  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * A row component registers the same name once per row, which is legal when the tool takes the row's id as an
   * argument rather than closing over it: every registration is then interchangeable and last-wins picks an
   * equivalent one. The description is what says so — two registrations that describe the same action to a model
   * are the same declaration twice, and fifty rows are one entry rather than fifty collisions. Two that describe
   * different actions under one name are a real clash whichever of them mounted last, and warn.
   */
  registerTool(scope: string[], entry: ToolEntry) {
    const key = AgenticSurface.fullName(scope, entry.name);
    const stack = this.#tools.get(key);
    const interchangeable = !stack?.length || stack[stack.length - 1].description === entry.description;
    return this.#stack(
      this.#tools,
      key,
      entry,
      interchangeable ? null : "is registered by two declarations that describe it differently",
    );
  }

  registerResource(scope: string[], entry: ResourceEntry) {
    return this.#stack(this.#resources, AgenticSurface.fullName(scope, entry.name), entry);
  }

  openScope(parent: string[], scope: ScopeEntry) {
    return this.#stack(this.#scopes, AgenticSurface.childPath(parent, scope.id).join("."), scope);
  }

  /**
   * Standing guidance for the agent while the registrant is mounted — instructions, not context data. Kept in
   * registration order rather than sorted: guides are prose, and each one must stay a coherent block.
   */
  registerGuide(scope: string[], text: string) {
    const entry = { scope: scope.join("."), text };
    this.#guides.push(entry);
    this.#notify();
    return () => {
      const idx = this.#guides.indexOf(entry);
      if (idx >= 0) this.#guides.splice(idx, 1);
      this.#notify();
    };
  }

  addSource(source: SurfaceSource) {
    this.#sources.add(source);
    const unsubscribe = source.subscribe?.(() => this.#notify());
    this.#notify();
    return () => {
      this.#sources.delete(source);
      unsubscribe?.();
      this.#notify();
    };
  }

  snapshot(view: string[] = []): SurfaceSnapshot {
    const viewKey = view.join(".");
    const tools = [...this.#activeTools(view)].map(([name, entry]) => AgenticSurface.#publishTool(name, entry));
    const resources = [...this.#activeResources(view)].map(([name, entry]) =>
      AgenticSurface.#publishResource(name, entry),
    );
    const scopes = [...this.#scopes.entries()]
      .filter(([path]) => AgenticSurface.#within(viewKey, path))
      .map(([path, stack]) => {
        const scope = stack[stack.length - 1];
        return { path, ...(scope.label ? { label: scope.label } : {}), ...(scope.kind ? { kind: scope.kind } : {}) };
      });
    // Sorted so the published order never depends on mount order — clients and prompt caches key on the exact text.
    return {
      tools: tools.sort((a, b) => (a.name < b.name ? -1 : 1)),
      resources: resources.sort((a, b) => (a.name < b.name ? -1 : 1)),
      scopes: scopes.sort((a, b) => (a.path < b.path ? -1 : 1)),
      guides: this.#guides.filter((guide) => AgenticSurface.#guideApplies(viewKey, guide.scope)).map((g) => g.text),
    };
  }

  /**
   * A zone session's reading half: the same registry filtered to one scope subtree. Hook entries filter by their
   * scope-prefixed name, sources decide for themselves per view, and guides follow the layout cascade — a zone
   * reads its ancestors' guidance plus its own, never a sibling's. The empty path is the surface itself.
   */
  view(path: string[]): SurfaceView {
    if (!path.length) return this;
    return {
      snapshot: () => this.snapshot(path),
      tool: (name) => this.tool(name, path),
      call: (name, args) => this.call(name, args, path),
      read: (name) => this.read(name, path),
      diffSince: (before) => this.diffSince(before, path),
      subscribe: (listener) => this.subscribe(listener),
    };
  }

  tool(name: string, view: string[] = []): ToolEntry | null {
    const viewKey = view.join(".");
    const stack = this.#tools.get(name);
    if (stack?.length && AgenticSurface.#within(viewKey, name)) return stack[stack.length - 1];
    for (const source of this.#sources) {
      const found = source.tools?.(view).find((candidate) => candidate.name === name);
      if (found) return found;
    }
    return null;
  }

  /**
   * Whether a *mounted component* declares this name — a source's contribution answers `false`. The distinction is
   * what lets a host drop the built-in tools without dropping a screen's own tool that deliberately shadows one.
   */
  declares(name: string, view: string[] = []): boolean {
    const stack = this.#tools.get(name);
    return !!stack?.length && AgenticSurface.#within(view.join("."), name);
  }

  /** Every call made through this surface, oldest first. What the dock shows the user to check against the screen. */
  get transcript(): readonly AgentCall[] {
    return this.#calls;
  }

  async call(name: string, args: Record<string, unknown> = {}, view: string[] = []): Promise<unknown> {
    const entry = this.tool(name, view);
    if (!entry) throw new Error(`Unknown tool: ${name}`);
    // Recorded before the guard runs: an attempt that was refused is a thing the agent did, and leaving it out is
    // how a transcript starts to lie. Bounded, because a long-lived chat would otherwise hold every call ever made.
    const record: AgentCall = { name, args, at: new Date() };
    if (this.#calls.length >= 200) this.#calls.shift();
    this.#calls.push(record);
    try {
      const verdict = entry.guard?.(args) ?? true;
      if (verdict !== true) throw new Error(verdict);
      return await entry.run(args);
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  read(name: string, view: string[] = []): unknown {
    const entry = this.#resource(name, view);
    if (!entry) throw new Error(`Unknown resource: ${name}`);
    return entry.read();
  }

  /**
   * The resources that changed since `before`, for reporting a tool call's effect back to the model.
   *
   * Runs against the live entries rather than a second snapshot because `report: false` lives on the entry, and a
   * snapshot deliberately does not publish it.
   */
  diffSince(before: SurfaceSnapshot, view: string[] = []): ResourceDiff[] {
    const prev = new Map(before.resources.map((resource) => [resource.name, resource]));
    const diffs: ResourceDiff[] = [];
    const seen = new Set<string>();
    for (const [name, entry] of this.#activeResources(view)) {
      seen.add(name);
      if (entry.report === false) continue;
      const current = AgenticSurface.#publishResource(name, entry);
      const last = prev.get(name);
      if (
        last &&
        AgenticSurface.#print(last.value) === AgenticSurface.#print(current.value) &&
        last.error === current.error
      )
        continue;
      diffs.push({
        name,
        ...(current.value !== undefined ? { value: current.value } : {}),
        ...(current.error !== undefined ? { error: current.error } : {}),
      });
    }
    for (const name of prev.keys()) if (!seen.has(name)) diffs.push({ name, removed: true });
    return diffs;
  }

  *#activeTools(view: string[] = []): Generator<[string, ToolEntry]> {
    const viewKey = view.join(".");
    const seen = new Set<string>();
    for (const [name, stack] of this.#tools) {
      if (!AgenticSurface.#within(viewKey, name)) continue;
      seen.add(name);
      yield [name, stack[stack.length - 1]];
    }
    for (const source of this.#sources) {
      for (const entry of source.tools?.(view) ?? []) {
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
        yield [entry.name, entry];
      }
    }
  }

  *#activeResources(view: string[] = []): Generator<[string, ResourceEntry]> {
    const viewKey = view.join(".");
    const seen = new Set<string>();
    for (const [name, stack] of this.#resources) {
      if (!AgenticSurface.#within(viewKey, name)) continue;
      seen.add(name);
      yield [name, stack[stack.length - 1]];
    }
    for (const source of this.#sources) {
      for (const entry of source.resources?.(view) ?? []) {
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
        yield [entry.name, entry];
      }
    }
  }

  #resource(name: string, view: string[] = []): ResourceEntry | null {
    const viewKey = view.join(".");
    const stack = this.#resources.get(name);
    if (stack?.length && AgenticSurface.#within(viewKey, name)) return stack[stack.length - 1];
    for (const source of this.#sources) {
      const found = source.resources?.(view).find((candidate) => candidate.name === name);
      if (found) return found;
    }
    return null;
  }

  /** Empty view sees everything; a zone view sees the entries whose scope-prefixed key sits in its subtree. */
  static #within(viewKey: string, key: string) {
    return !viewKey || key === viewKey || key.startsWith(`${viewKey}.`);
  }

  /** The layout cascade: a guide applies to a view when one contains the other — ancestors and descendants, never siblings. */
  static #guideApplies(viewKey: string, scopeKey: string) {
    if (!viewKey || !scopeKey || viewKey === scopeKey) return true;
    return viewKey.startsWith(`${scopeKey}.`) || scopeKey.startsWith(`${viewKey}.`);
  }

  #stack<E>(map: Map<string, E[]>, key: string, entry: E, clash: string | null = "is registered more than once") {
    const stack = map.get(key) ?? [];
    if (stack.length && clash && !this.#warned.has(key)) {
      this.#warned.add(key);
      console.warn(`[use-agentic] "${key}" ${clash}; the newest registration wins.`);
    }
    stack.push(entry);
    map.set(key, stack);
    this.#notify();
    return () => {
      const idx = stack.indexOf(entry);
      if (idx >= 0) stack.splice(idx, 1);
      if (!stack.length) map.delete(key);
      this.#notify();
    };
  }

  #notify() {
    for (const listener of this.#listeners) listener();
  }

  static #publishTool(name: string, entry: ToolEntry): PublishedTool {
    return {
      name,
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.parameters ? { parameters: entry.parameters } : {}),
      needsConfirm: entry.confirm !== undefined && entry.confirm !== false,
    };
  }

  static #publishResource(name: string, entry: ResourceEntry): PublishedResource {
    const base = { name, ...(entry.description ? { description: entry.description } : {}) };
    try {
      return { ...base, value: entry.read() };
    } catch (error) {
      return { ...base, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Serialized equality, because a read may rebuild an equal object on every call. */
  static #print(value: unknown) {
    try {
      return JSON.stringify(value) ?? "undefined";
    } catch {
      return "[unserializable]";
    }
  }
}
