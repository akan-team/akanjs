/**
 * Wire vocabulary for the MCP revisions this server answers.
 *
 * `2026-07-28` made the protocol stateless — no `initialize`, no session id, no server-opened stream — which is
 * what makes a single `POST /mcp` route sufficient. Everything before it is the *legacy* era, still what shipping
 * clients speak (measured: Claude Code 2.1.226 negotiates `2025-11-25`), and supporting it costs almost nothing
 * here because a legacy server *may* decline to issue `Mcp-Session-Id`: without one the client sends no session
 * header and never asks to resume a stream, so both eras run over the same stateless handler.
 *
 * `2025-06-18` is listed for the same reason. The surface this server actually implements — POST-only Streamable
 * HTTP, no sessions, no server-initiated requests — is wire-identical between the two legacy revisions, and a
 * client that proposes a version the server does not list is told to disconnect. Naming only the one revision that
 * was measured turned "we tested against this" into "we refuse everything else".
 */
export const MCP_MODERN_VERSION = "2026-07-28";
export const MCP_LEGACY_VERSION = "2025-11-25";
export const MCP_LEGACY_PRIOR_VERSION = "2025-06-18";
/** Newest first — `server/discover` and `initialize` both answer with this order, and `#negotiate` reads the ends. */
export const MCP_SUPPORTED_VERSIONS = [MCP_MODERN_VERSION, MCP_LEGACY_VERSION, MCP_LEGACY_PRIOR_VERSION] as const;
export type McpProtocolVersion = (typeof MCP_SUPPORTED_VERSIONS)[number];

export type McpEra = "modern" | "legacy";

export const MCP_META_PREFIX = "io.modelcontextprotocol/";
export const MCP_META_PROTOCOL_VERSION = `${MCP_META_PREFIX}protocolVersion`;
export const MCP_META_CLIENT_CAPABILITIES = `${MCP_META_PREFIX}clientCapabilities`;
export const MCP_META_CLIENT_INFO = `${MCP_META_PREFIX}clientInfo`;
export const MCP_META_SERVER_INFO = `${MCP_META_PREFIX}serverInfo`;

/**
 * `-32020`..`-32099` is reserved by the spec, so nothing outside this table may be minted in that band.
 * `-32002` (resource not found) is retired in the modern revision; unknown resources are `invalidParams`.
 *
 * The band also defines `-32021 missingRequiredClientCapability`, which is absent because this server requires
 * none: it never samples, elicits, or reads roots. It belongs here the day one of those appears, not before — a
 * constant nothing emits reads as a check someone forgot to write.
 */
export const McpErrorCode = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  headerMismatch: -32020,
  unsupportedProtocolVersion: -32022,
} as const;
export type McpErrorCodeValue = (typeof McpErrorCode)[keyof typeof McpErrorCode];

export interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: McpToolAnnotations;
}

export interface McpResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface McpResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * A prompt is user-controlled — the client offers it as a slash command and the model never invokes it — so its
 * `title` and `description` are read by a person, not inferred from a schema the way a tool's are.
 */
export interface McpPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpToolResult {
  content: McpTextContent[];
  structuredContent?: unknown;
  isError?: boolean;
}

export interface McpResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}
