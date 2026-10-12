import { type BackendEnv, getEnv } from "akanjs/base";
import { Logger } from "akanjs/common";
import { DictionaryLookup } from "akanjs/dictionary";
import { CacheAdaptorRole, type InjectRegistry, type LiveRegistry } from "akanjs/service";
import {
  MCP_LEGACY_VERSION,
  MCP_META_CLIENT_CAPABILITIES,
  MCP_META_PROTOCOL_VERSION,
  MCP_META_SERVER_INFO,
  MCP_MODERN_VERSION,
  MCP_SUPPORTED_VERSIONS,
  MCP_UI_EXTENSION,
  McpDocument,
  type McpEra,
  McpErrorCode,
  type McpExposedEndpoint,
  type McpJsonRpcRequest,
  type McpOutputSchemaMode,
  McpProgress,
  type McpProtocolVersion,
  type McpSignalCost,
  type McpToolResult,
} from "../../signal/mcp";
import type { PromptMessage } from "../../signal/mcp/Msg";
import type { McpPrompt } from "../../signal/mcp/mcpProtocol";
import type { PagePromptEntry, PagePromptRun, PagePromptSource } from "../../signal/mcp/pagePrompt";
import type { MiddlewareCls } from "../../signal/middleware";
import { FetchSerializer } from "../../signal/serializer";
import type { HttpRoutes } from "../types";
import { type McpAppShellSource, McpApps } from "./McpApps";
import { McpAuth, type McpAuthOption } from "./McpAuth";
import { McpAuthRequiredError, McpDispatcher } from "./McpDispatcher";
import { McpEventStream } from "./McpEventStream";
import { McpRateLimiter, type McpRateLimitOption, type McpSharedCounter } from "./McpRateLimiter";
import { PagePromptComposer } from "./PagePromptComposer";

export interface McpRouterProps {
  registry: InjectRegistry;
  env: BackendEnv;
  live: LiveRegistry;
  middleware: Map<string, MiddlewareCls>;
  path?: string;
  version?: string;
  instructions?: string;
  allowedOrigins?: string[];
  readOnly?: boolean;
  pageSize?: number;
  language?: string;
  legacyTextBlock?: boolean;
  pagePrompts?: PagePromptSource;
  promptBudget?: number;
  outputSchema?: McpOutputSchemaMode;
  auth?: McpAuthOption;
  rateLimit?: McpRateLimitOption | false;
  apps?: boolean;
  appShell?: McpAppShellSource;
  modern?: boolean;
}

interface McpCall {
  id: string | number | null;
  method: string;
  params: Record<string, unknown>;
  era: McpEra;
  req: Request;
}

interface McpErrorOptions {
  status?: number;
  data?: unknown;
  headers?: Record<string, string>;
}

type McpPageRun = { refusal: string } | { run: Extract<PagePromptRun, { ok: true }> | null; messages: PromptMessage[] };

interface McpCacheHint {
  ttlMs: number;
  cacheScope: "public" | "private";
}

const notAllowed = () => new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
const defaultPageSize = 100;
// Explicit: `DictionaryLookup`'s own fallback is whichever language happened to register first.
const defaultLanguage = "en";
// `private`: the listing is filtered per credential, so a shared cache would hand one caller another's view.
const listCache: McpCacheHint = { ttlMs: 300_000, cacheScope: "private" };
// Capabilities do not vary by caller and change only with the binary.
const discoverCache: McpCacheHint = { ttlMs: 3_600_000, cacheScope: "public" };

// Stateless in both eras. The one session a legacy client is issued stores nothing: its id carries the UI capability
// the client declared at `initialize`, which no later legacy request repeats.
export class McpRouter {
  static readonly logger = new Logger("McpRouter");
  static readonly listingWarnBytes = 1000 * 1024;

  readonly #props: McpRouterProps;
  readonly #dispatcher: McpDispatcher;
  readonly #auth: McpAuth;
  readonly #limiter: McpRateLimiter | null;
  readonly #apps: McpApps | null;
  readonly #versions: readonly McpProtocolVersion[];
  #document: McpDocument | null = null;
  #pageListFailed = false;

