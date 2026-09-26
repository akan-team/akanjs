import { type BackendEnv, getEnv } from "akanjs/base";
import { Logger } from "akanjs/common";
import { DictionaryLookup } from "akanjs/dictionary";
import { CacheAdaptorRole, type InjectRegistry, type LiveRegistry } from "akanjs/service";
import {
  MCP_LEGACY_VERSION,
  MCP_META_CLIENT_CAPABILITIES,
  MCP_META_PROTOCOL_VERSION,
  MCP_META_SERVER_INFO,
  MCP_SUPPORTED_VERSIONS,
  McpDocument,
  type McpEra,
  McpErrorCode,
  type McpExposedEndpoint,
  type McpJsonRpcRequest,
  type McpOutputSchemaMode,
  McpProgress,
  type McpSignalCost,
  type McpToolResult,
} from "../../signal/mcp";
import type { McpPrompt } from "../../signal/mcp/mcpProtocol";
import type { PagePromptEntry, PagePromptSource } from "../../signal/mcp/pagePrompt";
import type { MiddlewareCls } from "../../signal/middleware";
import { FetchSerializer } from "../../signal/serializer";
import type { HttpRoutes } from "../types";
import { McpAuth, type McpAuthOption } from "./McpAuth";
import { McpAuthRequiredError, McpDispatcher } from "./McpDispatcher";
import { McpEventStream } from "./McpEventStream";
import { McpRateLimiter, type McpRateLimitOption, type McpSharedCounter } from "./McpRateLimiter";
import { PagePromptComposer } from "./PagePromptComposer";

export interface McpRouterProps {
  registry: InjectRegistry;
  /** Spread into every `SignalContext` this router's dispatcher builds; middleware reads it. */
  env: BackendEnv;
  live: LiveRegistry;
  middleware: Map<string, MiddlewareCls>;
  path?: string;
  version?: string;
  /** Free-text usage guidance handed to the model alongside the tool list. */
  instructions?: string;
  /** Extra origins allowed past the DNS-rebinding check, beyond the server's own host. */
  allowedOrigins?: string[];
  readOnly?: boolean;
  /** Entries per catalogue page. A client that wants the whole list follows `nextCursor` until it stops. */
  pageSize?: number;
  /**
   * The one language every title, description and domain error text is resolved in. The catalogue is built once
   * at boot and cached by clients, so it is a server-wide choice rather than a per-request one: `Accept-Language`
   * would mean a document per language, re-deriving every tool schema, for a surface a model reads and a human
   * rarely sees. Defaults to `en`, falling back to the first registered language when the app has no `en`.
   */
  language?: string;
  /** Whether a structured result also ships as serialized JSON in the text block. Default `true`. */
  legacyTextBlock?: boolean;
  /**
   * Where `prompts/list` and `prompts/get` are answered from: the pages, through the RSC worker. Absent on an
   * API-only build, which then publishes no prompts at all.
   */
  pagePrompts?: PagePromptSource;
  /** Characters of screen data one prompt may attach before its lists are cut; see `PagePromptComposer`. */
  promptBudget?: number;
  outputSchema?: McpOutputSchemaMode;
  auth?: McpAuthOption;
  /**
   * Budget per caller for the methods that execute an endpoint (`tools/call`, `resources/read`, `prompts/get`).
   * On by default at `McpRateLimiter.defaults`; `false` takes it off. Listings are not counted — they are served
   * from memory and a client polls them.
   */
  rateLimit?: McpRateLimitOption | false;
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

interface McpCacheHint {
  ttlMs: number;
  cacheScope: "public" | "private";
}

const notAllowed = () => new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
const defaultPageSize = 100;
/**
 * Named rather than left to `DictionaryLookup`'s own fallback, which is whichever language registered first —
 * true today only because dictionaries are written `[en, ko]`, and nothing keeps it true.
 */
const defaultLanguage = "en";
/**
 * The catalogue is fixed for the life of the process, so the ceiling is how long a client may keep serving a
 * list from a server that has since been redeployed. `private` because the listing is filtered per credential
 * (`filterForAccount`): a shared cache would hand one caller another's view of the shelf.
 */
const listCache: McpCacheHint = { ttlMs: 300_000, cacheScope: "private" };
/** Capabilities name what this build implements — they do not vary by caller and change only with the binary. */
const discoverCache: McpCacheHint = { ttlMs: 3_600_000, cacheScope: "public" };

/**
 * Serves the app's signals as one MCP endpoint.
 *
 * Answers both protocol eras from the same stateless handler. `2026-07-28` is stateless by design; the legacy
 * revisions only *offer* sessions — a server may decline to issue `Mcp-Session-Id`, and a client that never
 * receives one neither sends one back nor asks to resume a stream. So the legacy era costs an `initialize` reply
 * and a laxer `_meta` check, not a session store. (Measured against Claude Code 2.1.226, which speaks it.)
 */
export class McpRouter {
  static readonly logger = new Logger("McpRouter");
  /** Past this a listing is a meaningful slice of a model's window, which is where it becomes worth saying so. */
  static readonly listingWarnBytes = 1000 * 1024;

