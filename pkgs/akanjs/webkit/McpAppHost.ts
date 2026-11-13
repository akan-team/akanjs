import type { McpJsonRpcMessage, McpToolResult } from "../signal/mcp/mcpProtocol";
import type { McpHostContext } from "./McpAppBridge";

export interface McpAppHostProps {
  /** Delivers a message to the frame that holds the view. */
  post: (message: McpJsonRpcMessage) => void;
  /** The app tool's result as its server answers a view: what the screen starts from. */
  start: () => Promise<Partial<McpToolResult>>;
  /** Relays a call the view makes; the caller decides which server and tools that may reach. */
  callTool: (name: string, args: Record<string, unknown>, signal: AbortSignal) => Promise<Partial<McpToolResult>>;
  /** `false` declines the link. */
  openLink: (url: string) => boolean;
  context: () => McpHostContext;
  onSize?: (height: number) => void;
  name?: string;
}

// The host half of MCP Apps (SEP-1865) for one view: what `McpAppBridge` talks to. Security: every message is the
// view's own script speaking, another server's code, so only the methods below are answered and nothing it sends
// reaches the model: `ui/update-model-context` and the view's own tools are not offered.
export class McpAppHost {
  static readonly protocolVersion = "2026-01-26";
  static readonly maxHeight = 4_000;

  readonly #props: McpAppHostProps;
  readonly #calls = new Map<string | number, AbortController>();
  #started = false;
  #disposed = false;

  constructor(props: McpAppHostProps) {
    this.#props = props;
  }

  receive(data: unknown) {
    if (this.#disposed || !McpAppHost.#isMessage(data) || !data.method) return;
    const { id, method, params = {} } = data;
    if (id === undefined || id === null) this.#notified(method, params);
    else void this.#requested(id, method, params);
  }

  contextChanged() {
    if (this.#started)
      this.#post({ method: "ui/notifications/host-context-changed", params: { ...this.#props.context() } });
  }

  dispose() {
    this.#disposed = true;
    for (const controller of this.#calls.values()) controller.abort();
    this.#calls.clear();
  }

  #notified(method: string, params: Record<string, unknown>) {
    if (method === "ui/notifications/initialized") void this.#start();
    else if (method === "notifications/cancelled") this.#calls.get(params.requestId as string | number)?.abort();
    else if (method === "ui/notifications/size-changed") {
      const { height } = params;
      if (typeof height === "number" && Number.isFinite(height) && height >= 0)
        this.#props.onSize?.(Math.min(Math.ceil(height), McpAppHost.maxHeight));
    }
  }

  async #requested(id: string | number, method: string, params: Record<string, unknown>) {
    if (method === "ui/initialize")
      return this.#post({
        id,
        result: {
          protocolVersion: McpAppHost.protocolVersion,
          hostInfo: { name: this.#props.name ?? "akan", version: "1" },
          hostCapabilities: { openLinks: {} },
          hostContext: this.#props.context(),
        },
      });
    if (method === "ping") return this.#post({ id, result: {} });
    if (method === "ui/open-link") {
      const opened = typeof params.url === "string" && this.#props.openLink(params.url);
      return this.#post({ id, result: opened ? {} : { isError: true } });
    }
    if (method !== "tools/call")
      return this.#post({ id, error: { code: -32601, message: `Method not found: ${method}` } });
    const { name, arguments: args } = params;
    if (typeof name !== "string")
      return this.#post({ id, error: { code: -32602, message: "tools/call names no tool" } });
    const controller = new AbortController();
    this.#calls.set(id, controller);
    try {
      const callArgs =
        args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
      const result = await this.#props.callTool(name, callArgs, controller.signal);
      if (!controller.signal.aborted) this.#post({ id, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!controller.signal.aborted) this.#post({ id, error: { code: -32603, message } });
    } finally {
      this.#calls.delete(id);
    }
  }

  //? Once: a view that announces itself again would otherwise make its server run the screen's reads a second time.
  async #start() {
    if (this.#started) return;
    this.#started = true;
    let result: Partial<McpToolResult>;
    try {
      result = await this.#props.start();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      result = { isError: true, content: [{ type: "text", text }] };
    }
    this.#post({ method: "ui/notifications/tool-result", params: result as Record<string, unknown> });
  }

  #post(message: Omit<McpJsonRpcMessage, "jsonrpc">) {
    if (!this.#disposed) this.#props.post({ jsonrpc: "2.0", ...message } as McpJsonRpcMessage);
  }

  static #isMessage(data: unknown): data is McpJsonRpcMessage {
    if (!data || typeof data !== "object") return false;
    const { jsonrpc, id, method, params } = data as Record<string, unknown>;
    return (
      jsonrpc === "2.0" &&
      (id === undefined || id === null || typeof id === "number" || typeof id === "string") &&
      (method === undefined || typeof method === "string") &&
      (params === undefined || (typeof params === "object" && params !== null && !Array.isArray(params)))
    );
  }
}
