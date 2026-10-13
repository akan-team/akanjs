"use client";
import { type ErrorResponsePayload, type FetchBridge, type FetchBridgeCall, restoreRemoteError } from "akanjs/fetch";
import { MCP_APP_META, type McpAppSnapshotRecord, type McpToolResult } from "../signal/mcp/mcpProtocol";
import type { McpAppBridge } from "./McpAppBridge";

// The first read of each query the page run already made is answered from its snapshot, so the first paint costs
// the host no round trip; every later read (a refetch, a page change) goes to the server.
export class McpAppFetchBridge implements FetchBridge {
  static readonly callTimeoutMs = 30_000;

  readonly #bridge: McpAppBridge;
  readonly #seeded: Map<string, unknown>;

  constructor(bridge: McpAppBridge, snapshot: McpAppSnapshotRecord[]) {
    this.#bridge = bridge;
    this.#seeded = new Map(
      snapshot.map((record) => [McpAppFetchBridge.#callKey(record.key, record.args), record.value]),
    );
  }

  async call(request: FetchBridgeCall) {
    const callKey = McpAppFetchBridge.#callKey(request.key, request.args);
    if (request.type === "query" && this.#seeded.has(callKey)) {
      const value = this.#seeded.get(callKey);
      this.#seeded.delete(callKey);
      return value;
    }
    const args = McpAppFetchBridge.#defined(request.args);
    const result = await this.#bridge.callTool(request.key, args, {
      timeoutMs: McpAppFetchBridge.#deadlineOf(request),
    });
    return McpAppFetchBridge.#valueOf(request, result);
  }

  // A view call carries the browser's value in `_meta`; the masked text is the fallback for a host that strips it.
  static #valueOf({ key, returns }: FetchBridgeCall, result: Partial<McpToolResult>) {
    const text = result.content?.find((block) => block.type === "text")?.text ?? "";
    const failure = result._meta?.[MCP_APP_META.error] as ErrorResponsePayload | undefined;
    if (result.isError && failure?.error) throw restoreRemoteError(failure, failure.statusCode ?? 400);
    if (result.isError) throw new Error(text || `${key} failed`);
    if (result._meta && MCP_APP_META.value in result._meta) return result._meta[MCP_APP_META.value];
    const structured = result.structuredContent as Record<string, unknown> | undefined;
    if (structured !== undefined) return returns.arrDepth ? structured.items : structured;
    if (returns.nullable && text === "null") return null;
    const parsed = returns.modelType || returns.arrDepth || ["Int", "Float", "Boolean"].includes(returns.refName);
    return parsed ? (JSON.parse(text) as unknown) : text;
  }

  //? The server reads an absent argument as null, and refuses an `Any` one by name whatever its value.
  static #defined(args: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined && value !== null));
  }

  //? A budget reads as an HTTP call's does: `false`, zero or a non-finite one sets no deadline.
  static #deadlineOf(request: FetchBridgeCall) {
    const timeout = "timeout" in request ? request.timeout : undefined;
    if (timeout === undefined || timeout === null) return McpAppFetchBridge.callTimeoutMs;
    return typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0 ? timeout : undefined;
  }

  static #callKey(key: string, args: Record<string, unknown>) {
    const sorted = Object.keys(args)
      .filter((name) => args[name] !== undefined && args[name] !== null)
      .sort()
      .map((name) => [name, args[name]]);
    return `${key}:${JSON.stringify(sorted)}`;
  }
}