  readonly #props: McpRouterProps;
  readonly #dispatcher: McpDispatcher;
  readonly #auth: McpAuth;
  readonly #limiter: McpRateLimiter | null;
  #document: McpDocument | null = null;

  constructor(props: McpRouterProps) {
    this.#props = props;
    // Resolved here rather than left to each side's own default, so a domain error a call fails with reads in the
    // language its tool was described in.
    // A client validates `structuredContent` only against a declared `outputSchema`; with none declared the text
    // block is the result, so `outputSchema: "none"` keeps it whatever `legacyTextBlock` said.
    const legacyTextBlock = props.outputSchema === "none" ? undefined : props.legacyTextBlock;
    this.#dispatcher = new McpDispatcher({ ...props, legacyTextBlock, language: props.language ?? defaultLanguage });
    this.#auth = new McpAuth({ ...props.auth, path: props.path ?? "/mcp" });
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
        // Neither era has a server-opened stream or a session to delete here, so both verbs are simply absent.
        // Answered through `#cors` like every other response: a browser-hosted client that probes the legacy
        // GET stream reads an unlabelled network error otherwise, and cannot tell "wrong verb" from "refused".
        GET: (req: Request) => this.#cors(req, notAllowed()),
        DELETE: (req: Request) => this.#cors(req, notAllowed()),
      },
      ...this.#auth.createRoutes(),
    };
  }

  /**
   * Says once, at boot, what this build actually published — and names every endpoint that was kept out.
   *
   * The rejections are fail-closed by design: an endpoint MCP cannot carry, or whose guards do not admit it, is
   * simply not in the catalogue. That is the right default and the wrong silence, and it matters more now that
   * exposure follows the guards — nobody wrote an opt-in whose absence would explain a missing tool, so this log
   * is the only place the answer exists. A refusal turns on a resolved return type and a resolved guard list, so
   * it reads only from here.
   *
   * An entry published with no description rides here for the same reason: the text every generated entry borrows
   * is a *model* `.desc()`, which no source rule would read as that entry's description. This holds the resolved
   * catalogue, so it can simply look.
   *
   * Called by whatever mounts the router rather than from `createRoutes`, so building a router to answer one
   * request — which tests and tooling do — does not narrate a catalogue nobody asked about.
   */
  report() {
    try {
      const document = this.#getDocument();
      const { tools, resourceTemplates, refusals, undescribed } = document;
      const cost = document.listingCost;
      const counts = `tools=${tools.length} resourceTemplates=${resourceTemplates.length}`;
      const readOnly = this.#props.readOnly ? " (read-only deployment)" : "";
      McpRouter.logger.debug(`MCP catalogue: ${counts}${readOnly} · listing ${McpRouter.#kb(cost.bytes)}`);
      if (cost.bySignal.length) McpRouter.logger.debug(`MCP catalogue cost: ${McpRouter.#costLine(cost.bySignal)}`);
      if (this.#limiter) McpRouter.logger.debug(`MCP rate limit: ${this.#limiter.describe()}`);
      else McpRouter.logger.warn("MCP rate limit is off: an authenticated agent may call tools as fast as it likes.");
      // A catalogue nobody can see the size of is one nobody narrows. Every entry inlines the schema of every
      // model it mentions, so this grows with models × generated entries and is spent by every agent that
      // connects, before its first turn.
      if (cost.bytes > McpRouter.listingWarnBytes)
        McpRouter.logger.warn(
          `MCP listing is ${McpRouter.#kb(cost.bytes)}, which every agent that connects pays before its first turn. Narrow it with \`mcp: false\` on an endpoint or the \`mcp\` map on \`slice()\`.`,
        );
      if (this.#props.outputSchema === "none" && this.#props.legacyTextBlock === false)
        McpRouter.logger.warn(
          '`outputSchema: "none"` keeps the text block on: a client reads `structuredContent` only against a declared schema, so `legacyTextBlock: false` would hand it nothing.',
        );
      // Exposure follows the guards, so an empty catalogue on an app that has endpoints means every one of them
      // was refused — the lines below say which rule took each.
      if (!tools.length)
        McpRouter.logger.warn(
          "MCP is enabled but published nothing. Every candidate was refused; see the reasons below.",
        );
      this.#reportPagePrompts();
      this.#reportUnverifiable(tools.map((tool) => tool.name));
      for (const { key, reason } of refusals) McpRouter.logger.verbose(`MCP did not expose "${key}": ${reason}`);
      for (const { key, reason } of undescribed)
        McpRouter.logger.warn(`MCP exposed "${key}" with no description: ${reason}`);
    } catch (error) {
      // This is the only thing that builds the catalogue early, so a failure here must not be what stops a server
      // from booting. Nothing was cached, so the first request rebuilds it and raises this properly.
      McpRouter.logger.warn(
        `MCP catalogue could not be built at boot: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * A guarded tool is only reachable with a credential, and this server can neither issue one nor check one unless
   * something configured `auth`. Left silent, the shelf lists tools no client can ever call and a forged token
   * reads as anonymous — so it is said once at boot, and said louder anywhere but a developer's machine.
   */
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

  /** The heaviest signals first, capped: a fleet of forty models would otherwise wrap the line off the screen. */
  static #costLine(bySignal: McpSignalCost[]) {
    const shown = bySignal.slice(0, 8);
    const rest = bySignal.length - shown.length;
    const line = shown
      .map(({ refName, entries, bytes }) => `${refName} ${entries}/${McpRouter.#kb(bytes)}`)
      .join(" · ");
    return rest > 0 ? `${line} · +${rest} more` : line;
  }

  /** Rebuilding per request would re-derive every tool schema on a list agents poll; the set is fixed at boot. */
  #getDocument() {
    if (this.#document) return this.#document;
    const lookup = new DictionaryLookup(this.#props.language ?? defaultLanguage);
    this.#document = new McpDocument(FetchSerializer.serializeRegistry(this.#props.live).signal, {
      resolveDescription: (key) => lookup.text(key),
      readOnly: this.#props.readOnly,
      outputSchema: this.#props.outputSchema,
    });
    return this.#document;
  }

  async #post(req: Request) {
    if (!this.#originAllowed(req)) return new Response("Forbidden", { status: 403 });
    // The spec admits one credential, the `Authorization` header. A cookie that reached the account middleware
    // would let a same-site page drive `tools/call` on the visitor's ambient session — the request class every
    // mutation is shielded from by `CrossSiteGuard`, which this route never passes through. Deleted on the request
    // itself rather than on a copy so the `BunRequest` keeps its peer address and `req.cookies` reads empty.
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
    // Era is decided by the modern version key specifically, not by `_meta` at all: legacy `_meta` exists too
    // (it carries `progressToken`), and reading that as modern would reject a correct legacy request.
    const meta = McpRouter.#meta(params);
    const era: McpEra = method !== "initialize" && meta && MCP_META_PROTOCOL_VERSION in meta ? "modern" : "legacy";
    const rejection = era === "modern" ? McpRouter.#validateModern(req, method, params, meta ?? {}, id) : null;
    if (rejection) return rejection;

    try {
      return await this.#dispatch({ id, method, params, era, req });
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
        // Legacy only. No `Mcp-Session-Id` is issued, which is what keeps this handler stateless.
        return this.#result(call, {
          protocolVersion: McpRouter.#negotiate(call.params.protocolVersion),
          capabilities: this.#capabilities(document),
          serverInfo: this.#serverInfo(),
          ...(this.#props.instructions ? { instructions: this.#props.instructions } : {}),
        });
      case "ping":
        // Both eras keep it, and a client that uses it as a liveness check reads a `-32601` as a dead connection.
        return this.#result(call, {});
      case "server/discover":
        return this.#result(
          call,
          {
            supportedVersions: MCP_SUPPORTED_VERSIONS,
            capabilities: this.#capabilities(document),
            ...(this.#props.instructions ? { instructions: this.#props.instructions } : {}),
          },
          discoverCache,
        );
      case "tools/list":
        return await this.#list(call, "tools", document.tools);
      case "resources/list":
        return await this.#list(call, "resources", document.resources);
      case "resources/templates/list":
        return await this.#list(call, "resourceTemplates", document.resourceTemplates);
      case "prompts/list":
        return await this.#list(call, "prompts", (await this.#pagePromptEntries()).map(McpRouter.#promptOf));
      case "tools/call": {
        const slot = await this.#acquire(call);
        return "refused" in slot ? slot.refused : await this.#toolsCall(call, document, slot.release);
      }
      case "prompts/get": {
        const slot = await this.#acquire(call);
        if ("refused" in slot) return slot.refused;
        try {
          return await this.#promptsGet(call, document);
        } finally {
          slot.release();
        }
      }
      case "resources/read": {
        const slot = await this.#acquire(call);
        if ("refused" in slot) return slot.refused;
        try {
          return await this.#resourcesRead(call, document);
        } finally {
          slot.release();
        }
      }
      default:
        // The 404 is a modern-era rule: it exists so a client can tell an MCP server's "no such method" from a
        // proxy's "no such path". The legacy era spends that status on something else entirely — a 404 there means
        // the session is gone and the client must start a new one — so answering a legacy client with one invites
        // it to re-handshake in a loop over a method that will still not exist. It reads the JSON-RPC error at 200.
        return McpRouter.#error(call.id, McpErrorCode.methodNotFound, McpRouter.#methodNotFound(call.method), {
          status: call.era === "modern" ? 404 : 200,
        });
    }
  }

  /** Filter first, then page: an offset has to address the list the caller can actually see. */
  async #list<T extends { name: string }>(call: McpCall, key: string, items: T[]) {
    const visible = await this.#dispatcher.filterForAccount(items, call.req);
    const page = McpRouter.#page(visible, call.params.cursor, this.#props.pageSize ?? defaultPageSize);
    if (!page) return McpRouter.#error(call.id, McpErrorCode.invalidParams, "Invalid cursor.");
    const result = { [key]: page.items, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) };
    return this.#result(call, result, listCache);
  }

  /**
   * Counted before the tool is even looked up, so a loop over an unknown name is a loop this stops too. The 429
   * carries a JSON-RPC body like every other envelope-level refusal, and `Retry-After` because a client that
   * backs off by that header is the one behaviour a limit is asking for.
   */
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

  /** `release` frees the caller's in-flight slot: at the answer here, or when a streamed call settles. */
  async #toolsCall(call: McpCall, document: McpDocument, release: () => void) {
    let streaming = false;
    try {
      const name = call.params.name;
      if (typeof name !== "string") return McpRouter.#error(call.id, McpErrorCode.invalidParams, "Missing tool name.");
      const exposed = document.findTool(name);
      // Unknown and not-exposed deliberately land on the same message: an endpoint that opted out must be
      // indistinguishable from one that does not exist, or the error itself enumerates the private surface.
      if (!exposed) return McpRouter.#error(call.id, McpErrorCode.invalidParams, `Unknown tool: ${name}.`);
      const args = McpRouter.#arguments(call.params);
      if (!args) return McpRouter.#error(call.id, McpErrorCode.invalidParams, McpRouter.#badArguments);
      const progressToken = McpRouter.#progressToken(call);
      if (progressToken === undefined) return this.#result(call, await this.#dispatcher.call(exposed, args, call.req));
      streaming = true;
      return await this.#streamedToolCall(call, exposed, args, progressToken, release);
    } finally {
      if (!streaming) release();
    }
  }

  /**
   * Runs the tool and only commits to a stream once it actually reports progress.
   *
   * Deciding late is what keeps the failure modes intact: an HTTP status is fixed the moment the response is
   * returned, so a call that opened a stream up front could no longer answer 401 with a `WWW-Authenticate`
   * challenge. Guards run before an endpoint body can report anything, so by the time this switches to SSE the
   * authorization decision has already been made — which is why the streamed path below need not carry one.
   */
  async #streamedToolCall(
    call: McpCall,
    exposed: McpExposedEndpoint,
    args: Record<string, unknown>,
    progressToken: string | number,
    release: () => void,
  ) {
    const channel = new McpProgress();
    const settled = McpProgress.run(channel, async () => await this.#dispatcher.call(exposed, args, call.req))
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
    // The response is already on its way back, so the pump outlives this call and has nowhere left to throw.
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
      // A tool failure comes back as an `isError` result, and the one error the dispatcher rethrows is raised by
      // its guards — before any progress could have been reported. So this branch should be unreachable, and is
      // here because "should be" is not a thing to leave a client hanging on.
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

  /**
   * `arguments` is an object or it is not there at all; anything else is the caller's own mistake and is reported
   * as one. Coercing it to `{}` ran the call with every argument missing — a tool that takes none then simply
   * succeeded, and one that takes some answered "Missing required argument", which sends a model looking for a
   * value it did send. An array is refused with the rest: MCP names its arguments, and positional ones would
   * silently be read as the properties `0`, `1`, `2`.
   */
  static #arguments(params: Record<string, unknown>) {
    const args = params.arguments;
    if (args === undefined || args === null) return {};
    if (typeof args !== "object" || Array.isArray(args)) return null;
    return args as Record<string, unknown>;
  }

  /**
   * Derived from the catalogue rather than fixed, so a server with nothing to list does not invite a listing that
   * can only come back empty. Read from the unfiltered document on purpose: a capability says what this build
   * implements, and one that narrowed per credential would contradict itself across a cached handshake. Prompts
   * are the pages', so the capability follows whether there are pages to ask — the RSC worker answers the count.
   */
  #capabilities(document: McpDocument) {
    return {
      ...(document.tools.length ? { tools: {} } : {}),
      ...(document.resources.length || document.resourceTemplates.length ? { resources: {} } : {}),
      ...(this.#props.pagePrompts ? { prompts: {} } : {}),
    };
  }

  /**
   * Pages load lazily in the RSC worker, so the prompt catalogue is read once the worker is up rather than built
   * here at boot; the line lands in the same log a little after the tool counts.
   */
  #reportPagePrompts() {
    const source = this.#props.pagePrompts;
    if (!source) return;
    void source
      .list()
      .then((entries) => {
        const names = entries.map((entry) => entry.name).join(", ");
        McpRouter.logger.debug(`MCP page prompts: ${entries.length}${entries.length ? ` (${names})` : ""}`);
      })
      .catch((error: unknown) => {
        McpRouter.logger.warn(
          `MCP page prompts could not be listed: ${error instanceof Error ? error.message : error}`,
        );
      });
  }

  async #pagePromptEntries(): Promise<PagePromptEntry[]> {
    return (await this.#props.pagePrompts?.list()) ?? [];
  }

  static #promptOf({ name, description, arguments: args }: PagePromptEntry): McpPrompt {
    return { name, description, ...(args.length ? { arguments: args } : {}) };
  }

  /** Only the credential travels into the page run: the page decides with it exactly as a browser tab would. */
  static #forwardedHeaders(req: Request): [string, string][] {
    const authorization = req.headers.get("authorization");
    return authorization ? [["authorization", authorization]] : [];
  }

  /**
   * A client asks for progress by naming a token, and can only receive it over a stream — so both have to be
   * true. Only `tools/call` is offered one: a listing is served from memory, and a prompt is a user-triggered
   * read that a client renders as a slash command rather than something it watches run.
   */
  static #progressToken(call: McpCall) {
    if (!call.req.headers.get("accept")?.includes("text/event-stream")) return undefined;
    const token = McpRouter.#meta(call.params)?.progressToken;
    return typeof token === "string" || typeof token === "number" ? token : undefined;
  }

  /**
   * A prompt is a screen: the page named by `page().prompt()` runs in the RSC worker with the caller's token, and
   * what it fetched comes back as the messages. A missing required argument is answered with a pointer to the tool
   * that finds the id rather than with a guess — a prompt cannot re-run itself, so a guess would go unused.
   */
  async #promptsGet(call: McpCall, document: McpDocument) {
    const name = call.params.name;
    if (typeof name !== "string") return McpRouter.#error(call.id, McpErrorCode.invalidParams, "Missing prompt name.");
    const source = this.#props.pagePrompts;
    const entry = source ? (await source.list()).find((candidate) => candidate.name === name) : undefined;
    if (!source || !entry) return McpRouter.#error(call.id, McpErrorCode.invalidParams, `Unknown prompt: ${name}.`);
    const args = McpRouter.#arguments(call.params);
    if (!args) return McpRouter.#error(call.id, McpErrorCode.invalidParams, McpRouter.#badArguments);
    const strings = Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)]));
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
    if (missing.length)
      return this.#result(call, { description: entry.description, messages: composer.missing(entry, missing) });
    const run = await source.run({
      name,
      arguments: strings,
      headers: McpRouter.#forwardedHeaders(call.req),
      language: this.#props.language,
    });
    if (!run.ok) {
      // A redirect is the page's own sign-in gate, and a 401/403 from a query inside the body is a guard's. With no
      // credential the client is told to get one, the same way a guarded tool tells it; with one, the account
      // simply may not see this screen — and the answer says no more than that, so an id is never confirmed.
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
      return McpRouter.#error(call.id, McpErrorCode.invalidParams, message);
    }
    return this.#result(call, { description: entry.description, messages: await composer.compose(entry, run) });
  }

  async #resourcesRead(call: McpCall, document: McpDocument) {
    const uri = call.params.uri;
    if (typeof uri !== "string") return McpRouter.#error(call.id, McpErrorCode.invalidParams, "Missing resource uri.");
    const resolved = document.resolveResource(uri);
    if (!resolved) return McpRouter.#error(call.id, McpErrorCode.invalidParams, `Unknown resource: ${uri}.`);
    const result = await this.#dispatcher.call(resolved.exposed, resolved.args, call.req);
    // An unreadable resource must be an explicit error rather than an empty `contents` array, which a client
    // would read as "this exists and is empty".
    if (result.isError)
      return McpRouter.#error(call.id, McpErrorCode.invalidParams, result.content[0]?.text ?? "Read failed.");
    // `ReadResourceResult` has no `structuredContent`, so the pointer `legacyTextBlock: false` leaves in a tool's
    // text block would name a field this reply cannot have; the text is the resource's only channel.
    const text =
      result.structuredContent === undefined
        ? (result.content[0]?.text ?? "null")
        : JSON.stringify(result.structuredContent);
    return this.#result(call, { contents: [{ uri, mimeType: "application/json", text }] });
  }

  /**
   * Cross-origin gate. MCP clients are not browsers and normally send no `Origin` at all, so absence is allowed;
   * a present one has to name this server or an explicitly configured peer.
   *
   * Matching against our own host stops a page served from somewhere else, and that is all it stops — a rebinding
   * attack points its *own* name at this server, so the `Origin` it sends and the host it arrives on agree and it
   * passes. `allowedOrigins` is the list that actually decides who may drive this server from a browser; leave it
   * unset unless a browser-hosted client needs it.
   */
  #originAllowed(req: Request) {
    const origin = req.headers.get("origin");
    if (!origin) return true;
    if ((this.#props.allowedOrigins ?? []).includes(origin)) return true;
    try {
      // The *public* host, for the same reason the resource identifier uses it: behind a proxy `req.url` names
      // the internal child that was dialed, so a browser client whose `Origin` is the public URL — the only
      // caller that sends one — would be refused on every request. With a configured resource the host is that
      // URL's, and a forwarded header no longer decides who is same-origin.
      return new URL(origin).host === new URL(this.#auth.publicOrigin(req)).host;
    } catch {
      return false;
    }
  }

  /**
   * Answers the preflight a browser-hosted client is forced to make. `content-type: application/json` and the
   * `mcp-*` mirror headers each put the call past the simple-request bar, so without this the request never
   * leaves the browser and `allowedOrigins` grants nothing it can use.
   *
   * The requested header list is echoed rather than fixed: the decision that matters is the origin, and a fixed
   * list only breaks clients that send one more header than we predicted.
   */
  #preflight(req: Request) {
    if (!req.headers.get("origin") || !this.#originAllowed(req)) return new Response("Forbidden", { status: 403 });
    return this.#cors(
      req,
      new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers":
            req.headers.get("access-control-request-headers") ?? "authorization, content-type",
          "access-control-max-age": "600",
        },
      }),
    );
  }

  /**
   * Grants the one origin that already passed `#originAllowed`, so the rebinding defence stays exactly as wide
   * as it was. Never `access-control-allow-credentials`: an MCP client presents its bearer token in a header it
   * sets deliberately, and allowing ambient cookies is what would turn a permitted origin into one that can ride
   * a signed-in user's session.
   */
  #cors(req: Request, res: Response) {
    const origin = req.headers.get("origin");
    if (!origin || !this.#originAllowed(req)) return res;
    res.headers.set("access-control-allow-origin", origin);
    res.headers.set("vary", "origin");
    return res;
  }

  #serverInfo() {
    const env = getEnv();
    return { name: `${env.appName}-mcp`, version: this.#props.version ?? "0.0.0" };
  }

  #result(call: McpCall, result: object, cache?: McpCacheHint) {
    return Response.json(this.#envelope(call, result, cache));
  }

  #envelope(call: McpCall, result: object, cache?: McpCacheHint) {
    // `resultType`, the server-info `_meta` and the cache hints are modern-era fields. A legacy client would
    // ignore them, but emitting only what an era defines keeps the two wire formats separable in a capture —
    // and `nextCursor`, which both eras define, travels inside `result` either way.
    const meta =
      call.era === "modern"
        ? { resultType: "complete", _meta: { [MCP_META_SERVER_INFO]: this.#serverInfo() }, ...cache }
        : {};
    return { jsonrpc: "2.0", id: call.id, result: { ...meta, ...result } };
  }

  /**
   * The cursor is an offset into the filtered list, base64url-wrapped so a client treats it as opaque rather
   * than arithmetic it may do itself. The catalogue is built once at boot, so an offset stays meaningful for the
   * life of the process; one minted by an earlier process may address a position that no longer exists, and that
   * is refused rather than clamped — a silently shortened page reads as "the list ends here".
   */
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
    // `Number("")` is 0, so an empty cursor — or one whose base64url decodes to nothing — would silently read
    // as "start from the beginning" and hand a client that corrupted its cursor page one again, forever.
    if (!decoded) return null;
    const offset = Number(decoded);
    return Number.isInteger(offset) && offset >= 0 ? offset : null;
  }

  static #meta(params: Record<string, unknown>) {
    const meta = params._meta;
    return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  }

  /**
   * Legacy clients propose a version; answer with theirs when we speak it, and otherwise with whichever end of our
   * list they are likelier to accept.
   *
   * A client proposes the newest revision *it* speaks, so an unknown proposal is either newer than everything here
   * — in which case the newest we have is the closest thing it may still know — or older than everything here, in
   * which case the newest is hopeless and the oldest is the only candidate. The spec's "SHOULD be the latest
   * version supported by the server" covers the first case and would strand the second, which is the one an old
   * client is actually in. Revision names are ISO dates, so they order as strings.
   */
  static #negotiate(requested: unknown) {
    if (typeof requested !== "string") return MCP_LEGACY_VERSION;
    if (MCP_SUPPORTED_VERSIONS.includes(requested as (typeof MCP_SUPPORTED_VERSIONS)[number])) return requested;
    const [newest] = MCP_SUPPORTED_VERSIONS;
    return requested > newest ? newest : MCP_SUPPORTED_VERSIONS[MCP_SUPPORTED_VERSIONS.length - 1];
  }

  /** Legacy clients have no way to fall forward, so the one diagnostic they get is this message. */
  static #methodNotFound(method: string) {
    return `Method not found: ${method}. This server speaks MCP ${MCP_SUPPORTED_VERSIONS.join(", ")}.`;
  }

  /**
   * Modern requests mirror parts of the body into headers so a proxy can route and audit without parsing JSON.
   * A mismatch is rejected rather than resolved in the body's favour: whatever a gateway in front of us allowed
   * was decided from the header, so honouring a body that disagrees is how that check gets bypassed. A mirror
   * that is simply absent is refused on the same ground — see `#headerMismatch`.
   */
  static #validateModern(
    req: Request,
    method: string,
    params: Record<string, unknown>,
    meta: Record<string, unknown>,
    id: string | number | null,
  ) {
    const version = meta[MCP_META_PROTOCOL_VERSION];
    if (typeof version !== "string" || !(MCP_META_CLIENT_CAPABILITIES in meta))
      return McpRouter.#error(id, McpErrorCode.invalidParams, "Missing required `_meta` fields.", { status: 400 });
    if (!MCP_SUPPORTED_VERSIONS.includes(version as (typeof MCP_SUPPORTED_VERSIONS)[number]))
      return McpRouter.#error(id, McpErrorCode.unsupportedProtocolVersion, "Unsupported protocol version.", {
        status: 400,
        data: { requested: version, supported: MCP_SUPPORTED_VERSIONS },
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
    // Absence is refused with contradiction, because they bypass the same check. A gateway policy is written as
    // "deny when `mcp-method` is tools/call", and a rule keyed on a header does not fire for a request that left
    // the header out — so tolerating absence hands back exactly what rejecting a mismatch was protecting. The
    // modern era requires the mirror on every POST, and only a request that declared itself modern reaches here.
    if (raw === null) return `Header \`${header}\` is required by this protocol version and was not sent.`;
    return McpRouter.#decodeHeader(raw) === expected ? undefined : `Header \`${header}\` does not match the body.`;
  }

  /** Values that are not ASCII-safe travel wrapped in a lowercase base64 sentinel: `=?base64?…?=`. */
  static #decodeHeader(value: string) {
    if (!value.startsWith("=?base64?") || !value.endsWith("?=")) return value;
    try {
      return Buffer.from(value.slice(9, -2), "base64").toString("utf8");
    } catch {
      return value;
    }
  }

  /**
   * A JSON-RPC error body is what tells a client that a 400 or 404 came from an MCP server rather than from a
   * proxy in front of it, so the status never travels alone. Tool-level failures stay at 200 and are carried in
   * the JSON-RPC error itself; only envelope problems escalate to an HTTP status.
   */
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
