"use client";
import { type ErrorResponsePayload, type FetchBridge, type FetchBridgeCall, restoreRemoteError } from "akanjs/fetch";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolResultLike {
  content?: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export interface McpAppTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean };
}

export interface McpAppToolServer {
  list: () => McpAppTool[];
  call: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<McpToolResultLike>;
}

export interface McpHostCapabilities {
  openLinks?: object;
  downloadFile?: object;
  updateModelContext?: { text?: object };
  serverTools?: { listChanged?: boolean };
}

export type McpDownloadContent =
  | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } }
  | { type: "resource_link"; uri: string; name: string; mimeType?: string };

export interface McpHostContext {
  theme?: "light" | "dark";
  displayMode?: "inline" | "fullscreen" | "pip";
  locale?: string;
  timeZone?: string;
  containerDimensions?: { width?: number; height?: number; maxWidth?: number; maxHeight?: number };
  styles?: { variables?: Record<string, string | undefined> };
}

interface McpAppSnapshotRecord {
  key: string;
  args: Record<string, unknown>;
  value: unknown;
}

export type McpAppStart =
  | { ok: true; href: string; snapshot: McpAppSnapshotRecord[]; account: Record<string, unknown> | null }
  | { ok: false; message: string };

// MCP Apps (SEP-1865): JSON-RPC over postMessage to the host that rendered this view; the host relays to the server.
// The `akanjs/*` `_meta` keys are this framework's own wire with its server (`McpApps`, `McpDispatcher`).
export class McpAppBridge {
  static readonly protocolVersion = "2026-01-26";
  static readonly initializeTimeoutMs = 15_000;
  static readonly #hostRequests = new Set(["ping", "ui/resource-teardown"]);

  readonly #pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  readonly #contextListeners = new Set<(context: McpHostContext) => void>();
  readonly #toolResult: Promise<McpToolResultLike>;
  #resolveToolResult: (result: McpToolResultLike) => void = () => undefined;
  #context: McpHostContext = {};
  #capabilities: McpHostCapabilities = {};
  #tools: McpAppToolServer | null = null;
  #heldToolRequests: JsonRpcMessage[] = [];
  #toolsListed = false;
  readonly #toolCalls = new Map<string | number, AbortController>();
  #seq = 0;

