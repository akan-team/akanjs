import { AkanError, type BackendEnv, getEnv } from "akanjs/base";
import { Logger, MCP_FAILURE_META, type McpFailure } from "akanjs/common";
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
  type McpJsonRpcResponse,
  type McpOutputSchemaMode,
  McpProgress,
  type McpPrompt,
  type McpProtocolVersion,
  type McpSignalCost,
  type McpTool,
  type McpToolResult,
} from "../../signal/mcp";
import type { PagePromptEntry, PagePromptSource } from "../../signal/mcp/pagePrompt";
import type { MiddlewareCls } from "../../signal/middleware";
import { FetchSerializer } from "../../signal/serializer";
import type { HttpRoutes } from "../types";
import { type McpAppShellSource, McpApps } from "./McpApps";
import { McpAuth, type McpAuthOption } from "./McpAuth";
import { McpAuthRequiredError, McpDispatcher, type McpStructuredContentMode } from "./McpDispatcher";
import { McpEventStream } from "./McpEventStream";
import type { McpFoundToolsStore } from "./McpFoundTools";
import { McpPages } from "./McpPages";
import { McpRateLimiter, type McpRateLimitOption, type McpSharedCounter } from "./McpRateLimiter";
import { McpSearch, type McpSearchOption } from "./McpSearch";
import { type McpShelfOption, McpShelves, type McpSurface } from "./McpShelves";
import { McpUiSession, type McpUiSessionStore } from "./McpUiSession";
import { McpWire } from "./McpWire";

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
  excludeSignals?: string[];
  excludeEndpoints?: string[];
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
  shelves?: Record<string, McpShelfOption>;
  search?: McpSearchOption;
  structuredContent?: McpStructuredContentMode;
}

