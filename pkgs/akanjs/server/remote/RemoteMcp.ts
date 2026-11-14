import { FailureCode, MCP_FAILURE_META } from "akanjs/common";
import { MCP_UI_EXTENSION, MCP_UI_MIME_TYPE } from "../../signal/mcp/mcpProtocol";
import type { RemoteFetch } from "./RemoteFetch";
import { clipRemoteText, RemoteError } from "./remoteError";

export interface RemoteMcpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  _meta?: Record<string, unknown>;
}

export interface RemoteMcpContent {
  type?: string;
  text?: string;
  resource?: { uri?: string; mimeType?: string; text?: string };
}

export interface RemoteMcpCallResult {
  content: RemoteMcpContent[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError: boolean;
  /** What the server named the failure by: `_meta["akanjs/failure"].code`, or a JSON-RPC error's `data.code`. */
  code?: string;
}

interface JsonRpcAnswer {
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string; data?: unknown };
}

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
}

export interface RemoteMcpOptions {
  clientName?: string;
  /** Per answer; a view's document is far larger than a tool result. */
  maxBytes?: number;
  signal?: AbortSignal;
}

// Streamable HTTP, request and answer only. One instance serves one run of calls under one token.
export class RemoteMcp {
  static readonly protocolVersion = "2025-06-18";
  /** A ceiling on a server that never stops paging; 20 pages is 2,000 tools at an akan server's page size. */
  static readonly maxToolPages = 20;

  readonly #fetcher: RemoteFetch;
  readonly #url: string;
  readonly #token: string | null;
  readonly #options: RemoteMcpOptions;
  #nextId = 0;
  #sessionId: string | undefined;
  #ready: Promise<void> | null = null;

  constructor(fetcher: RemoteFetch, url: string, token: string | null, options: RemoteMcpOptions = {}) {
    this.#fetcher = fetcher;
    this.#url = url;
    this.#token = token;
    this.#options = options;
  }

