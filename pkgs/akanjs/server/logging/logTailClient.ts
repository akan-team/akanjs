import { AkanError } from "akanjs/base";
import type { LogRecord } from "akanjs/common";
import { type LogControlRequest, type LogControlResponse, LogControlSocket } from "./logControlSocket";
import type { LogHubCoverage, LogHubEntry } from "./logHub";

export interface LogTailHandlers {
  onRecord: (entry: LogHubEntry) => void;
  onEvent?: (response: LogControlResponse) => void;
  onClose?: () => void;
}

/** Says the app is not running at all, as opposed to a request that failed once connected. */
export class LogControlUnavailableError extends AkanError<"logControlUnavailable"> {
  readonly socketPath: string;
  constructor(socketPath: string, cause: unknown) {
    super(
      "logControlUnavailable",
      `no log control socket at ${socketPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { statusCode: 503, cause },
    );
    this.name = "LogControlUnavailableError";
    this.socketPath = socketPath;
  }
}

// Every non-record line answers the oldest pending request, because the control socket answers in order.
export class LogTailClient {
  static socketPath(runtimeDir: string) {
    return LogControlSocket.pathIn(runtimeDir);
  }

  static async connect(socketPath: string, handlers: LogTailHandlers): Promise<LogTailClient> {
    const client = new LogTailClient(handlers);
    try {
      client.#socket = await Bun.connect<undefined>({
        unix: socketPath,
        socket: {
          data: (_socket, chunk) => client.#onData(chunk),
          close: () => client.#onClose(),
          error: (_socket, error) => client.#onError(error),
        },
      });
    } catch (error) {
      throw new LogControlUnavailableError(socketPath, error);
    }
    return client;
  }

  static describeCoverage(coverage: LogHubCoverage, now = Date.now()) {
    if (!coverage.count || coverage.from === null) return "buffer is empty";
    return `buffer covers last ${LogTailClient.formatDuration(now - coverage.from)} (${coverage.count} records)`;
  }

  static formatDuration(ms: number) {
    const total = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours) return `${hours}h${String(minutes).padStart(2, "0")}m`;
    if (minutes) return `${minutes}m${String(seconds).padStart(2, "0")}s`;
    return `${seconds}s`;
  }

  readonly #handlers: LogTailHandlers;
  readonly #pending: { resolve: (response: LogControlResponse) => void; reject: (error: Error) => void }[] = [];
  #socket: Bun.Socket<undefined> | null = null;
  #inbox = "";
  #closed = false;

  private constructor(handlers: LogTailHandlers) {
    this.#handlers = handlers;
  }

  get closed() {
    return this.#closed;
  }

  async subscribe(query: Record<string, unknown>, { replay }: { replay?: number } = {}) {
    const response = await this.#request({ cmd: "subscribe", query, ...(replay ? { replay } : {}) });
    if (response.type !== "subscribed") throw new Error(`unexpected reply to subscribe: ${response.type}`);
    return response;
  }

  async unsubscribe(id: string) {
    await this.#request({ cmd: "unsubscribe", id });
  }

  async history(query: Record<string, unknown>) {
    const response = await this.#request({ cmd: "history", query });
    if (response.type !== "history") throw new Error(`unexpected reply to history: ${response.type}`);
    return response;
  }

  async coverage() {
    const response = await this.#request({ cmd: "coverage" });
    if (response.type !== "coverage") throw new Error(`unexpected reply to coverage: ${response.type}`);
    return response.coverage;
  }

  close() {
    if (this.#closed) return;
    this.#socket?.end();
    this.#onClose();
  }

  #request(request: LogControlRequest): Promise<LogControlResponse> {
    if (this.#closed || !this.#socket) return Promise.reject(new Error("log control socket is closed"));
    return new Promise((resolve, reject) => {
      this.#pending.push({ resolve, reject });
      this.#socket?.write(`${JSON.stringify(request)}\n`);
    });
  }

  #onData(chunk: Buffer) {
    this.#inbox += chunk.toString("utf8");
    let newline = this.#inbox.indexOf("\n");
    while (newline >= 0) {
      const line = this.#inbox.slice(0, newline);
      this.#inbox = this.#inbox.slice(newline + 1);
      if (line.trim()) this.#dispatch(line);
      newline = this.#inbox.indexOf("\n");
    }
  }

  #dispatch(line: string) {
    let response: LogControlResponse;
    try {
      response = JSON.parse(line) as LogControlResponse;
    } catch {
      return;
    }
    if (response.type === "record") {
      this.#handlers.onRecord({ seq: response.seq, record: response.record as LogRecord });
      return;
    }
    if (response.type === "dropped") {
      this.#handlers.onEvent?.(response);
      return;
    }
    const pending = this.#pending.shift();
    if (!pending) {
      this.#handlers.onEvent?.(response);
      return;
    }
    if (response.type === "error") pending.reject(new Error(response.message));
    else pending.resolve(response);
  }

  #onError(error: Error) {
    for (const pending of this.#pending.splice(0)) pending.reject(error);
  }

  #onClose() {
    if (this.#closed) return;
    this.#closed = true;
    this.#socket = null;
    for (const pending of this.#pending.splice(0)) pending.reject(new Error("log control socket closed"));
    this.#handlers.onClose?.();
  }
}