interface McpCall {
  id: string | number | null;
  method: string;
  params: Record<string, unknown>;
  era: McpEra;
  req: Request;
  ui: boolean;
  surface: McpSurface;
  inProcess?: boolean;
}

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
  static readonly #legacyVersions = MCP_SUPPORTED_VERSIONS.filter((version) => version !== MCP_MODERN_VERSION);

  readonly #props: McpRouterProps;
  readonly #dispatcher: McpDispatcher;
  readonly #auth: McpAuth;
  readonly #limiter: McpRateLimiter | null;
  readonly #apps: McpApps | null;
  readonly #pages: McpPages;
  readonly #root: McpSurface;
  readonly #shelves: McpSurface[];
  readonly #search: McpSearch | null;
  #document: McpDocument | null = null;

  constructor(props: McpRouterProps) {
    this.#props = props;
    // Clients validate `structuredContent` only against a declared `outputSchema`, so with none the text block stays.
    const legacyTextBlock = props.outputSchema === "none" ? undefined : props.legacyTextBlock;
    // Resolved here so a call's domain error reads in the language its tool was described in.
    this.#dispatcher = new McpDispatcher({ ...props, legacyTextBlock, language: props.language ?? defaultLanguage });
    const path = props.path ?? "/mcp";
    this.#auth = new McpAuth({ ...props.auth, path });
    this.#root = { shelf: null, path, auth: this.#auth, instructions: props.instructions, endpoints: null };
    this.#shelves = McpShelves.surfaces(props.shelves, { path, auth: props.auth, root: this.#auth });
    this.#apps =
      props.apps && props.pagePrompts
        ? new McpApps(props.appShell ?? null, { readOnly: props.readOnly, staticHtml: !!props.pagePrompts.render })
        : null;
    const cache = props.registry.adaptor.get(CacheAdaptorRole) as
      | (McpSharedCounter & McpUiSessionStore & McpFoundToolsStore)
      | undefined;
    this.#pages = new McpPages({
      source: props.pagePrompts,
      apps: this.#apps,
      sessions: new McpUiSession(cache ?? null),
      dispatcher: this.#dispatcher,
      document: () => this.#getDocument(),
      publicOrigin: (req) => this.#auth.publicOrigin(req),
      logger: McpRouter.logger,
      promptBudget: props.promptBudget,
      language: props.language,
      readOnly: props.readOnly,
    });
    this.#limiter = props.rateLimit === false ? null : new McpRateLimiter(props.rateLimit, cache ?? null);
    this.#search = props.search ? new McpSearch(props.search, cache ?? null) : null;
  }

  // claude.ai renders a view only for a server it reached through `initialize`; over `server/discover` it reads the
  // resource and never mounts it. Refusing discovery sends a modern client down that path, which only an app needs,
  // so it stays refused until the worker has listed no `.app()`.
  get #versions(): readonly McpProtocolVersion[] {
    const listed = this.#pages.listed;
    const views = !!this.#apps?.rendersUi && (listed === null || listed.some((entry) => entry.kind === "app"));
    const modern = this.#props.modern ?? !views;
    return modern ? MCP_SUPPORTED_VERSIONS : McpRouter.#legacyVersions;
  }

  createRoutes(): HttpRoutes {
    const routes: HttpRoutes = {};
    for (const surface of [this.#root, ...this.#shelves])
      Object.assign(routes, {
        [surface.path]: {
          POST: async (req: Request) => this.#cors(req, await this.#post(req, surface)),
          OPTIONS: (req: Request) => this.#preflight(req),
          // No server stream in either era, and the one session stores nothing to end; still CORS-labelled so a browser
          // can tell 405 from a refusal.
          GET: (req: Request) => this.#cors(req, notAllowed()),
          DELETE: (req: Request) => this.#cors(req, notAllowed()),
        },
        ...surface.auth.createRoutes(),
      });
    return routes;
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
      this.#pages.report();
      this.#reportUnmatched(document);
      this.#reportUnverifiable(tools.map((tool) => tool.name));
      for (const { key, reason } of refusals) McpRouter.logger.verbose(`MCP did not expose "${key}": ${reason}`);
      for (const { key, reason } of document.appOnly)
        McpRouter.logger.verbose(
          `MCP kept "${key}" for the views an MCP Apps host renders, and shows it to no model: ${reason}`,
        );
      for (const { key, reason } of undescribed)
        McpRouter.logger.warn(`MCP exposed "${key}" with no description: ${reason}`);
    } catch (error) {
      // Must not stop the boot; nothing was cached, so the first request rebuilds the catalogue and raises it.
      McpRouter.logger.warn(
        `MCP catalogue could not be built at boot: ${error instanceof Error ? error.message : error}`,
      );
    }
    this.#checkNames();
  }

  // Outside `report`'s catch: a misspelt shelf or search name would leave a connector without the tool it was set up for.
  #checkNames() {
    let document: McpDocument;
    try {
      document = this.#getDocument();
    } catch {
      return;
    }
    for (const line of McpShelves.report(document, [this.#root, ...this.#shelves], this.#search))
      McpRouter.logger.warn(line);
  }

  #reportUnmatched(document: McpDocument) {
    const { signals, endpoints } = document.unmatchedExclusions;
    if (signals.length)
      McpRouter.logger.warn(
        `MCP excludeSignals names ${signals.map((name) => `"${name}"`).join(", ")}, which this server does not serve, so nothing was excluded for them. Check the spelling in option.setMcp.`,
      );
    if (endpoints.length)
      McpRouter.logger.warn(
        `MCP excludeEndpoints names ${endpoints.map((name) => `"${name}"`).join(", ")}, which no served signal has, so nothing was excluded for them. Check the spelling in option.setMcp.`,
      );
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
      excludeSignals: this.#props.excludeSignals,
      excludeEndpoints: this.#props.excludeEndpoints,
      outputSchema: this.#props.outputSchema,
      apps: !!this.#apps?.rendersUi,
    });
    return this.#document;
  }

  async #post(req: Request, surface: McpSurface) {
    if (!this.#originAllowed(req)) return new Response("Forbidden", { status: 403 });
    // Security: the spec's only credential is `Authorization`; an ambient cookie would let a same-site page drive
    // tools/call past `CrossSiteGuard`. Deleted in place so the `BunRequest` keeps its peer address.
    req.headers.delete("cookie");
    const rejected = surface.auth.challengeAnonymous(req) ?? (await surface.auth.reject(req));
    if (rejected) return rejected;
    let body: McpJsonRpcRequest;
    try {
      body = (await req.json()) as McpJsonRpcRequest;
    } catch {
      return McpWire.error(null, McpErrorCode.parse, "Invalid JSON body.", { status: 400 });
    }
    if (body === null)
      return McpWire.error(null, McpErrorCode.invalidRequest, "A JSON-RPC request is an object.", { status: 400 });
    const id = body.id ?? null;
    const method = body.method;
    if (typeof method !== "string")
      return McpWire.error(id, McpErrorCode.invalidRequest, "Missing JSON-RPC method.", { status: 400 });
    // A notification carries no id and expects no body back.
    if (method.startsWith("notifications/")) return new Response(null, { status: 202 });

    const params = (body.params ?? {}) as Record<string, unknown>;
    // Keyed on the modern version key, not on `_meta` itself: legacy `_meta` exists too (it carries `progressToken`).
    const meta = McpWire.meta(params);
    const era: McpEra = method !== "initialize" && meta && MCP_META_PROTOCOL_VERSION in meta ? "modern" : "legacy";
    const discoverable = method !== "server/discover" || this.#versions.includes(MCP_MODERN_VERSION);
    const rejection =
      era === "modern" && discoverable ? this.#validateModern(req, method, params, meta ?? {}, id) : null;
    if (rejection) return rejection;

    const started = Date.now();
    try {
      const ui = !surface.endpoints && (await this.#pages.uiCapable(era, meta, req));
      const call: McpCall = { id, method, params, era, req, ui, surface };
      const res = await this.#dispatch(call);
      const subject = typeof params.name === "string" ? params.name : typeof params.uri === "string" ? params.uri : "";
      const client = `${era}${this.#apps ? (call.ui ? ", ui" : ", text") : ""}`;
      McpRouter.logger.verbose(
        `MCP ${method}${subject ? ` ${subject}` : ""} (${client}) → ${res.status} (${Date.now() - started}ms)`,
      );
      return res;
    } catch (error) {
      if (error instanceof McpAuthRequiredError) return surface.auth.unauthorized(req);
      McpRouter.logger.error(
        `MCP ${method} failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`,
      );
      return McpWire.error(id, McpErrorCode.internal, "Internal server error.", McpWire.coded("internalError"));
    }
  }

  async #dispatch(call: McpCall) {
    const document = this.#getDocument();
    switch (call.method) {
      case "initialize":
        // Legacy only. A client that renders no views is issued no `Mcp-Session-Id`.
        return this.#result(
          call,
          {
            protocolVersion: this.#negotiate(call.params.protocolVersion),
            capabilities: this.#capabilities(document, call.surface),
            serverInfo: this.#serverInfo(),
            ...(call.surface.instructions ? { instructions: call.surface.instructions } : {}),
          },
          undefined,
          call.surface.endpoints ? undefined : await this.#pages.uiSession(call.params.capabilities),
        );
      case "ping":
        // Both eras keep it, and a client that uses it as a liveness check reads a `-32601` as a dead connection.
        return this.#result(call, {});
      case "server/discover":
        //? At 200, as a legacy-only server answers it: that is the reply claude.ai was seen to fall back from.
        if (!this.#versions.includes(MCP_MODERN_VERSION))
          return McpWire.error(call.id, McpErrorCode.methodNotFound, this.#methodNotFound(call.method));
        return this.#result(
          call,
          {
            supportedVersions: this.#versions,
            capabilities: this.#capabilities(document, call.surface),
            ...(call.surface.instructions ? { instructions: call.surface.instructions } : {}),
          },
          discoverCache,
        );
      case "tools/list":
        // Uncached under search: the listing grows with each `findTools`, announced only by `list_changed`.
        return await this.#list(
          call,
          "tools",
          () => this.#toolsOf(call, document),
          this.#search && !call.surface.endpoints ? null : listCache,
        );
      case "resources/list":
        return await this.#list(call, "resources", async () =>
          call.surface.endpoints ? [] : [...document.resources, ...(await this.#pages.resources(call.ui, call.req))],
        );
      case "resources/templates/list":
        return await this.#list(call, "resourceTemplates", () =>
          call.surface.endpoints ? [] : document.resourceTemplates,
        );
      case "prompts/list":
        return await this.#list(call, "prompts", () => (call.surface.endpoints ? [] : this.#pages.prompts(call.req)));
      case "tools/call": {
        const slot = await this.#acquire(call);
        if ("refused" in slot) return slot.refused;
        let release = slot.release;
        try {
          const page = call.surface.endpoints ? null : await this.#pages.toolOf(call.params.name);
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
        return McpWire.error(call.id, McpErrorCode.methodNotFound, this.#methodNotFound(call.method), {
          status: call.era === "modern" ? 404 : 200,
        });
    }
  }

  // Filter first, then page: an offset has to address the list the caller can actually see.
  //? Rate-limited like a call, as a listing runs the account and route guards; `listFor` (in-process) is not.
  async #list<T extends { name: string }>(
    call: McpCall,
    key: string,
    itemsOf: () => Promise<T[]> | T[],
    cache: McpCacheHint | null = listCache,
  ) {
    const list = async () => {
      const visible = await this.#dispatcher.filterForAccount(await itemsOf(), call.req);
      const page = McpWire.page(visible, call.params.cursor, this.#props.pageSize ?? defaultPageSize);
      if (!page) return McpWire.error(call.id, McpErrorCode.invalidParams, "Invalid cursor.");
      const result = { [key]: page.items, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
      return this.#result(call, result, cache ?? undefined);
    };
    return call.inProcess ? await list() : await this.#limited(call, list);
  }

  async #toolsOf(call: McpCall, document: McpDocument): Promise<McpTool[]> {
    const endpoints = call.surface.endpoints;
    if (endpoints) return document.tools.filter((tool) => endpoints.has(tool.name));
    const pages = await this.#pages.tools(call.ui, document, call.req);
    if (!this.#search) return [...document.tools, ...pages];
    return await this.#search.listing(document, this.#auth.callerKey(call.req), pages);
  }

  /** The catalogue as built, before any caller filter: refusals, undescribed entries, `findTool`. */
  get document(): McpDocument {
    return this.#getDocument();
  }

  /**
   * Every page `tools/list` and `prompts/list` answer `req`'s caller, dispatched in-process past the transport's gate
   * (origin, token audience, protocol headers); the account still resolves from `req` through the middleware chain.
   * `ui` lists as for a client that renders MCP Apps views, which only a server drawing them tells apart.
   */
  async listFor(
    req: Request,
    { ui = false }: { ui?: boolean } = {},
  ): Promise<{ tools: McpTool[]; prompts: McpPrompt[] }> {
    const rendersUi = ui && !!this.#apps?.rendersUi;
    return {
      tools: (await this.#listAll("tools/list", "tools", req, rendersUi)) as McpTool[],
      prompts: (await this.#listAll("prompts/list", "prompts", req, rendersUi)) as McpPrompt[],
    };
  }

  async #listAll(method: string, key: string, req: Request, ui: boolean) {
    const items: unknown[] = [];
    let cursor: string | undefined;
    do {
      const call: McpCall = {
        id: 0,
        method,
        params: cursor ? { cursor } : {},
        era: "legacy",
        req,
        ui,
        surface: this.#root,
        inProcess: true,
      };
      const body = (await (await this.#dispatch(call)).json()) as McpJsonRpcResponse;
      const result = body.result as Record<string, unknown> | undefined;
      if (!result) throw new AkanError("listFailed", `MCP ${method} failed: ${body.error?.message ?? "no result"}`);
      items.push(...((result[key] as unknown[] | undefined) ?? []));
      cursor = typeof result.nextCursor === "string" ? result.nextCursor : undefined;
    } while (cursor);
    return items;
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
    const verdict = await this.#limiter.acquire(this.#auth.callerKey(call.req));
    if (verdict.ok) return { release: verdict.release };
    const seconds = Math.max(1, Math.ceil(verdict.retryAfterMs / 1000));
    const message =
      verdict.reason === "calls"
        ? `Rate limit exceeded: ${this.#limiter.calls} calls per ${Math.round(this.#limiter.windowMs / 1000)}s. Retry in ${seconds}s.`
        : `Too many calls in flight: at most ${this.#limiter.concurrent} at once. Retry in ${seconds}s.`;
    return {
      refused: McpWire.error(call.id, McpErrorCode.rateLimited, message, {
        ...McpWire.coded(AkanError.codeOfStatus(429)),
        status: 429,
        headers: { "retry-after": String(seconds) },
      }),
    };
  }

  async #toolsCall(call: McpCall, document: McpDocument, release: () => void) {
    let streaming = false;
    try {
      const name = call.params.name;
      if (typeof name !== "string")
        return McpWire.error(call.id, McpErrorCode.invalidParams, "Missing tool name.", McpWire.invalid);
      const search = call.surface.endpoints ? null : this.#search;
      const meta = search && (name === McpSearch.findName || name === McpSearch.readName);
      const named = meta ? McpWire.arguments(call.params) : undefined;
      if (named === null) return McpWire.badArgumentsError(call.id);
      if (search && named && name === McpSearch.findName) return await this.#findTools(call, document, named, search);
      const target = named
        ? McpSearch.readTarget(document, named)
        : { exposed: this.#exposedTool(call, document, name), args: call.params.arguments };
      if ("refusal" in target)
        return McpWire.error(call.id, McpErrorCode.invalidParams, target.refusal, McpWire.coded(target.code));
      const exposed = target.exposed;
      // Security: not-exposed must read like nonexistent, or the error itself enumerates the private surface.
      if (!exposed)
        return McpWire.error(
          call.id,
          McpErrorCode.invalidParams,
          `Unknown tool: ${name}.`,
          McpWire.coded("unknownTool"),
        );
      const args = McpWire.arguments({ arguments: target.args });
      if (!args) return McpWire.badArgumentsError(call.id);
      const progressToken = McpWire.progressToken(call.req, call.params);
      const option = { forView: this.#pages.forView(call.ui, McpWire.meta(call.params)) };
      if (progressToken === undefined)
        return this.#result(call, await this.#dispatcher.call(exposed, args, call.req, option));
      streaming = true;
      return await this.#streamedToolCall(call, exposed, args, progressToken, release);
    } finally {
      if (!streaming) release();
    }
  }

  // An app-only tool is part of the surface only for a client that renders views; to any other it does not exist.
  #exposedTool(call: McpCall, document: McpDocument, name: string) {
    if (document.isAppOnly(name) && !call.ui) return undefined;
    if (call.surface.endpoints && !call.surface.endpoints.has(name)) return undefined;
    return document.findTool(name);
  }

  //? The new listing is announced on this call's own stream: the modern era keeps no server stream to send it on later.
  async #findTools(call: McpCall, document: McpDocument, args: Record<string, unknown>, search: McpSearch) {
    const visible = await this.#dispatcher.filterForAccount(document.tools, call.req);
    const found = await search.find(visible, args, this.#auth.callerKey(call.req));
    if ("error" in found) return McpWire.error(call.id, McpErrorCode.invalidParams, found.error, McpWire.invalid);
    const result = McpSearch.result({ tools: found.tools }, this.#props.structuredContent !== "declared");
    if (!found.added || !McpWire.acceptsStream(call.req)) return this.#result(call, result);
    const stream = new McpEventStream(() => {});
    stream.write({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
    stream.write(this.#envelope(call, result));
    stream.close();
    return stream.response();
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
    const option = { forView: this.#pages.forView(call.ui, McpWire.meta(call.params)) };
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
          ? McpWire.errorBody(call.id, McpErrorCode.internal, "Internal server error.", { code: "internalError" })
          : this.#envelope(call, outcome.result),
      );
    } finally {
      stream.close();
    }
  }

  // Unfiltered on purpose: per-credential capabilities would contradict themselves across a cached handshake.
  #capabilities(document: McpDocument, surface: McpSurface) {
    if (surface.endpoints) return { tools: {} };
    const ui = !!this.#apps?.rendersUi;
    return {
      ...(document.tools.length || this.#apps || this.#search
        ? { tools: this.#search ? { listChanged: true } : {} }
        : {}),
      ...(document.resources.length || document.resourceTemplates.length || ui ? { resources: {} } : {}),
      ...(this.#props.pagePrompts ? { prompts: {} } : {}),
      //? A modern-era host treats an extension as negotiated only when both sides declare it, and renders nothing otherwise.
      ...(ui ? { extensions: { [MCP_UI_EXTENSION]: {} } } : {}),
    };
  }

  async #pageToolCall(call: McpCall, document: McpDocument, entry: PagePromptEntry) {
    const outcome = await this.#pages.toolCall(call, document, entry, McpWire.arguments(call.params));
    if ("badArguments" in outcome) return McpWire.badArgumentsError(call.id);
    return this.#result(call, outcome.result);
  }

  async #promptsGet(call: McpCall, document: McpDocument) {
    const name = call.params.name;
    if (typeof name !== "string")
      return McpWire.error(call.id, McpErrorCode.invalidParams, "Missing prompt name.", McpWire.invalid);
    const unknown = McpWire.coded("unknownPrompt");
    const entry = call.surface.endpoints ? null : await this.#pages.prompt(name);
    if (!entry) return McpWire.error(call.id, McpErrorCode.invalidParams, `Unknown prompt: ${name}.`, unknown);
    const page = await this.#pages.run(call, document, entry, McpWire.arguments(call.params));
    if ("badArguments" in page) return McpWire.badArgumentsError(call.id);
    if ("refusal" in page)
      return McpWire.error(call.id, McpErrorCode.invalidParams, page.refusal, McpWire.coded(page.failure.code));
    return this.#result(call, { description: entry.description, messages: page.messages });
  }

  async #resourcesRead(call: McpCall, document: McpDocument) {
    const uri = call.params.uri;
    if (typeof uri !== "string")
      return McpWire.error(call.id, McpErrorCode.invalidParams, "Missing resource uri.", McpWire.invalid);
    const unknown = McpWire.coded("unknownResource");
    if (this.#apps && !call.surface.endpoints && uri.startsWith(McpApps.scheme)) {
      const contents = await this.#apps.read(uri, this.#auth.publicOrigin(call.req));
      if (!contents) return McpWire.error(call.id, McpErrorCode.invalidParams, `Unknown resource: ${uri}.`, unknown);
      return this.#result(call, { contents: [contents] });
    }
    const resolved = call.surface.endpoints ? null : document.resolveResource(uri);
    if (!resolved) return McpWire.error(call.id, McpErrorCode.invalidParams, `Unknown resource: ${uri}.`, unknown);
    const result = await this.#dispatcher.call(resolved.exposed, resolved.args, call.req, { structured: true });
    const [first] = result.content;
    const firstText = first?.type === "text" ? first.text : undefined;
    // An explicit error: a client reads an empty `contents` array as "this exists and is empty".
    if (result.isError) {
      const failure = result._meta?.[MCP_FAILURE_META] as McpFailure | undefined;
      const code = failure?.code ?? AkanError.codeOfStatus(500);
      return McpWire.error(call.id, McpErrorCode.invalidParams, firstText ?? "Read failed.", McpWire.coded(code));
    }
    // `ReadResourceResult` has no `structuredContent`, so the text is the resource's only channel.
    const text =
      result.structuredContent === undefined ? (firstText ?? "null") : JSON.stringify(result.structuredContent);
    return this.#result(call, { contents: [{ uri, mimeType: "application/json", text }] });
  }

  // MCP clients normally send no `Origin`. Matching our own host stops other sites but not DNS rebinding (another
  // site's name resolves here, so Origin and host agree), so the host also has to be one this app answers to.
  #originAllowed(req: Request) {
    const origin = req.headers.get("origin");
    if (!origin) return true;
    if ((this.#props.allowedOrigins ?? []).includes(origin)) return true;
    try {
      // The public host: behind a proxy `req.url` names the internal child; a configured resource pins it.
      return new URL(origin).host === new URL(this.#auth.publicOrigin(req)).host && this.#auth.answersTo(req);
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
    const own = (result as { _meta?: Record<string, unknown> })._meta;
    if (call.era !== "modern") return { jsonrpc: "2.0", id: call.id, result } satisfies McpJsonRpcResponse;
    const _meta = { [MCP_META_SERVER_INFO]: this.#serverInfo(), ...own };
    return {
      jsonrpc: "2.0",
      id: call.id,
      result: { resultType: "complete", ...cache, ...result, _meta },
    } satisfies McpJsonRpcResponse;
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
      return McpWire.error(id, McpErrorCode.invalidParams, "Missing required `_meta` fields.", { status: 400 });
    if (!this.#versions.includes(version as McpProtocolVersion))
      return McpWire.error(id, McpErrorCode.unsupportedProtocolVersion, "Unsupported protocol version.", {
        status: 400,
        data: { requested: version, supported: this.#versions },
      });
    const named = params.name ?? params.uri;
    const mismatch =
      McpWire.headerMismatch(req, "mcp-protocol-version", version) ??
      McpWire.headerMismatch(req, "mcp-method", method) ??
      (typeof named === "string" ? McpWire.headerMismatch(req, "mcp-name", named) : undefined);
    return mismatch ? McpWire.error(id, McpErrorCode.headerMismatch, mismatch, { status: 400 }) : null;
  }
}
