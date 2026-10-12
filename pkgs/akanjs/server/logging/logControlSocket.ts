import { chmod, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { LogHub, LogHubCoverage, LogHubEntry } from "./logHub";
import { type LogQuery, LogQueryMatcher } from "./logQuery";

export type LogControlRequest =
  | { cmd: "subscribe"; query?: Record<string, unknown>; replay?: number }
  | { cmd: "unsubscribe"; id: string }
  | { cmd: "history"; query?: Record<string, unknown> }
  | { cmd: "coverage" };

export type LogControlResponse =
  | { type: "subscribed"; id: string; query: LogQuery; coverage: LogHubCoverage }
  | { type: "unsubscribed"; id: string }
  | { type: "record"; id?: string; seq: number; record: LogHubEntry["record"] }
  | { type: "history"; entries: LogHubEntry[]; coverage: LogHubCoverage }
  | { type: "coverage"; coverage: LogHubCoverage }
  | { type: "dropped"; count: number }
  | { type: "error"; message: string };

interface ClientState {
  inbox: string;
  pending: string;
  droppedWhilePending: number;
  subscriptions: Map<string, () => void>;
}

// Security: the socket's 0600 file mode is the whole authentication — no TCP port is ever opened. Windows ignores the
// mode and checks the socket file's ACL, inherited from the runtime folder: a carried server's is under %LOCALAPPDATA%.
// Never log per delivered record here: a subscriber to everything would receive its own delivery line, forever.
export class LogControlSocket {
  static readonly fileName = "akan-control.sock";
  static readonly maxPendingBytes = 1024 * 1024;
  static readonly maxInboxBytes = 64 * 1024;

  static pathIn(runtimeDir: string) {
    return path.join(runtimeDir, LogControlSocket.fileName);
  }

  readonly path: string;
  readonly #hub: LogHub;
  readonly #logger = new Logger("LogControlSocket");
  #server: ReturnType<typeof Bun.listen<ClientState>> | null = null;

  constructor(hub: LogHub, runtimeDir: string) {
    this.#hub = hub;
    this.path = LogControlSocket.pathIn(runtimeDir);
  }

  static async open(hub: LogHub, runtimeDir: string, logger: Logger): Promise<LogControlSocket | null> {
    const control = new LogControlSocket(hub, runtimeDir);
    try {
      await control.start();
      return control;
    } catch (error) {
      logger.warn(
        `Log control socket unavailable at ${control.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async start() {
    await mkdir(path.dirname(this.path), { recursive: true });
    await rm(this.path, { force: true });
    this.#server = Bun.listen<ClientState>({
      unix: this.path,
      socket: {
        open: (socket) => {
          socket.data = { inbox: "", pending: "", droppedWhilePending: 0, subscriptions: new Map() };
        },
        data: (socket, chunk) => this.#onData(socket, chunk),
        drain: (socket) => this.#drain(socket),
        close: (socket) => this.#release(socket),
        error: (socket, error) => {
          this.#logger.debug(`control socket client error: ${error.message}`);
          this.#release(socket);
        },
      },
    });
    await chmod(this.path, 0o600);
  }

  async stop() {
    this.#server?.stop(true);
    this.#server = null;
    await rm(this.path, { force: true });
  }

  #onData(socket: Bun.Socket<ClientState>, chunk: Buffer) {
    const state = socket.data;
    state.inbox += chunk.toString("utf8");
    if (state.inbox.length > LogControlSocket.maxInboxBytes) {
      this.#write(socket, { type: "error", message: "request line too long" });
      socket.end();
      return;
    }
    let newline = state.inbox.indexOf("\n");
    while (newline >= 0) {
      const line = state.inbox.slice(0, newline).trim();
      state.inbox = state.inbox.slice(newline + 1);
      if (line) this.#dispatch(socket, line);
      newline = state.inbox.indexOf("\n");
    }
  }

  #dispatch(socket: Bun.Socket<ClientState>, line: string) {
    let request: LogControlRequest;
    try {
      request = JSON.parse(line) as LogControlRequest;
    } catch {
      this.#write(socket, { type: "error", message: "request is not JSON" });
      return;
    }
    switch (request.cmd) {
      case "subscribe": {
        const query = LogQueryMatcher.parse(request.query ?? {});
        const { id, unsubscribe } = this.#hub.subscribe(query, (entry) =>
          this.#write(socket, { type: "record", id, seq: entry.seq, record: entry.record }),
        );
        socket.data.subscriptions.set(id, unsubscribe);
        this.#write(socket, { type: "subscribed", id, query, coverage: this.#hub.coverage() });
        if (request.replay) {
          const { entries } = this.#hub.history({ ...query, limit: request.replay });
          for (const entry of entries)
            this.#write(socket, { type: "record", id, seq: entry.seq, record: entry.record });
        }
        return;
      }
      case "unsubscribe": {
        socket.data.subscriptions.get(request.id)?.();
        socket.data.subscriptions.delete(request.id);
        this.#write(socket, { type: "unsubscribed", id: request.id });
        return;
      }
      case "history": {
        const { entries, coverage } = this.#hub.history(LogQueryMatcher.parse(request.query ?? {}));
        this.#write(socket, { type: "history", entries, coverage });
        return;
      }
      case "coverage":
        this.#write(socket, { type: "coverage", coverage: this.#hub.coverage() });
        return;
      default:
        this.#write(socket, { type: "error", message: `unknown cmd ${String((request as { cmd?: unknown }).cmd)}` });
    }
  }

  #write(socket: Bun.Socket<ClientState>, response: LogControlResponse) {
    const state = socket.data;
    const line = `${JSON.stringify(response)}\n`;
    if (state.pending) {
      if (state.pending.length + line.length > LogControlSocket.maxPendingBytes) {
        state.droppedWhilePending += 1;
        return;
      }
      state.pending += line;
      return;
    }
    const written = socket.write(line);
    if (written < line.length) state.pending = line.slice(Math.max(0, written));
  }

  #drain(socket: Bun.Socket<ClientState>) {
    const state = socket.data;
    if (!state.pending) return;
    const written = socket.write(state.pending);
    state.pending = state.pending.slice(Math.max(0, written));
    if (state.pending || !state.droppedWhilePending) return;
    const count = state.droppedWhilePending;
    state.droppedWhilePending = 0;
    this.#write(socket, { type: "dropped", count });
  }

  #release(socket: Bun.Socket<ClientState>) {
    const state = socket.data as ClientState | undefined;
    if (!state) return;
    for (const unsubscribe of state.subscriptions.values()) unsubscribe();
    state.subscriptions.clear();
  }
}
