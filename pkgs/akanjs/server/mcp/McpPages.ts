import type { Logger } from "akanjs/common";
import { MCP_APP_META, MCP_META_CLIENT_CAPABILITIES, type McpDocument, type McpEra } from "../../signal/mcp";
import type { PromptMessage } from "../../signal/mcp/Msg";
import type { McpPrompt } from "../../signal/mcp/mcpProtocol";
import type { PagePromptEntry, PagePromptRun, PagePromptSource } from "../../signal/mcp/pagePrompt";
import { McpApps } from "./McpApps";
import { McpAuthRequiredError, type McpDispatcher } from "./McpDispatcher";
import type { McpUiSession } from "./McpUiSession";
import { PagePromptComposer } from "./PagePromptComposer";

export interface McpPagesProps {
  source?: PagePromptSource;
  apps: McpApps | null;
  sessions: McpUiSession;
  dispatcher: McpDispatcher;
  document: () => McpDocument;
  publicOrigin: (req: Request) => string;
  logger: Logger;
  promptBudget?: number;
  language?: string;
  readOnly?: boolean;
}

interface McpPageCall {
  params: Record<string, unknown>;
  req: Request;
  ui: boolean;
}

export type McpPageRun =
  | { badArguments: true }
  | { refusal: string }
  | { run: Extract<PagePromptRun, { ok: true }> | null; messages: PromptMessage[] };

export class McpPages {
  static readonly listWaitMs = 1_000;
  static readonly verdictTtlMs = 5_000;
  static readonly #keptVerdicts = 256;

  readonly #props: McpPagesProps;
  #listed: PagePromptEntry[] | null = null;
  #listFailed = false;
  #guardsFailed = false;
  readonly #verdicts = new Map<string, { at: number; names: Promise<string[] | null> }>();

  constructor(props: McpPagesProps) {
    this.#props = props;
  }

  /** `null` until the worker has answered a listing. */
  get listed() {
    return this.#listed;
  }

