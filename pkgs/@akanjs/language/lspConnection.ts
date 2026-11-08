import type { Readable, Writable } from "node:stream";

export type LspId = number | string;

export interface LspMessage {
  jsonrpc: "2.0";
  id?: LspId | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export const lspErrors = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  internalError: -32603,
  serverNotInitialized: -32002,
} as const;

const headerEnd = Buffer.from("\r\n\r\n");
const contentLength = /^content-length:\s*(\d+)\s*$/im;

export class LspConnection {
  readonly #output: Writable;
  readonly #onMessage: (message: LspMessage) => void;
  #buffer = Buffer.alloc(0);
  #nextId = 0;

  constructor(input: Readable, output: Writable, onMessage: (message: LspMessage) => void) {
    this.#output = output;
    this.#onMessage = onMessage;
    input.on("data", (chunk: Buffer | string) => this.#read(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
  }

  //? Content-Length counts UTF-8 bytes, not characters, so framing works on the raw buffer.
  #read(chunk: Buffer) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (;;) {
      const end = this.#buffer.indexOf(headerEnd);
      if (end < 0) return;
      const length = this.#buffer.subarray(0, end).toString("ascii").match(contentLength)?.[1];
      const start = end + headerEnd.length;
      if (length === undefined) {
        this.#buffer = this.#buffer.subarray(start);
        continue;
      }
      if (this.#buffer.length < start + Number(length)) return;
      const body = this.#buffer.subarray(start, start + Number(length)).toString("utf8");
      this.#buffer = this.#buffer.subarray(start + Number(length));
      this.#dispatch(body);
    }
  }

  #dispatch(body: string) {
    let message: unknown;
    try {
      message = JSON.parse(body);
    } catch {
      this.fail(null, lspErrors.parseError, "The message is not JSON.");
      return;
    }
    if (typeof message === "object" && message !== null && !Array.isArray(message))
      this.#onMessage(message as LspMessage);
    else this.fail(null, lspErrors.invalidRequest, "The message is not a JSON-RPC object.");
  }

  send(message: LspMessage) {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    this.#output.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]));
  }

  respond(id: LspId | null, result: unknown) {
    this.send({ jsonrpc: "2.0", id, result: result ?? null });
  }

  fail(id: LspId | null, code: number, message: string) {
    this.send({ jsonrpc: "2.0", id, error: { code, message } });
  }

  notify(method: string, params: unknown) {
    this.send({ jsonrpc: "2.0", method, params });
  }

  request(method: string, params: unknown) {
    this.send({ jsonrpc: "2.0", id: `akan-${++this.#nextId}`, method, params });
  }
}
