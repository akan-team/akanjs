// `2026-07-28` is stateless (no `initialize`, session id or server stream). A legacy server may decline to issue
// `Mcp-Session-Id`, so both legacy revisions — wire-identical for this POST-only surface — share the same handler.
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

/** MCP Apps (SEP-1865): a tool names a `ui://` resource, and a host that speaks the extension renders it in an iframe. */
export const MCP_UI_EXTENSION = `${MCP_META_PREFIX}ui`;
export const MCP_UI_MIME_TYPE = "text/html;profile=mcp-app";
//? Deprecated flat spelling of `_meta.ui.resourceUri`; the official SDK still writes both, and some hosts read only it.
export const MCP_UI_LEGACY_RESOURCE_URI = "ui/resourceUri";

// This framework's own wire between its server and the view it renders: `_meta` is the one part of a result no host
// hands to the model.
export const MCP_APP_META = {
  snapshot: "akanjs/snapshot",
  account: "akanjs/account",
  view: "akanjs/view",
  value: "akanjs/value",
  error: "akanjs/error",
} as const;

export interface McpAppSnapshotRecord {
  key: string;
  args: Record<string, unknown>;
  value: unknown;
}

// `-32020`..`-32099` is reserved by the spec; `-32021` is left out because this server requires no client capability.
// `-32002` (resource not found) is retired in the modern revision: an unknown resource is `invalidParams`.
export const McpErrorCode = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  /** Implementation-defined (`-32000`..`-32019` is what JSON-RPC leaves to a server below MCP's reserved band). */
  rateLimited: -32010,
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

export interface McpJsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type McpJsonRpcMessage = McpJsonRpcRequest & Partial<McpJsonRpcResponse>;

export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** `model` lists the tool to the model, `app` lets a rendered view call it; a host enforces both. */
export type McpUiVisibility = "model" | "app";

export interface McpToolUiMeta {
  resourceUri?: string;
  visibility?: McpUiVisibility[];
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: McpToolAnnotations;
  _meta?: { ui?: McpToolUiMeta; [MCP_UI_LEGACY_RESOURCE_URI]?: string };
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
  _meta?: Record<string, unknown>;
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/** User-controlled: a client offers it as a slash command, so a person reads its `title` and `description`. */
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

export interface McpImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface McpToolResult {
  content: (McpTextContent | McpImageContent)[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export interface McpResourceContents {
  uri: string;
  mimeType: string;
  text: string;
  _meta?: Record<string, unknown>;
}
