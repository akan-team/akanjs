import { Logger } from "akanjs/common";
import { resolveRuntimeDir } from "../lifecycle/runtimeDir";
import type { WebRouter } from "../webRouter";
import { HubFileSink } from "./hubFileSink";
import { LogControlSocket } from "./logControlSocket";
import { LogForwarder } from "./logForwarder";
import { LogHub } from "./logHub";
import { LogStreamRoute } from "./logStreamRoute";
import { RotatingLogWriter } from "./rotatingLogWriter";

export class ServerLogging {
  readonly #solo: boolean;
  readonly #logger: Logger;
  #logWriter: RotatingLogWriter | null = null;
  #detachFileLog: (() => void) | null = null;
  #logHub: LogHub | null = null;
  #logControl: LogControlSocket | null = null;
  #logForwarder: LogForwarder | null = null;
  #logStream: LogStreamRoute | null = null;

  constructor(solo: boolean, logger: Logger) {
    this.#solo = solo;
    this.#logger = logger;
  }

  get stream() {
    this.#logStream ??= this.#solo ? LogStreamRoute.fromEnv(() => this.#logHub) : null;
    return this.#logStream;
  }

  setMinSev(minSev: number | null) {
    this.#logForwarder?.setMinSev(minSev);
  }

  async startTransport(webRouter: WebRouter | null = null) {
    if (this.#logHub || this.#logForwarder) return;
    if (this.#solo) {
      const hub = LogHub.attach();
      this.#logHub = hub;
      hub.onFloorChange((minSev) => webRouter?.setLogLevel(minSev));
      webRouter?.onLogRecords((records, dropped) => {
        hub.ingestMany(records);
        if (dropped) this.#logger.warn(`RSC worker dropped ${dropped} log records (ipc backpressure)`);
      });
      this.#logControl = await LogControlSocket.open(hub, resolveRuntimeDir(), this.#logger);
      return;
    }
    // An ndjson gateway relays records, not text; the forwarder starts at the stdout level before `log.level` arrives.
    if (Logger.isNdjson) Logger.consoleOutput = false;
    const forwarder = new LogForwarder((message, onSent) => process.send?.(message, undefined, undefined, onSent));
    this.#logForwarder = forwarder;
    webRouter?.onLogRecords((records) => forwarder.pushMany(records));
  }

  startFileLogging(role: string) {
    if (!this.#solo || this.#logWriter) return;
    this.#logWriter = RotatingLogWriter.fromRuntimeDir(resolveRuntimeDir());
    if (this.#logWriter) this.#detachFileLog = HubFileSink.attach(this.#logWriter, this.#logHub, role);
  }

  async stop() {
    await this.#logControl?.stop();
    this.#logControl = null;
    this.#logHub?.close();
    this.#logHub = null;
    await this.#logForwarder?.close();
    this.#logForwarder = null;
    this.#detachFileLog?.();
    this.#detachFileLog = null;
    const writer = this.#logWriter;
    this.#logWriter = null;
    await writer?.close();
  }
}