  constructor(props: McpRouterProps) {
    this.#props = props;
    // Clients validate `structuredContent` only against a declared `outputSchema`, so with none the text block stays.
    const legacyTextBlock = props.outputSchema === "none" ? undefined : props.legacyTextBlock;
    // Resolved here so a call's domain error reads in the language its tool was described in.
    this.#dispatcher = new McpDispatcher({ ...props, legacyTextBlock, language: props.language ?? defaultLanguage });
    this.#auth = new McpAuth({ ...props.auth, path: props.path ?? "/mcp" });
    this.#apps = props.apps && props.pagePrompts ? new McpApps(props.appShell ?? null) : null;
    // claude.ai renders a view only for a server it reached through `initialize`; over `server/discover` it reads the
    // resource and never mounts it. Refusing discovery is what sends a modern client down that path.
    const modern = props.modern ?? !this.#apps?.rendersUi;
    this.#versions = modern ? MCP_SUPPORTED_VERSIONS : MCP_SUPPORTED_VERSIONS.filter((v) => v !== MCP_MODERN_VERSION);
    this.#limiter =
      props.rateLimit === false
        ? null
        : new McpRateLimiter(
            props.rateLimit,
            (props.registry.adaptor.get(CacheAdaptorRole) as McpSharedCounter | undefined) ?? null,
          );
  }

  createRoutes(): HttpRoutes {
    return {
      [this.#props.path ?? "/mcp"]: {
        POST: async (req: Request) => this.#cors(req, await this.#post(req)),
        OPTIONS: (req: Request) => this.#preflight(req),
        // No server stream in either era, and the one session stores nothing to end; still CORS-labelled so a browser can
        // tell 405 from a refusal.
        GET: (req: Request) => this.#cors(req, notAllowed()),
        DELETE: (req: Request) => this.#cors(req, notAllowed()),
      },
      ...this.#auth.createRoutes(),
    };
  }

