import type { AgentWireTool, AgentWireToolCall, AgentWireToolResult } from "./llm.adaptor";

/** What a call carries besides the account; `/mcp` reads these off its request, an in-process call has none of its own. */
export interface AgentToolsCaller {
  /** Narrows the catalogue to these tool names and never widens it; omitted, every tool the account may see. */
  allow?: readonly string[];
  /** Handed to the endpoint without `authorization`, `cookie` or `origin`: the account is the only identity a call carries. */
  headers?: HeadersInit;
  /** What `getClientIp()` and an ip-scoped rate limit read; omitted, every such call shares the unknown-address budget. */
  ip?: string | null;
}

export interface AgentTool extends AgentWireTool {
  /** A query, which reads and changes nothing. */
  readOnly: boolean;
  /** A mutation MCP marks `destructiveHint`, by its key or its `destructive` option: `agentService.loop` refuses it unless `approve` allows it. */
  needsConfirm?: boolean;
}

/**
 * The `/mcp` tool catalogue run in-process as a given account, with the same refusals, masking and error text and
 * `origin` "mcp", plus every endpoint declared `mcp: "agent"`, which `/mcp` never lists. Built from the DI registry,
 * so a batch server without `/mcp` has it too. Covers the endpoint tools only: a page's `page().app()` tool is listed
 * on `/mcp` but absent here, and `callAs` answers it as an unknown tool.
 * Security: `account` is put on the call after the middleware chain, unchecked — pass one the server resolved, never
 * client input, and resolve a stored one again before reusing it, as a revoked session is not noticed here. Its
 * `machine` field is removed, since only a verified machine token may set one. Both methods throw `InjectError`
 * `notInitialized` until the server has built its endpoints, so neither works from an `onInit`.
 */
export interface AgentToolsAdaptor {
  listAs(account: unknown, caller?: AgentToolsCaller): Promise<AgentTool[]>;
  /** Never throws for a tool's own failure: a refusal or an error comes back as the result's `error` and `code`. */
  callAs(account: unknown, call: AgentWireToolCall, caller?: AgentToolsCaller): Promise<AgentWireToolResult>;
}
