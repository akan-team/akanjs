"use client";
import { getEnv } from "akanjs/base";
import { type FetchBridge, restoreRemoteError } from "akanjs/fetch";
import {
  MCP_APP_META,
  type McpAppSnapshotRecord,
  type McpJsonRpcMessage,
  type McpJsonRpcResponse,
  type McpTool,
  type McpToolResult,
} from "../signal/mcp/mcpProtocol";
import { McpAppFetchBridge } from "./McpAppFetchBridge";

export interface McpAppToolServer {
  list: () => McpTool[];
  call: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<McpToolResult>;
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

export type McpAppStart =
  | { ok: true; href: string; snapshot: McpAppSnapshotRecord[]; account: Record<string, unknown> | null }
  | { ok: false; message: string };

// MCP Apps (SEP-1865): JSON-RPC over postMessage to the host that rendered this view; the host relays to the server.
export class McpAppBridge {
  static readonly protocolVersion = "2026-01-26";
  static readonly initializeTimeoutMs = 15_000;
  static readonly #hostRequests = new Set(["ping", "ui/resource-teardown"]);

  readonly #pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  readonly #contextListeners = new Set<(context: McpHostContext) => void>();
  readonly #toolResult: Promise<Partial<McpToolResult>>;
  #resolveToolResult: (result: Partial<McpToolResult>) => void = () => undefined;
  #context: McpHostContext = {};
  #capabilities: McpHostCapabilities = {};
  #tools: McpAppToolServer | null = null;
  #heldToolRequests: McpJsonRpcMessage[] = [];
  #toolsListed = false;
  readonly #toolCalls = new Map<string | number, AbortController>();
  #seq = 0;

  constructor() {
    this.#toolResult = new Promise((resolve) => {
      this.#resolveToolResult = resolve;
    });
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return;
      const message = event.data as McpJsonRpcMessage | null;
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
      appInfo: { name: getEnv().appName, version: "0" },
    });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), McpAppBridge.initializeTimeoutMs));
    const initialized = (await Promise.race([initialize, timeout]).catch(() => null)) as {
      hostContext?: McpHostContext;
      hostCapabilities?: McpHostCapabilities;
    } | null;
    if (!initialized) return this.#gaveUp("The host did not answer this view.");
    this.#context = { ...initialized.hostContext, ...this.#context };
    this.#capabilities = initialized.hostCapabilities ?? {};
    this.notify("ui/notifications/initialized", {});
    const result = await this.#toolResult;
    const page = (result.structuredContent ?? {}) as { href?: unknown };
    const text = result.content?.find((block) => block.type === "text")?.text;
    if (result.isError || typeof page.href !== "string")
      return this.#gaveUp(text ?? "This screen is not available here.");
    const snapshot = result._meta?.[MCP_APP_META.snapshot];
    const account = result._meta?.[MCP_APP_META.account];
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
    { timeoutMs, timedOut }: { timeoutMs?: number; timedOut?: () => Error } = {},
  ): Promise<unknown> {
    const id = ++this.#seq;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
      if (timeoutMs)
        setTimeout(() => {
          if (!this.#pending.delete(id)) return;
          reject(timedOut?.() ?? new Error(`The host did not answer ${method}`));
        }, timeoutMs);
    });
  }

  notify(method: string, params: Record<string, unknown>) {
    window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
  }

  // `MCP_APP_META.view` asks the server for the value a browser would receive, not the one masked for a model.
  async callTool(name: string, args: Record<string, unknown>, { timeoutMs }: { timeoutMs?: number } = {}) {
    return (await this.request(
      "tools/call",
      { name, arguments: args, _meta: { [MCP_APP_META.view]: true } },
      { timeoutMs, timedOut: McpAppBridge.#timedOut },
    )) as Partial<McpToolResult>;
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

  fetchBridge(snapshot: McpAppSnapshotRecord[]): FetchBridge {
    return new McpAppFetchBridge(this, snapshot);
  }

  //? A host waits on every request it sent, so one held for a screen that will never start is answered with why.
  #gaveUp(message: string): McpAppStart {
    const refuse = () => {
      throw new Error(message);
    };
    this.serveTools({ list: refuse, call: async () => refuse() });
    return { ok: false, message };
  }

  #receive(message: McpJsonRpcMessage) {
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

  #handle({ id, method = "", params = {} }: McpJsonRpcMessage) {
    if (method === "ui/notifications/tool-result") this.#resolveToolResult(params as Partial<McpToolResult>);
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
    let reply: Pick<McpJsonRpcResponse, "result" | "error">;
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

  //? The key an HTTP call that runs out of time restores to, so the app's own `Err` toasts it in the user's language.
  static #timedOut() {
    return restoreRemoteError({ error: "base.error.gatewayTimeout", data: { status: 408 } }, 408);
  }
}
