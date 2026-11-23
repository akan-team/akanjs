import { type CodeAgentMcpServerRef, FailureCode, MCP_FAILURE_META } from "akanjs/common";

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

interface JsonRpcResponse {
  id?: number;
  result?: {
    tools?: McpToolInfo[];
    nextCursor?: string;
    content?: unknown;
    isError?: boolean;
    _meta?: Record<string, unknown>;
  };
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolCallResult {
  text: string;
  isError: boolean;
  /** What the server named the failure by: `_meta["akanjs/failure"].code`, or a JSON-RPC error's `data.code`. */
  code?: string;
}

const protocolVersion = "2025-06-18";

// Its own class: a 401 is fixed by signing in, and calling it "unavailable" sends someone to debug a working server.
export class McpUnauthorized extends Error {
  /** The `WWW-Authenticate` value, which names the resource metadata discovery starts from. */
  readonly challenge: string;

  constructor(name: string, challenge: string) {
    super(`MCP server "${name}" requires authentication`);
    this.name = "McpUnauthorized";
    this.challenge = challenge;
  }
}

export class McpClient {
  /** A ceiling on a server that never stops paging; 50 pages is 5,000 tools at the usual page size. */
  static readonly maxToolPages = 50;

  readonly ref: CodeAgentMcpServerRef;
  #proc: Bun.Subprocess<"pipe", "pipe", "ignore"> | undefined;
  #nextId = 0;
  #buffer = "";
  readonly #pending = new Map<number, (response: JsonRpcResponse) => void>();
  #sessionId: string | undefined;
  readonly #token: string | undefined;

  constructor(ref: CodeAgentMcpServerRef, token?: string) {
    this.ref = ref;
    this.#token = token;
  }

  async connect() {
    if (this.ref.transport === "stdio") this.#spawn();
    const initialize = await this.#call("initialize", {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: "akan-code", version: "1" },
    });
    if (initialize.error) throw new Error(initialize.error.message);
    await this.#notify("notifications/initialized");
    return this;
  }

  /** Every page: `tools/list` pages by `nextCursor` (an akan server at 100), and one page silently drops the tail. */
  async listTools(): Promise<McpToolInfo[]> {
    const tools: McpToolInfo[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < McpClient.maxToolPages; page += 1) {
      const response = await this.#call("tools/list", cursor ? { cursor } : {});
      if (response.error) throw new Error(response.error.message);
      tools.push(...(response.result?.tools ?? []));
      const next = response.result?.nextCursor;
      // Handing back the cursor it was given is a server that would page forever; so is one that cycles.
      if (!next || next === cursor) return tools;
      cursor = next;
    }
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const response = await this.#call("tools/call", { name, arguments: args });
    if (response.error)
      return { text: response.error.message, isError: true, ...McpClient.#coded(response.error.data) };
    const isError = !!response.result?.isError;
    const failure = isError ? response.result?._meta?.[MCP_FAILURE_META] : undefined;
    return { text: McpClient.#renderContent(response.result?.content), isError, ...McpClient.#coded(failure) };
  }

  // Only a code shaped as an akan server names one: the server is a third party, and its value reaches the transcript.
  static #coded(carrier: unknown): { code?: string } {
    const code = carrier && typeof carrier === "object" ? (carrier as { code?: unknown }).code : undefined;
    return FailureCode.is(code) ? { code } : {};
  }

  close() {
    this.#proc?.kill();
    this.#proc = undefined;
    for (const resolve of this.#pending.values()) resolve({ error: { code: -1, message: "MCP server closed" } });
    this.#pending.clear();
  }

  #spawn() {
    if (!this.ref.command) throw new Error(`MCP server "${this.ref.name}" declares no command`);
    this.#proc = Bun.spawn([this.ref.command, ...(this.ref.args ?? [])], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
      env: { ...process.env, ...this.ref.env },
    });
    void this.#readStdout();
  }

  async #readStdout() {
    const decoder = new TextDecoder();
    for await (const chunk of this.#proc?.stdout ?? []) {
      this.#buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      let index = this.#buffer.indexOf("\n");
      while (index >= 0) {
        const line = this.#buffer.slice(0, index).trim();
        this.#buffer = this.#buffer.slice(index + 1);
        if (line) this.#receive(line);
        index = this.#buffer.indexOf("\n");
      }
    }
  }

  #receive(line: string) {
    try {
      const message = JSON.parse(line) as JsonRpcResponse;
      if (typeof message.id !== "number") return;
      this.#pending.get(message.id)?.(message);
      this.#pending.delete(message.id);
    } catch {
      // A server that writes anything but JSON-RPC on stdout is misbehaving; dropping the line keeps us alive.
    }
  }

  async #call(method: string, params: unknown): Promise<JsonRpcResponse> {
    this.#nextId += 1;
    const id = this.#nextId;
    const request = { jsonrpc: "2.0", id, method, params };
    if (this.ref.transport === "http") return await this.#post(request);
    this.#proc?.stdin.write(`${JSON.stringify(request)}\n`);
    return await new Promise<JsonRpcResponse>((resolve) => {
      this.#pending.set(id, resolve);
      setTimeout(() => {
        if (!this.#pending.delete(id)) return;
        resolve({ error: { code: -2, message: `MCP server "${this.ref.name}" timed out on ${method}` } });
      }, 30_000);
    });
  }

  async #notify(method: string) {
    const request = { jsonrpc: "2.0", method };
    if (this.ref.transport === "http") await this.#post(request);
    else this.#proc?.stdin.write(`${JSON.stringify(request)}\n`);
  }

  async #post(body: unknown): Promise<JsonRpcResponse> {
    if (!this.ref.url) throw new Error(`MCP server "${this.ref.name}" declares no url`);
    const response = await fetch(this.ref.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Streamable HTTP lets a server answer either way; a client that omits the SSE type gets a 406.
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": protocolVersion,
        ...this.ref.headers,
        ...(this.#token ? { authorization: `Bearer ${this.#token}` } : {}),
        ...(this.#sessionId ? { "mcp-session-id": this.#sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    // Thrown, not returned as a JSON-RPC error: a 401's body says nothing, and the caller needs its header.
    if (response.status === 401)
      throw new McpUnauthorized(this.ref.name, response.headers.get("www-authenticate") ?? "");
    this.#sessionId = response.headers.get("mcp-session-id") ?? this.#sessionId;
    const text = await response.text();
    if (!text.trim()) return {};
    // An SSE answer to a single request carries one `data:` line holding the whole JSON-RPC response.
    const payload = text.startsWith("event:") || text.startsWith("data:") ? McpClient.#firstSseData(text) : text;
    return payload ? (JSON.parse(payload) as JsonRpcResponse) : {};
  }

  static #firstSseData(text: string) {
    return text
      .split("\n")
      .find((line) => line.startsWith("data:"))
      ?.slice(5)
      .trim();
  }

  static #renderContent(content: unknown) {
    if (!Array.isArray(content)) return typeof content === "string" ? content : JSON.stringify(content ?? null);
    return content
      .map((part: { type?: string; text?: string }) =>
        part.type === "text" ? (part.text ?? "") : JSON.stringify(part),
      )
      .join("\n");
  }
}
