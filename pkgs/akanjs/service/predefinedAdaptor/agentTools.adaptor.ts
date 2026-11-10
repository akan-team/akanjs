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
}

/**
 * The `/mcp` tool catalogue run in-process as a given account, with the same refusals, masking and error text and
 * `origin` "mcp". Built from the DI registry, so a batch server without `/mcp` has it too. Security: `account` is put
 * on the call after the middleware chain, unchecked — pass one the server resolved, never client input, and resolve
 * a stored one again before reusing it, as a revoked session is not noticed here.
 */
export interface AgentToolsAdaptor {
  listAs(account: unknown, caller?: AgentToolsCaller): Promise<AgentTool[]>;
  /** Never throws for a tool's own failure: a refusal or an error comes back as the result's `error`. */
  callAs(account: unknown, call: AgentWireToolCall, caller?: AgentToolsCaller): Promise<AgentWireToolResult>;
}
