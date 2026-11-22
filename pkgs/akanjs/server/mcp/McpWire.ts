import { McpErrorCode, type McpJsonRpcResponse } from "../../signal/mcp";

export interface McpErrorOptions {
  status?: number;
  data?: unknown;
  headers?: Record<string, string>;
}

export class McpWire {
  static readonly badArguments = "`arguments` must be an object of named values.";

  //? `data.code` tells apart the failures JSON-RPC files under one number, `-32602` above all.
  static coded(code: string) {
    return { data: { code } };
  }

  static readonly invalid = McpWire.coded("invalidArgument");

  static badArgumentsError(id: string | number | null) {
    return McpWire.error(id, McpErrorCode.invalidParams, McpWire.badArguments, McpWire.invalid);
  }

  // Not coerced to `{}`: that ran the call with every argument missing. An array would read as properties "0", "1".
  static arguments(params: Record<string, unknown>) {
    const args = params.arguments;
    if (args === undefined || args === null) return {};
    if (typeof args !== "object" || Array.isArray(args)) return null;
    return args as Record<string, unknown>;
  }

  static meta(params: Record<string, unknown>) {
    const meta = params._meta;
    return meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  }

  // Only tools/call streams progress: listings are served from memory and prompts render as slash commands.
  static progressToken(req: Request, params: Record<string, unknown>) {
    if (!McpWire.acceptsStream(req)) return undefined;
    const token = McpWire.meta(params)?.progressToken;
    return typeof token === "string" || typeof token === "number" ? token : undefined;
  }

  static acceptsStream(req: Request) {
    return !!req.headers.get("accept")?.includes("text/event-stream");
  }

  // An out-of-range cursor (minted by an earlier process) is refused, not clamped: a short page reads as the end.
  static page<T>(items: T[], cursor: unknown, size: number) {
    const offset = McpWire.#offset(cursor);
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
    // `Number("")` is 0: an empty decode would restart a corrupted cursor at page one, forever.
    if (!decoded) return null;
    const offset = Number(decoded);
    return Number.isInteger(offset) && offset >= 0 ? offset : null;
  }

  static headerMismatch(req: Request, header: string, expected: string) {
    const raw = req.headers.get(header);
    // Absence is refused like a mismatch: a gateway rule keyed on the header does not fire for a request omitting it.
    if (raw === null) return `Header \`${header}\` is required by this protocol version and was not sent.`;
    return McpWire.#decodeHeader(raw) === expected ? undefined : `Header \`${header}\` does not match the body.`;
  }

  // Values that are not ASCII-safe travel wrapped in a lowercase base64 sentinel: `=?base64?…?=`.
  static #decodeHeader(value: string) {
    if (!value.startsWith("=?base64?") || !value.endsWith("?=")) return value;
    return Buffer.from(value.slice(9, -2), "base64").toString("utf8");
  }

  // The JSON-RPC body is what tells a client a 4xx came from MCP, not a proxy; tool-level failures stay at 200.
  static error(
    id: string | number | null,
    code: number,
    message: string,
    { status, data, headers }: McpErrorOptions = {},
  ) {
    return Response.json(McpWire.errorBody(id, code, message, data), { status: status ?? 200, headers });
  }

  static errorBody(id: string | number | null, code: number, message: string, data?: unknown) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message, ...(data !== undefined ? { data } : {}) },
    } satisfies McpJsonRpcResponse;
  }
}