  constructor() {
    this.#toolResult = new Promise((resolve) => {
      this.#resolveToolResult = resolve;
    });
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const message = event.data as JsonRpcMessage | null;
      if (message?.jsonrpc === "2.0") this.#receive(message);
    });
  }

  get hostContext(): McpHostContext {
    return this.#context;
  }

  get hostCapabilities(): McpHostCapabilities {
    return this.#capabilities;
  }

  /** Whether the host asked for the view's own tools, which is the only sign it offers them to its model. */
  get toolsListed(): boolean {
    return this.#toolsListed;
  }

  async connect(): Promise<McpAppStart> {
    const initialize = this.request("ui/initialize", {
      protocolVersion: McpAppBridge.protocolVersion,
      appCapabilities: { availableDisplayModes: ["inline", "fullscreen"], tools: { listChanged: true } },
      appInfo: { name: process.env.AKAN_PUBLIC_APP_NAME ?? "akan", version: "0" },
    });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), McpAppBridge.initializeTimeoutMs));
    const initialized = (await Promise.race([initialize, timeout]).catch(() => null)) as {
      hostContext?: McpHostContext;
      hostCapabilities?: McpHostCapabilities;
    } | null;
    if (!initialized) return { ok: false, message: "The host did not answer this view." };
    this.#context = { ...initialized.hostContext, ...this.#context };
    this.#capabilities = initialized.hostCapabilities ?? {};
    this.notify("ui/notifications/initialized", {});
    const result = await this.#toolResult;
    const page = (result.structuredContent ?? {}) as { href?: unknown };
    const text = result.content?.find((block) => block.type === "text")?.text;
    if (result.isError || typeof page.href !== "string")
      return { ok: false, message: text ?? "This screen is not available here." };
    const snapshot = result._meta?.["akanjs/snapshot"];
    const account = result._meta?.["akanjs/account"];
    return {
      ok: true,
      href: page.href,
      snapshot: Array.isArray(snapshot) ? (snapshot as McpAppSnapshotRecord[]) : [],
      account: account && typeof account === "object" ? (account as Record<string, unknown>) : null,
    };
  }

  onHostContext(listener: (context: McpHostContext) => void) {
    this.#contextListeners.add(listener);
    return () => this.#contextListeners.delete(listener);
  }

  request(
    method: string,
    params: Record<string, unknown>,
    { timeoutMs }: { timeoutMs?: number } = {},
  ): Promise<unknown> {
    const id = ++this.#seq;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
      if (timeoutMs)
        setTimeout(() => {
          if (!this.#pending.delete(id)) return;
          reject(new Error(`The host did not answer ${method}`));
        }, timeoutMs);
    });
  }

  notify(method: string, params: Record<string, unknown>) {
    window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
  }

  // `akanjs/view` asks the server for the value a browser would receive, not the one masked for a model.
  async callTool(name: string, args: Record<string, unknown>) {
    return (await this.request("tools/call", {
      name,
      arguments: args,
      _meta: { "akanjs/view": true },
    })) as McpToolResultLike;
  }

  async openLink(url: string) {
    const result = (await this.request("ui/open-link", { url })) as { isError?: boolean } | null;
    if (result?.isError) throw new Error(`The host declined to open ${url}`);
  }

  async downloadFile(contents: McpDownloadContent[]) {
    await this.request("ui/download-file", { contents });
  }

  //? Each update replaces the view's previous one in the host, so it carries the whole screen, not a delta.
  async updateModelContext(text: string) {
    await this.request("ui/update-model-context", { content: [{ type: "text", text }] }, { timeoutMs: 10_000 });
  }

  serveTools(server: McpAppToolServer) {
    this.#tools = server;
    const held = this.#heldToolRequests;
    this.#heldToolRequests = [];
    for (const message of held) this.#handle(message);
  }

  toolsChanged() {
    this.notify("notifications/tools/list_changed", {});
  }

  // The first read of each query the page run already made is answered from its snapshot, so the first paint costs
  // the host no round trip; every later read (a refetch, a page change) goes to the server.
  fetchBridge(snapshot: McpAppSnapshotRecord[]): FetchBridge {
    const seeded = new Map(snapshot.map((record) => [McpAppBridge.#callKey(record.key, record.args), record.value]));
    return {
      call: async (request: FetchBridgeCall) => {
        const callKey = McpAppBridge.#callKey(request.key, request.args);
        if (request.type === "query" && seeded.has(callKey)) {
          const value = seeded.get(callKey);
          seeded.delete(callKey);
          return value;
        }
        return McpAppBridge.#valueOf(request, await this.callTool(request.key, McpAppBridge.#defined(request.args)));
      },
    };
  }

  #receive(message: JsonRpcMessage) {
    if (message.method) {
      this.#handle(message);
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }

  #handle({ id, method = "", params = {} }: JsonRpcMessage) {
    if (method === "ui/notifications/tool-result") this.#resolveToolResult(params as McpToolResultLike);
    if (method === "notifications/cancelled") this.#toolCalls.get(params.requestId as string | number)?.abort();
    if (method === "ui/notifications/tool-cancelled")
      this.#resolveToolResult({ isError: true, content: [{ type: "text", text: "The tool call was cancelled." }] });
    //? The spec sends a partial context to merge; a theme sent without styles makes the old theme's styles stale.
    if (method === "ui/notifications/host-context-changed") {
      const changed = params as McpHostContext;
      const { styles, ...kept } = this.#context;
      this.#context = { ...(changed.theme && !changed.styles ? kept : { ...kept, styles }), ...changed };
      for (const listener of this.#contextListeners) listener(this.#context);
    }
    if (id === undefined || id === null) return;
    if (method === "tools/list" || method === "tools/call") {
      //? A host may list right after `initialized`, before the page run that starts the screen has answered.
      if (this.#tools) void this.#answerTool(id, method, params, this.#tools);
      else this.#heldToolRequests.push({ jsonrpc: "2.0", id, method, params });
      return;
    }
    //? A teardown needs only an answer: nothing here holds state to flush.
    const reply = McpAppBridge.#hostRequests.has(method)
      ? { result: {} }
      : { error: { code: -32601, message: `Method not found: ${method}` } };
    window.parent.postMessage({ jsonrpc: "2.0", id, ...reply }, "*");
  }

  //? A cancelled request gets no answer (MCP `notifications/cancelled`); the tool still settles on its own.
  async #answerTool(id: string | number, method: string, params: Record<string, unknown>, tools: McpAppToolServer) {
    const controller = new AbortController();
    let reply: Pick<JsonRpcMessage, "result" | "error">;
    try {
      if (method === "tools/list") {
        this.#toolsListed = true;
        reply = { result: { tools: tools.list() } };
      } else {
        const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
        if (typeof name !== "string") throw new Error("tools/call names no tool");
        const callArgs = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
        this.#toolCalls.set(id, controller);
        reply = { result: await tools.call(name, callArgs, controller.signal) };
      }
    } catch (error) {
      reply = { error: { code: -32603, message: error instanceof Error ? error.message : String(error) } };
    } finally {
      this.#toolCalls.delete(id);
    }
    if (!controller.signal.aborted) window.parent.postMessage({ jsonrpc: "2.0", id, ...reply }, "*");
  }

  // A view call carries the browser's value in `_meta`; the masked text is the fallback for a host that strips it.
  static #valueOf({ key, returns }: FetchBridgeCall, result: McpToolResultLike) {
    const text = result.content?.find((block) => block.type === "text")?.text ?? "";
    const failure = result._meta?.["akanjs/error"] as ErrorResponsePayload | undefined;
    if (result.isError && failure?.error) throw restoreRemoteError(failure, failure.statusCode ?? 400);
    if (result.isError) throw new Error(text || `${key} failed`);
    if (result._meta && "akanjs/value" in result._meta) return result._meta["akanjs/value"];
    const structured = result.structuredContent as Record<string, unknown> | undefined;
    if (structured !== undefined) return returns.arrDepth ? structured.items : structured;
    if (returns.nullable && text === "null") return null;
    const parsed = returns.modelType || returns.arrDepth || ["Int", "Float", "Boolean"].includes(returns.refName);
    return parsed ? (JSON.parse(text) as unknown) : text;
  }

  static #defined(args: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
  }

  static #callKey(key: string, args: Record<string, unknown>) {
    const sorted = Object.keys(args)
      .filter((name) => args[name] !== undefined && args[name] !== null)
      .sort()
      .map((name) => [name, args[name]]);
    return `${key}:${JSON.stringify(sorted)}`;
  }
}