  report() {
    if (!this.#props.source) return;
    const { logger } = this.#props;
    void this.#list()
      .then((entries) => {
        const names = entries.map((entry) => entry.name).join(", ");
        logger.debug(`MCP page prompts: ${entries.length}${entries.length ? ` (${names})` : ""}`);
        const apps = this.#props.apps;
        if (!apps || !entries.length) return;
        for (const { kind, name } of entries.filter((entry) => this.#isEndpointName(entry.name)))
          logger.warn(
            kind === "app"
              ? `MCP did not publish app "${name}": an endpoint already takes that name. Rename the app.`
              : `MCP did not publish page "${name}" as a tool: an endpoint already takes that name, so it stays a prompt only. Rename the prompt.`,
          );
        const appCount = entries.filter((entry) => entry.kind === "app").length;
        const ui = apps.rendersUi ? "each drawn by its own view in an MCP Apps host" : "with no view to draw them";
        if (appCount) logger.debug(`MCP apps: ${appCount}, ${ui}`);
      })
      .catch((error: unknown) => {
        logger.warn(`MCP page prompts could not be listed: ${error instanceof Error ? error.message : error}`);
      });
  }

  async prompts(req: Request): Promise<McpPrompt[]> {
    const listed = await this.#list();
    const prompts = listed.filter((entry) => entry.kind === "prompt");
    return (await this.#visibleTo(req, prompts, listed)).map(McpPages.#promptOf);
  }

  async entry(name: string) {
    return (await this.#list()).find((candidate) => candidate.name === name);
  }

  async prompt(name: string) {
    const entry = await this.entry(name);
    return entry?.kind === "prompt" ? entry : undefined;
  }

  // A refused screen is a tool error, which the model reads, as an endpoint's refusal is; a prompt's is a JSON-RPC one.
  async toolCall(
    call: McpPageCall,
    document: McpDocument,
    entry: PagePromptEntry,
    args: Record<string, unknown> | null,
  ): Promise<{ badArguments: true } | { result: object }> {
    const apps = this.#props.apps;
    const page = await this.run(call, document, entry, args);
    if ("badArguments" in page) return page;
    if ("refusal" in page) return { result: { content: [{ type: "text", text: page.refusal }], isError: true } };
    if (!page.run || !apps) return { result: { content: page.messages.map((message) => message.content) } };
    const origin = this.#props.publicOrigin(call.req);
    const forView = call.ui ? { account: McpApps.accountOf(call.req) } : null;
    return { result: apps.resultOf(entry, page.run, page.messages, origin, forView) };
  }

  async run(
    call: McpPageCall,
    document: McpDocument,
    entry: PagePromptEntry,
    args: Record<string, unknown> | null,
  ): Promise<McpPageRun> {
    const source = this.#props.source;
    const { name } = entry;
    if (!source) return { refusal: `Unknown prompt: ${name}.` };
    const strings = args ? McpPages.#pageArguments(args) : null;
    if (!strings) return { badArguments: true };
    const composer = new PagePromptComposer({
      document,
      budget: this.#props.promptBudget ?? PagePromptComposer.defaultBudget,
      visibleTools: async (names) =>
        (
          await this.#props.dispatcher.filterForAccount(
            names.map((tool) => ({ name: tool })),
            call.req,
          )
        ).map((tool) => tool.name),
    });
    const missing = entry.arguments
      .filter((arg) => arg.required && strings[arg.name] === undefined)
      .map((arg) => arg.name);
    if (missing.length) return { run: null, messages: composer.missing(entry, missing) };
    const run = await source.run({
      name,
      arguments: strings,
      headers: McpPages.#forwardedHeaders(call.req),
      language: this.#props.language,
    });
    if (!run.ok) {
      // A redirect or a guard's 401/403: no credential gets the auth challenge; with one, a bare refusal that never
      // confirms an id exists.
      const gated = run.reason === "redirect" || run.reason === "forbidden";
      if (gated && !call.req.headers.get("authorization")) throw new McpAuthRequiredError();
      if (run.reason === "error") this.#props.logger.warn(`page prompt "${name}" failed: ${run.message}`);
      const message =
        run.reason === "argument" || run.reason === "unknown"
          ? run.message
          : gated
            ? "This screen is not available to the signed-in account."
            : run.reason === "not-found"
              ? "No screen exists for these arguments."
              : "The page failed to load.";
      return { refusal: message };
    }
    return { run, messages: await composer.compose(entry, run) };
  }

  // Security: a list failure reads as an unknown tool, as a hidden endpoint's name does; an error for this name alone
  // would tell which names the endpoints hold.
  async toolOf(name: unknown) {
    if (!this.#props.apps || typeof name !== "string" || this.#isEndpointName(name)) return undefined;
    const entry = await this.entry(name).catch(() => undefined);
    return entry && this.#publishesTool(entry) ? entry : undefined;
  }

  async tools(ui: boolean, document: McpDocument, req: Request) {
    const apps = this.#props.apps;
    if (!apps) return [];
    const listed = await this.#listedPages();
    const pages = (await this.#visibleTo(req, this.#pageToolsOf(listed), listed)).map((entry) => apps.toolOf(entry));
    return ui ? [...document.appTools, ...pages] : pages;
  }

  // Listed only to a client that renders them: any other would offer a megabyte HTML document as an attachment. The same
  // apps `tools/list` shows this caller, so a hidden app's name and description stay hidden here too.
  async resources(ui: boolean, req: Request) {
    const apps = this.#props.apps;
    if (!apps?.rendersUi || !ui) return [];
    const listed = await this.#listedPages();
    return apps.resourcesOf(await this.#visibleTo(req, this.#pageToolsOf(listed), listed));
  }

  // Not a credential: visibility is a host's UX, never authorization, so a client claiming the extension falsely gains
  // a listing and nothing its guards would not already let it call.
  async uiCapable(era: McpEra, meta: Record<string, unknown> | null, req: Request) {
    if (!this.#props.apps?.rendersUi) return false;
    if (era === "modern") return McpApps.declaresUi(meta?.[MCP_META_CLIENT_CAPABILITIES]);
    return await this.#props.sessions.issued(req.headers.get("mcp-session-id"));
  }

  // Asked for by the view's own bridge; a model's call never carries it.
  forView(ui: boolean, meta: Record<string, unknown> | null) {
    return ui && meta?.[MCP_APP_META.view] === true;
  }

  async uiSession(capabilities: unknown): Promise<Record<string, string> | undefined> {
    if (!this.#props.apps?.rendersUi || !McpApps.declaresUi(capabilities)) return undefined;
    const id = await this.#props.sessions.mint();
    return id ? { "mcp-session-id": id } : undefined;
  }

  static #promptOf({ name, description, arguments: args }: PagePromptEntry): McpPrompt {
    return { name, description, ...(args.length ? { arguments: args } : {}) };
  }

  // Only the credential travels into the page run: the page decides with it exactly as a browser tab would.
  static #forwardedHeaders(req: Request): [string, string][] {
    const authorization = req.headers.get("authorization");
    return authorization ? [["authorization", authorization]] : [];
  }

  // A model fills a tool's optional field with `null`, which `String` would hand the page as the word "null". A list is
  // comma-separated on the prompt wire, so an array of plain values is joined into that.
  static #pageArguments(args: Record<string, unknown>): Record<string, string> | null {
    const strings: Record<string, string> = {};
    const plain = (value: unknown) => ["string", "number", "boolean"].includes(typeof value);
    for (const [key, value] of Object.entries(args)) {
      if (value === null || value === undefined) continue;
      if (plain(value)) strings[key] = String(value);
      else if (Array.isArray(value) && value.every(plain)) strings[key] = value.join(",");
      else return null;
    }
    return strings;
  }

  async #list(): Promise<PagePromptEntry[]> {
    const source = this.#props.source;
    if (!source) return [];
    const entries = await source.list();
    this.#listed = entries;
    return entries;
  }

  // A listing never waits out the RSC worker, which queues the call while it (re)starts: the pages it listed last stand
  // in. A stopped worker leaves them out.
  async #listedPages(): Promise<PagePromptEntry[]> {
    return (await McpPages.#withinListWait(this.#pagesOrNone())) ?? this.#listed ?? [];
  }

  // Route guards decide which screens a caller is shown, never what data it reaches: a call runs them again and the
  // signal guards hold the data. So a verdict the worker cannot give in time lists the pages unfiltered, as the
  // listing itself falls back to the pages listed last.
  async #visibleTo(req: Request, entries: PagePromptEntry[], listed: PagePromptEntry[]): Promise<PagePromptEntry[]> {
    if (!this.#props.source || !entries.length) return entries;
    //? Asked over every listed page, so the prompts, tools and resources a host lists in a row share one verdict.
    const names = await McpPages.#withinListWait(this.#verdictOf(req, listed));
    if (!names) return entries;
    const admitted = new Set(names);
    return entries.filter((entry) => admitted.has(entry.name));
  }

  //? A client listing in a loop would run every guard chain, queries and all, on each listing; a verdict stands a few
  //? seconds per credential, and a call runs the guards again whatever the listing said.
  #verdictOf(req: Request, entries: PagePromptEntry[]): Promise<string[] | null> {
    const headers = McpPages.#forwardedHeaders(req);
    const names = entries.map((entry) => entry.name);
    const key = JSON.stringify([headers, names]);
    const now = Date.now();
    const kept = this.#verdicts.get(key);
    if (kept && now - kept.at < McpPages.verdictTtlMs) return kept.names;
    const source = this.#props.source;
    const verdict = (
      source ? source.visible({ names, headers, language: this.#props.language }) : Promise.resolve(names)
    )
      .then((visible) => {
        this.#guardsFailed = false;
        return visible;
      })
      .catch((error: unknown) => {
        if (this.#verdicts.get(key)?.names === verdict) this.#verdicts.delete(key);
        if (!this.#guardsFailed)
          this.#props.logger.warn(
            `MCP could not run the route guards of its page prompts, so they are listed unfiltered: ${error instanceof Error ? error.message : error}`,
          );
        this.#guardsFailed = true;
        return null;
      });
    this.#verdicts.delete(key);
    this.#verdicts.set(key, { at: now, names: verdict });
    for (const [oldest, { at }] of this.#verdicts) {
      if (this.#verdicts.size <= McpPages.#keptVerdicts && now - at < McpPages.verdictTtlMs) break;
      this.#verdicts.delete(oldest);
    }
    return verdict;
  }

  static async #withinListWait<T>(work: Promise<T>): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), McpPages.listWaitMs);
    });
    try {
      return await Promise.race([work, stalled]);
    } finally {
      clearTimeout(timer);
    }
  }

  async #pagesOrNone(): Promise<PagePromptEntry[]> {
    try {
      const entries = await this.#list();
      this.#listFailed = false;
      return entries;
    } catch (error) {
      if (!this.#listFailed)
        this.#props.logger.warn(
          `MCP page prompts could not be listed, so they are left out: ${error instanceof Error ? error.message : error}`,
        );
      this.#listFailed = true;
      return [];
    }
  }

  // Any endpoint keeps its name, published or not: a listing filters a name by that endpoint's guards.
  #isEndpointName(name: string) {
    return !!this.#props.document().findTool(name) || this.#props.dispatcher.isEndpoint(name);
  }

  #pageToolsOf(listed: PagePromptEntry[]) {
    if (!this.#props.apps) return [];
    return listed.filter((entry) => !this.#isEndpointName(entry.name) && this.#publishesTool(entry));
  }

  // A read-only deployment keeps the apps, whose load may only query, and drops a prompt's text tool, whose run renders
  // the whole page and may write; the prompt itself stays, as a person runs it.
  #publishesTool(entry: PagePromptEntry) {
    return entry.kind === "app" || !this.#props.readOnly;
  }
}