  // The only place a refusal is explained: it turns on resolved types and guards, which no source scan can read.
  // Called by the mounter, not `createRoutes`, so a router built for one request (tests, tooling) logs nothing.
  report() {
    try {
      const document = this.#getDocument();
      const { tools, resourceTemplates, refusals, undescribed } = document;
      const cost = document.listingCost;
      const appTools = document.appTools.length ? ` appTools=${document.appTools.length}` : "";
      const counts = `tools=${tools.length}${appTools} resourceTemplates=${resourceTemplates.length}`;
      const readOnly = this.#props.readOnly ? " (read-only deployment)" : "";
      McpRouter.logger.debug(`MCP catalogue: ${counts}${readOnly} · listing ${McpRouter.#kb(cost.bytes)}`);
      if (cost.bySignal.length) McpRouter.logger.debug(`MCP catalogue cost: ${McpRouter.#costLine(cost.bySignal)}`);
      if (this.#limiter) McpRouter.logger.debug(`MCP rate limit: ${this.#limiter.describe()}`);
      else McpRouter.logger.warn("MCP rate limit is off: an authenticated agent may call tools as fast as it likes.");
      if (cost.bytes > McpRouter.listingWarnBytes)
        McpRouter.logger.warn(
          `MCP listing is ${McpRouter.#kb(cost.bytes)}, which every agent that connects pays before its first turn. Narrow it with \`mcp: false\` on an endpoint or the \`mcp\` map on \`slice()\`.`,
        );
      if (this.#props.outputSchema === "none" && this.#props.legacyTextBlock === false)
        McpRouter.logger.warn(
          '`outputSchema: "none"` keeps the text block on: a client reads `structuredContent` only against a declared schema, so `legacyTextBlock: false` would hand it nothing.',
        );
      if (!tools.length)
        McpRouter.logger.warn(
          "MCP is enabled but published nothing. Every candidate was refused; see the reasons below.",
        );
      this.#reportPagePrompts();
      this.#reportUnverifiable(tools.map((tool) => tool.name));
      for (const { key, reason } of refusals) McpRouter.logger.verbose(`MCP did not expose "${key}": ${reason}`);
      for (const { name } of document.appTools)
        McpRouter.logger.verbose(
          `MCP kept "${name}" for the views an MCP Apps host renders: it declares \`mcp: false\`, so no model is shown it.`,
        );
      for (const { key, reason } of undescribed)
        McpRouter.logger.warn(`MCP exposed "${key}" with no description: ${reason}`);
    } catch (error) {
      // Must not stop the boot; nothing was cached, so the first request rebuilds the catalogue and raises it.
      McpRouter.logger.warn(
        `MCP catalogue could not be built at boot: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  // Security: without `auth` no client can obtain a token for a guarded tool, and a forged one reads as anonymous.
  #reportUnverifiable(toolNames: string[]) {
    const { verify, authorizationServers } = this.#props.auth ?? {};
    if (verify || authorizationServers?.length) return;
    const document = this.#getDocument();
    const guarded = toolNames.filter((name) =>
      (document.findTool(name)?.endpoint.guards ?? []).some((guard) => guard !== "Public"),
    ).length;
    if (!guarded) return;
    const line = `MCP publishes ${guarded} guarded tool(s) but no authorization server is configured: a client cannot obtain a token for them, and a bearer token's signature is not checked here. Set \`auth.verify\` and \`auth.authorizationServers\` through option.setMcp (a module that issues tokens does this), or AKAN_MCP_AUTH_SERVERS.`;
    if (getEnv().operationMode === "local") McpRouter.logger.warn(line);
    else McpRouter.logger.error(line);
  }

  static #kb(bytes: number) {
    return bytes < 1024 ? `${bytes}B` : `${Math.round(bytes / 1024)}KB`;
  }

  static #costLine(bySignal: McpSignalCost[]) {
    const shown = bySignal.slice(0, 8);
    const rest = bySignal.length - shown.length;
    const line = shown
      .map(({ refName, entries, bytes }) => `${refName} ${entries}/${McpRouter.#kb(bytes)}`)
      .join(" · ");
    return rest > 0 ? `${line} · +${rest} more` : line;
  }

  #getDocument() {
    if (this.#document) return this.#document;
    const lookup = new DictionaryLookup(this.#props.language ?? defaultLanguage);
    this.#document = new McpDocument(FetchSerializer.serializeRegistry(this.#props.live).signal, {
      resolveDescription: (key) => lookup.text(key),
      readOnly: this.#props.readOnly,
      outputSchema: this.#props.outputSchema,
      apps: !!this.#apps?.rendersUi,
    });
    return this.#document;
  }

  async #post(req: Request) {
    if (!this.#originAllowed(req)) return new Response("Forbidden", { status: 403 });
    // Security: the spec's only credential is `Authorization`; an ambient cookie would let a same-site page drive
    // tools/call past `CrossSiteGuard`. Deleted in place so the `BunRequest` keeps its peer address.
    req.headers.delete("cookie");
    const rejected = this.#auth.challengeAnonymous(req) ?? (await this.#auth.reject(req));
    if (rejected) return rejected;
    let body: McpJsonRpcRequest;
    try {
      body = (await req.json()) as McpJsonRpcRequest;
    } catch {
      return McpRouter.#error(null, McpErrorCode.parse, "Invalid JSON body.", { status: 400 });
    }
    const id = body.id ?? null;
    const method = body.method;
    if (typeof method !== "string")
      return McpRouter.#error(id, McpErrorCode.invalidRequest, "Missing JSON-RPC method.", { status: 400 });
    // A notification carries no id and expects no body back.
    if (method.startsWith("notifications/")) return new Response(null, { status: 202 });

    const params = (body.params ?? {}) as Record<string, unknown>;
    // Keyed on the modern version key, not on `_meta` itself: legacy `_meta` exists too (it carries `progressToken`).
    const meta = McpRouter.#meta(params);
    const era: McpEra = method !== "initialize" && meta && MCP_META_PROTOCOL_VERSION in meta ? "modern" : "legacy";
    const discoverable = method !== "server/discover" || this.#versions.includes(MCP_MODERN_VERSION);
    const rejection =
      era === "modern" && discoverable ? this.#validateModern(req, method, params, meta ?? {}, id) : null;
    if (rejection) return rejection;

    const started = Date.now();
    try {
      const call = { id, method, params, era, req };
      const res = await this.#dispatch(call);
      const subject = typeof params.name === "string" ? params.name : typeof params.uri === "string" ? params.uri : "";
      const client = `${era}${this.#apps ? (this.#uiCapable(call) ? ", ui" : ", text") : ""}`;
      McpRouter.logger.verbose(
        `MCP ${method}${subject ? ` ${subject}` : ""} (${client}) → ${res.status} (${Date.now() - started}ms)`,
      );
      return res;
    } catch (error) {
      if (error instanceof McpAuthRequiredError) return this.#auth.unauthorized(req);
      McpRouter.logger.error(
        `MCP ${method} failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
      );
      return McpRouter.#error(id, McpErrorCode.internal, "Internal server error.");
    }
  }

  async #dispatch(call: McpCall) {
    const document = this.#getDocument();
    switch (call.method) {
      case "initialize":
        // Legacy only. A client that renders no views is issued no `Mcp-Session-Id`, exactly as before MCP Apps.
        return this.#result(
          call,
          {
            protocolVersion: this.#negotiate(call.params.protocolVersion),
            capabilities: this.#capabilities(document),
            serverInfo: this.#serverInfo(),
            ...(this.#props.instructions ? { instructions: this.#props.instructions } : {}),
          },
          undefined,
          this.#uiSession(call),
        );
      case "ping":
        // Both eras keep it, and a client that uses it as a liveness check reads a `-32601` as a dead connection.
        return this.#result(call, {});
      case "server/discover":
        //? At 200, as a legacy-only server answers it: that is the reply claude.ai was seen to fall back from.
        if (!this.#versions.includes(MCP_MODERN_VERSION))
          return McpRouter.#error(call.id, McpErrorCode.methodNotFound, this.#methodNotFound(call.method));
        return this.#result(
          call,
          {
            supportedVersions: this.#versions,
            capabilities: this.#capabilities(document),
            ...(this.#props.instructions ? { instructions: this.#props.instructions } : {}),
          },
          discoverCache,
        );
      case "tools/list":
        return await this.#list(call, "tools", [...document.tools, ...(await this.#appTools(call, document))]);
      case "resources/list":
        return await this.#list(call, "resources", [...document.resources, ...(await this.#appResources(call))]);
      case "resources/templates/list":
        return await this.#list(call, "resourceTemplates", document.resourceTemplates);
      case "prompts/list":
        return await this.#list(call, "prompts", (await this.#pageEntries()).map(McpRouter.#promptOf));
      case "tools/call": {
        const slot = await this.#acquire(call);
        if ("refused" in slot) return slot.refused;
        let release = slot.release;
        try {
          const page = await this.#pageToolOf(call.params.name);
          if (page) return await this.#pageToolCall(call, document, page);
          // Handed over: a streamed call keeps its slot until the stream ends.
          release = () => {};
          return await this.#toolsCall(call, document, slot.release);
        } finally {
          release();
        }
      }
      case "prompts/get":
        return await this.#limited(call, () => this.#promptsGet(call, document));
      case "resources/read":
        return await this.#limited(call, () => this.#resourcesRead(call, document));
      default:
        // Legacy clients read a 404 as "session gone" and would re-handshake in a loop, so they get the error at 200.
        return McpRouter.#error(call.id, McpErrorCode.methodNotFound, this.#methodNotFound(call.method), {
          status: call.era === "modern" ? 404 : 200,
        });
    }
  }

  // Filter first, then page: an offset has to address the list the caller can actually see.
  async #list<T extends { name: string }>(call: McpCall, key: string, items: T[]) {
    const visible = await this.#dispatcher.filterForAccount(items, call.req);
    const page = McpRouter.#page(visible, call.params.cursor, this.#props.pageSize ?? defaultPageSize);
    if (!page) return McpRouter.#error(call.id, McpErrorCode.invalidParams, "Invalid cursor.");
    const result = { [key]: page.items, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
    return this.#result(call, result, listCache);
  }

  // Counted before the tool lookup, so a loop over an unknown name is throttled too.
  async #limited(call: McpCall, run: () => Promise<Response>): Promise<Response> {
    const slot = await this.#acquire(call);
    if ("refused" in slot) return slot.refused;
    try {
      return await run();
    } finally {
      slot.release();
    }
  }

  async #acquire(call: McpCall): Promise<{ refused: Response } | { release: () => void }> {
    if (!this.#limiter) return { release: () => {} };
    const verdict = await this.#limiter.acquire(McpAuth.callerKey(call.req));
    if (verdict.ok) return { release: verdict.release };
    const seconds = Math.max(1, Math.ceil(verdict.retryAfterMs / 1000));
    const message =
      verdict.reason === "calls"
        ? `Rate limit exceeded: ${this.#limiter.calls} calls per ${Math.round(this.#limiter.windowMs / 1000)}s. Retry in ${seconds}s.`
        : `Too many calls in flight: at most ${this.#limiter.concurrent} at once. Retry in ${seconds}s.`;
    return {
      refused: McpRouter.#error(call.id, McpErrorCode.rateLimited, message, {
        status: 429,
        headers: { "retry-after": String(seconds) },
      }),
    };
  }

  async #toolsCall(call: McpCall, document: McpDocument, release: () => void) {
    let streaming = false;
    try {
      const name = call.params.name;
      if (typeof name !== "string") return McpRouter.#error(call.id, McpErrorCode.invalidParams, "Missing tool name.");
      // An app-only tool is part of the surface only for a client that renders views; to any other it does not exist.
      const exposed = document.isAppOnly(name) && !this.#uiCapable(call) ? undefined : document.findTool(name);
      // Security: not-exposed must read like nonexistent, or the error itself enumerates the private surface.
      if (!exposed) return McpRouter.#error(call.id, McpErrorCode.invalidParams, `Unknown tool: ${name}.`);
      const args = McpRouter.#arguments(call.params);
      if (!args) return McpRouter.#error(call.id, McpErrorCode.invalidParams, McpRouter.#badArguments);
      const progressToken = McpRouter.#progressToken(call);
      const option = { forView: this.#forView(call) };
      if (progressToken === undefined)
        return this.#result(call, await this.#dispatcher.call(exposed, args, call.req, option));
      streaming = true;
      return await this.#streamedToolCall(call, exposed, args, progressToken, release);
    } finally {
      if (!streaming) release();
    }
  }

  // Commits to SSE only once progress is reported: a stream opened up front could no longer answer a 401 challenge.
  // Guards run before a body can report, so authorization is settled by the time it streams.
  async #streamedToolCall(
    call: McpCall,
    exposed: McpExposedEndpoint,
    args: Record<string, unknown>,
    progressToken: string | number,
    release: () => void,
  ) {
    const channel = new McpProgress();
    const option = { forView: this.#forView(call) };
    const settled = McpProgress.run(channel, async () => await this.#dispatcher.call(exposed, args, call.req, option))
      .then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      )
      .finally(() => {
        channel.end();
        release();
      });
    const reported = await Promise.race([channel.started.then(() => true), settled.then(() => false)]);
    if (!reported) {
      const outcome = await settled;
      if ("error" in outcome) throw outcome.error;
      return this.#result(call, outcome.result);
    }
    const stream = new McpEventStream(() => channel.abort());
    void this.#pump(call, channel, settled, stream, progressToken).catch((error: unknown) => {
      McpRouter.logger.error(`MCP stream for ${exposed.key} failed: ${error instanceof Error ? error.stack : error}`);
    });
    return stream.response();
  }