  /** Every page: `tools/list` pages by `nextCursor`, and one page silently drops the tail. */
  async listTools(): Promise<RemoteMcpTool[]> {
    await this.#initialized();
    const tools: RemoteMcpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < RemoteMcp.maxToolPages; page += 1) {
      const result = RemoteMcp.#resultOf(await this.#call("tools/list", cursor ? { cursor } : {}));
      const listed = Array.isArray(result.tools) ? (result.tools as unknown[]) : [];
      tools.push(...listed.filter(RemoteMcp.#isTool));
      const next = result.nextCursor;
      //? Handing back the cursor it was given is a server that would page forever.
      if (typeof next !== "string" || !next || next === cursor) return tools;
      cursor = next;
    }
    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    meta?: Record<string, unknown>,
  ): Promise<RemoteMcpCallResult> {
    await this.#initialized();
    const answer = await this.#call("tools/call", { name, arguments: args, ...(meta ? { _meta: meta } : {}) });
    if (answer.error)
      return {
        content: [{ type: "text", text: RemoteMcp.#messageOf(answer, "The call failed.") }],
        isError: true,
        ...RemoteMcp.#coded(RemoteMcp.#record(answer.error)?.data),
      };
    const result = answer.result ?? {};
    const isError = result.isError === true;
    const own = RemoteMcp.#record(result._meta);
    return {
      content: Array.isArray(result.content) ? (result.content as unknown[]).filter(RemoteMcp.#isRecord) : [],
      ...(RemoteMcp.#record(result.structuredContent)
        ? { structuredContent: RemoteMcp.#record(result.structuredContent) }
        : {}),
      ...(own ? { _meta: own } : {}),
      isError,
      ...(isError ? RemoteMcp.#coded(own?.[MCP_FAILURE_META]) : {}),
    };
  }

  async readResource(
    uri: string,
    maxBytes?: number,
  ): Promise<{ uri?: string; mimeType?: string; text?: string; _meta?: unknown }[]> {
    await this.#initialized();
    const result = RemoteMcp.#resultOf(await this.#call("resources/read", { uri }, maxBytes));
    return Array.isArray(result.contents) ? (result.contents as unknown[]).filter(RemoteMcp.#isRecord) : [];
  }

  /** The text a model reads: text blocks as they are, anything else named by its type. */
  static textOf(content: readonly RemoteMcpContent[]): string {
    return content
      .map((part) => (part.type === "text" ? (part.text ?? "") : `[${part.type ?? "content"} not shown]`))
      .join("\n");
  }

  //? Stateless servers (an akan one) need no handshake; one that keeps a session refuses every call without it.
  #initialized(): Promise<void> {
    this.#ready ??= this.#call("initialize", {
      protocolVersion: RemoteMcp.protocolVersion,
      capabilities: { extensions: { [MCP_UI_EXTENSION]: { mimeTypes: [MCP_UI_MIME_TYPE] } } },
      clientInfo: { name: this.#options.clientName ?? "akan", version: "1" },
    })
      .then(async (answer) => {
        if (answer.error)
          throw new RemoteError("remoteProtocol", RemoteMcp.#messageOf(answer, "initialize was refused."));
        await this.#post({ jsonrpc: "2.0", method: "notifications/initialized" });
      })
      .catch((error: unknown) => {
        this.#ready = null;
        throw error;
      });
    return this.#ready;
  }

  async #call(method: string, params: unknown, maxBytes?: number): Promise<JsonRpcAnswer> {
    this.#nextId += 1;
    return await this.#post({ jsonrpc: "2.0", id: this.#nextId, method, params }, maxBytes);
  }

  async #post(body: JsonRpcMessage, maxBytes = this.#options.maxBytes): Promise<JsonRpcAnswer> {
    const { status, headers, text } = await this.#fetcher.send(this.#url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        //? Streamable HTTP lets a server answer either way; a client that omits the SSE type gets a 406.
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": RemoteMcp.protocolVersion,
        ...(this.#token ? { authorization: `Bearer ${this.#token}` } : {}),
        ...(this.#sessionId ? { "mcp-session-id": this.#sessionId } : {}),
      },
      body: JSON.stringify(body),
      ...(this.#options.signal ? { signal: this.#options.signal } : {}),
      ...(maxBytes ? { maxBytes } : {}),
    });
    //? Thrown, not returned as a JSON-RPC error: a 401's body says nothing, and discovery starts from its header.
    if (status === 401)
      throw new RemoteError("remoteUnauthorized", "The remote server asks for a sign-in.", {
        challenge: headers.get("www-authenticate") ?? "",
        status,
      });
    this.#sessionId = headers.get("mcp-session-id") ?? this.#sessionId;
    if (!text.trim()) {
      if (status >= 400) throw new RemoteError("remoteProtocol", `The remote server answered ${status}.`, { status });
      return {};
    }
    if (body.id === undefined) return {};
    const id = body.id;
    const sse = headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() === "text/event-stream";
    const unmarked = text.replace(/^\uFEFF/, "");
    const messages = (sse ? RemoteMcp.#eventsOf(unmarked) : [unmarked]).map(RemoteMcp.#parse);
    const answer = messages.find((message) => RemoteMcp.#answers(message, id));
    if (!answer)
      throw new RemoteError("remoteProtocol", `The remote server answered ${status} with no answer to the request.`, {
        status,
      });
    return answer as JsonRpcAnswer;
  }

  static #resultOf(answer: JsonRpcAnswer): Record<string, unknown> {
    if (answer.error) throw new RemoteError("remoteProtocol", RemoteMcp.#messageOf(answer, "The request was refused."));
    return RemoteMcp.#record(answer.result) ?? {};
  }

  //? Matched by id, as a stream may carry other messages first; a request the server could not read errs under id null.
  static #answers(message: Record<string, unknown> | undefined, id: number): boolean {
    if (!message || "method" in message) return false;
    return message.id === id ? "result" in message || "error" in message : message.id === null && "error" in message;
  }

  static #eventsOf(text: string): string[] {
    let data: string[] = [];
    const events: string[] = [];
    for (const line of [...text.split(/\r\n|\r|\n/), ""]) {
      if (!line) {
        if (data.length) events.push(data.join("\n"));
        data = [];
      } else if (line === "data" || line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    return events;
  }

  static #parse(text: string): Record<string, unknown> | undefined {
    try {
      return RemoteMcp.#record(JSON.parse(text));
    } catch {
      return undefined;
    }
  }

  static #messageOf(answer: JsonRpcAnswer, fallback: string): string {
    const message = RemoteMcp.#record(answer.error)?.message;
    return typeof message === "string" && message ? clipRemoteText(message) : fallback;
  }

  static #isTool(value: unknown): value is RemoteMcpTool {
    const name = RemoteMcp.#record(value)?.name;
    return typeof name === "string" && !!name;
  }

  static #isRecord(value: unknown): value is Record<string, unknown> {
    return !!RemoteMcp.#record(value);
  }

  static #record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  }

  //? Only a code shaped as an akan server names one: the server is a third party, and its value reaches the transcript.
  static #coded(carrier: unknown): { code?: string } {
    const code = RemoteMcp.#record(carrier)?.code;
    return FailureCode.is(code) ? { code } : {};
  }
}