  async #pump(
    call: McpCall,
    channel: McpProgress,
    settled: Promise<{ result: McpToolResult } | { error: unknown }>,
    stream: McpEventStream,
    progressToken: string | number,
  ) {
    try {
      for await (const report of channel.reports())
        stream.write({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken, ...report } });
      const outcome = await settled;
      // Should be unreachable (guards throw before any progress); kept so a client is never left hanging.
      stream.write(
        "error" in outcome
          ? McpRouter.#errorBody(call.id, McpErrorCode.internal, "Internal server error.")
          : this.#envelope(call, outcome.result),
      );
    } finally {
      stream.close();
    }
  }

  static readonly #badArguments = "`arguments` must be an object of named values.";

  // Not coerced to `{}`: that ran the call with every argument missing. An array would read as properties "0", "1".
  static #arguments(params: Record<string, unknown>) {
    const args = params.arguments;
    if (args === undefined || args === null) return {};
    if (typeof args !== "object" || Array.isArray(args)) return null;
    return args as Record<string, unknown>;
  }

  // Unfiltered on purpose: per-credential capabilities would contradict themselves across a cached handshake.
  #capabilities(document: McpDocument) {
    const ui = !!this.#apps?.rendersUi;
    return {
      ...(document.tools.length || this.#apps ? { tools: {} } : {}),
      ...(document.resources.length || document.resourceTemplates.length || ui ? { resources: {} } : {}),
      ...(this.#props.pagePrompts ? { prompts: {} } : {}),
      //? A modern-era host treats an extension as negotiated only when both sides declare it, and renders nothing otherwise.
      ...(ui ? { extensions: { [MCP_UI_EXTENSION]: {} } } : {}),
    };
  }

  #reportPagePrompts() {
    const source = this.#props.pagePrompts;
    if (!source) return;
    void source
      .list()
      .then((entries) => {
        const names = entries.map((entry) => entry.name).join(", ");
        McpRouter.logger.debug(`MCP page prompts: ${entries.length}${entries.length ? ` (${names})` : ""}`);
        if (!this.#apps || !entries.length) return;
        for (const { name } of entries.filter((entry) => this.#isEndpointName(entry.name)))
          McpRouter.logger.warn(
            `MCP did not publish page "${name}" as a tool: an endpoint already takes that name, so it stays a prompt only. Rename the prompt.`,
          );
        const ui = this.#apps.rendersUi ? "rendered from the CSR shell by an MCP Apps host" : "with no view to render";
        McpRouter.logger.debug(`MCP page tools: ${ui}`);
      })
      .catch((error: unknown) => {
        McpRouter.logger.warn(
          `MCP page prompts could not be listed: ${error instanceof Error ? error.message : error}`,
        );
      });
  }

  static #promptOf({ name, description, arguments: args }: PagePromptEntry): McpPrompt {
    return { name, description, ...(args.length ? { arguments: args } : {}) };
  }

  // Only the credential travels into the page run: the page decides with it exactly as a browser tab would.
  static #forwardedHeaders(req: Request): [string, string][] {
    const authorization = req.headers.get("authorization");
    return authorization ? [["authorization", authorization]] : [];
  }

  // Only tools/call streams progress: listings are served from memory and prompts render as slash commands.
  static #progressToken(call: McpCall) {
    if (!call.req.headers.get("accept")?.includes("text/event-stream")) return undefined;
    const token = McpRouter.#meta(call.params)?.progressToken;
    return typeof token === "string" || typeof token === "number" ? token : undefined;
  }

  async #promptsGet(call: McpCall, document: McpDocument) {
    const name = call.params.name;
    if (typeof name !== "string") return McpRouter.#error(call.id, McpErrorCode.invalidParams, "Missing prompt name.");
    const entry = await this.#pageEntry(name);
    if (!entry) return McpRouter.#error(call.id, McpErrorCode.invalidParams, `Unknown prompt: ${name}.`);
    const page = await this.#runPage(call, document, entry);
    if (page instanceof Response) return page;
    if ("refusal" in page) return McpRouter.#error(call.id, McpErrorCode.invalidParams, page.refusal);
    return this.#result(call, { description: entry.description, messages: page.messages });
  }

  // A refused screen is a tool error, which the model reads, as an endpoint's refusal is; a prompt's is a JSON-RPC one.
  async #pageToolCall(call: McpCall, document: McpDocument, entry: PagePromptEntry) {
    const apps = this.#apps;
    const page = await this.#runPage(call, document, entry);
    if (page instanceof Response) return page;
    if ("refusal" in page)
      return this.#result(call, { content: [{ type: "text", text: page.refusal }], isError: true });
    if (!page.run || !apps) return this.#result(call, { content: page.messages.map((message) => message.content) });
    const origin = this.#auth.publicOrigin(call.req);
    const forView = this.#uiCapable(call) ? { account: McpApps.accountOf(call.req) } : null;
    return this.#result(call, apps.resultOf(page.run, page.messages, origin, forView));
  }

  async #runPage(call: McpCall, document: McpDocument, entry: PagePromptEntry): Promise<Response | McpPageRun> {
    const source = this.#props.pagePrompts;
    const { name } = entry;
    if (!source) return { refusal: `Unknown prompt: ${name}.` };
    const args = McpRouter.#arguments(call.params);
    const strings = args ? McpRouter.#pageArguments(args) : null;
    if (!strings) return McpRouter.#error(call.id, McpErrorCode.invalidParams, McpRouter.#badArguments);
    const composer = new PagePromptComposer({
      document,
      budget: this.#props.promptBudget ?? PagePromptComposer.defaultBudget,
      visibleTools: async (names) =>
        (
          await this.#dispatcher.filterForAccount(
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
      headers: McpRouter.#forwardedHeaders(call.req),
      language: this.#props.language,
    });
    if (!run.ok) {
      // A redirect or a guard's 401/403: no credential gets the auth challenge; with one, a bare refusal that never
      // confirms an id exists.
      const gated = run.reason === "redirect" || run.reason === "forbidden";
      if (gated && !call.req.headers.get("authorization")) throw new McpAuthRequiredError();
      if (run.reason === "error") McpRouter.logger.warn(`page prompt "${name}" failed: ${run.message}`);
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

  // The RSC worker answers the list; while it is down or restarting, the endpoint tools must still be served.
  async #pageEntries(): Promise<PagePromptEntry[]> {
    const source = this.#props.pagePrompts;
    if (!source) return [];
    try {
      const entries = await source.list();
      this.#pageListFailed = false;
      return entries;
    } catch (error) {
      if (!this.#pageListFailed)
        McpRouter.logger.warn(
          `MCP page prompts could not be listed, so they are left out: ${error instanceof Error ? error.message : error}`,
        );
      this.#pageListFailed = true;
      return [];
    }
  }

  async #pageEntry(name: unknown) {
    if (typeof name !== "string") return undefined;
    return (await this.#pageEntries()).find((candidate) => candidate.name === name);
  }

  // Any endpoint keeps its name, published or not: a listing filters a name by that endpoint's guards.
  #isEndpointName(name: string) {
    return !!this.#getDocument().findTool(name) || this.#dispatcher.isEndpoint(name);
  }

  async #pageTools() {
    if (!this.#apps) return [];
    return (await this.#pageEntries()).filter((entry) => !this.#isEndpointName(entry.name));
  }

  async #pageToolOf(name: unknown) {
    if (!this.#apps || typeof name !== "string" || this.#isEndpointName(name)) return undefined;
    return await this.#pageEntry(name);
  }

  async #appTools(call: McpCall, document: McpDocument) {
    const apps = this.#apps;
    if (!apps) return [];
    const pages = (await this.#pageTools()).map((entry) => apps.toolOf(entry));
    return this.#uiCapable(call) ? [...document.appTools, ...pages] : pages;
  }

  // Listed only to a client that renders them: any other would offer a multi-megabyte HTML document as an attachment.
  async #appResources(call: McpCall) {
    const apps = this.#apps;
    if (!apps?.rendersUi || !this.#uiCapable(call)) return [];
    return apps.resourcesOf(await this.#pageEntries());
  }

  // Not a credential: visibility is a host's UX, never authorization, so a client claiming the extension falsely gains
  // a listing and nothing its guards would not already let it call.
  #uiCapable(call: McpCall) {
    if (!this.#apps?.rendersUi) return false;
    if (call.era === "modern") return McpApps.declaresUi(McpRouter.#meta(call.params)?.[MCP_META_CLIENT_CAPABILITIES]);
    return call.req.headers.get("mcp-session-id")?.startsWith(McpApps.sessionPrefix) ?? false;
  }

  // Asked for by the view's own bridge; a model's call never carries it.
  #forView(call: McpCall) {
    return this.#uiCapable(call) && McpRouter.#meta(call.params)?.["akanjs/view"] === true;
  }

  #uiSession(call: McpCall): Record<string, string> | undefined {
    if (!this.#apps?.rendersUi || !McpApps.declaresUi(call.params.capabilities)) return undefined;
    return { "mcp-session-id": `${McpApps.sessionPrefix}${crypto.randomUUID()}` };
  }

  async #resourcesRead(call: McpCall, document: McpDocument) {
    const uri = call.params.uri;
    if (typeof uri !== "string") return McpRouter.#error(call.id, McpErrorCode.invalidParams, "Missing resource uri.");
    if (this.#apps && uri.startsWith(McpApps.scheme)) {
      const contents = await this.#apps.read(uri, this.#auth.publicOrigin(call.req));
      if (!contents) return McpRouter.#error(call.id, McpErrorCode.invalidParams, `Unknown resource: ${uri}.`);
      return this.#result(call, { contents: [contents] });
    }
    const resolved = document.resolveResource(uri);
    if (!resolved) return McpRouter.#error(call.id, McpErrorCode.invalidParams, `Unknown resource: ${uri}.`);
    const result = await this.#dispatcher.call(resolved.exposed, resolved.args, call.req);
    // An explicit error: a client reads an empty `contents` array as "this exists and is empty".
    if (result.isError)
      return McpRouter.#error(call.id, McpErrorCode.invalidParams, result.content[0]?.text ?? "Read failed.");
    // `ReadResourceResult` has no `structuredContent`, so the text is the resource's only channel.
    const text =
      result.structuredContent === undefined
        ? (result.content[0]?.text ?? "null")
        : JSON.stringify(result.structuredContent);
    return this.#result(call, { contents: [{ uri, mimeType: "application/json", text }] });
  }

  // MCP clients normally send no `Origin`. Matching our own host stops other sites but not DNS rebinding (the
  // attacker's name resolves here, so Origin and host agree): `allowedOrigins` is what decides browser access.
  #originAllowed(req: Request) {
    const origin = req.headers.get("origin");
    if (!origin) return true;
    if ((this.#props.allowedOrigins ?? []).includes(origin)) return true;
    try {
      // The public host: behind a proxy `req.url` names the internal child; a configured resource pins it.
      return new URL(origin).host === new URL(this.#auth.publicOrigin(req)).host;
    } catch {
      return false;
    }
  }

  // JSON bodies and `mcp-*` mirror headers force a preflight. Requested headers are echoed, not fixed: the origin
  // is the decision, and a fixed list only breaks clients that send one more header.
  #preflight(req: Request) {
    if (!req.headers.get("origin") || !this.#originAllowed(req)) return new Response("Forbidden", { status: 403 });
    return this.#cors(
      req,
      new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
          "access-control-allow-headers":
            req.headers.get("access-control-request-headers") ?? "authorization, content-type",
          "access-control-max-age": "600",
        },
      }),
    );
  }

  // Never `access-control-allow-credentials`: ambient cookies would let a permitted origin ride a signed-in session.
  #cors(req: Request, res: Response) {
    const origin = req.headers.get("origin");
    if (!origin || !this.#originAllowed(req)) return res;
    res.headers.set("access-control-allow-origin", origin);
    res.headers.set("vary", "origin");
    if (res.headers.has("mcp-session-id")) res.headers.set("access-control-expose-headers", "mcp-session-id");
    return res;
  }

  #serverInfo() {
    const env = getEnv();
    return { name: `${env.appName}-mcp`, version: this.#props.version ?? "0.0.0" };
  }

  #result(call: McpCall, result: object, cache?: McpCacheHint, headers?: Record<string, string>) {
    return Response.json(this.#envelope(call, result, cache), { headers });
  }

  #envelope(call: McpCall, result: object, cache?: McpCacheHint) {
    // `resultType`, server-info `_meta` and cache hints are modern-era only; `nextCursor` (both eras) is in `result`.
    const meta =
      call.era === "modern"
        ? { resultType: "complete", _meta: { [MCP_META_SERVER_INFO]: this.#serverInfo() }, ...cache }
        : {};
    return { jsonrpc: "2.0", id: call.id, result: { ...meta, ...result } };
  }

  // An out-of-range cursor (minted by an earlier process) is refused, not clamped: a short page reads as the end.
  static #page<T>(items: T[], cursor: unknown, size: number) {
    const offset = McpRouter.#offset(cursor);
    if (offset === null || offset > items.length) return null;
    const next = offset + size;
    return {
      items: items.slice(offset, next),
      ...(next < items.length ? { nextCursor: Buffer.from(String(next)).toString("base64url") } : {}),
    };
  }

  static #offset(cursor: unknown) {
    if (cursor === undefined || cursor === null) return 0;
    if (typeof cursor !== "string") return null;
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    // `Number("")` is 0: an empty decode would restart a corrupted cursor at page one, forever.
    if (!decoded) return null;
    const offset = Number(decoded);
    return Number.isInteger(offset) && offset >= 0 ? offset : null;
  }

  static #meta(params: Record<string, unknown>) {
    const meta = params._meta;
    return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  }

  // An unknown proposal newer than ours gets our newest, an older one our oldest: the spec's "latest supported" would
  // strand old clients. Revision names are ISO dates, so they order as strings.
  #negotiate(requested: unknown) {
    if (typeof requested !== "string") return MCP_LEGACY_VERSION;
    if (this.#versions.includes(requested as McpProtocolVersion)) return requested;
    const [newest] = this.#versions;
    return requested > newest ? newest : this.#versions[this.#versions.length - 1];
  }

  #methodNotFound(method: string) {
    return `Method not found: ${method}. This server speaks MCP ${this.#versions.join(", ")}.`;
  }

  // Security: a header/body mismatch is rejected, not resolved for the body — a gateway in front judged the header.
  #validateModern(
    req: Request,
    method: string,
    params: Record<string, unknown>,
    meta: Record<string, unknown>,
    id: string | number | null,
  ) {
    const version = meta[MCP_META_PROTOCOL_VERSION];
    if (typeof version !== "string" || !(MCP_META_CLIENT_CAPABILITIES in meta))
      return McpRouter.#error(id, McpErrorCode.invalidParams, "Missing required `_meta` fields.", { status: 400 });
    if (!this.#versions.includes(version as McpProtocolVersion))
      return McpRouter.#error(id, McpErrorCode.unsupportedProtocolVersion, "Unsupported protocol version.", {
        status: 400,
        data: { requested: version, supported: this.#versions },
      });
    const named = params.name ?? params.uri;
    const mismatch =
      McpRouter.#headerMismatch(req, "mcp-protocol-version", version) ??
      McpRouter.#headerMismatch(req, "mcp-method", method) ??
      (typeof named === "string" ? McpRouter.#headerMismatch(req, "mcp-name", named) : undefined);
    return mismatch ? McpRouter.#error(id, McpErrorCode.headerMismatch, mismatch, { status: 400 }) : null;
  }

  static #headerMismatch(req: Request, header: string, expected: string) {
    const raw = req.headers.get(header);
    // Absence is refused like a mismatch: a gateway rule keyed on the header does not fire for a request omitting it.
    if (raw === null) return `Header \`${header}\` is required by this protocol version and was not sent.`;
    return McpRouter.#decodeHeader(raw) === expected ? undefined : `Header \`${header}\` does not match the body.`;
  }

  // Values that are not ASCII-safe travel wrapped in a lowercase base64 sentinel: `=?base64?…?=`.
  static #decodeHeader(value: string) {
    if (!value.startsWith("=?base64?") || !value.endsWith("?=")) return value;
    return Buffer.from(value.slice(9, -2), "base64").toString("utf8");
  }

  // The JSON-RPC body is what tells a client a 4xx came from MCP, not a proxy; tool-level failures stay at 200.
  static #error(
    id: string | number | null,
    code: number,
    message: string,
    { status, data, headers }: McpErrorOptions = {},
  ) {
    return Response.json(McpRouter.#errorBody(id, code, message, data), { status: status ?? 200, headers });
  }

  static #errorBody(id: string | number | null, code: number, message: string, data?: unknown) {
    return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
  }
}
