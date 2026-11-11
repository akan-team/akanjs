import { Logger } from "akanjs/common";
import type { AkanChildRole } from "akanjs/service";
import { ChildOutputReader } from "../logging/childOutputReader";
import { HubFileSink } from "../logging/hubFileSink";
import { LogControlSocket } from "../logging/logControlSocket";
import { LogHub } from "../logging/logHub";
import { LogStreamRoute } from "../logging/logStreamRoute";
import { RotatingLogWriter } from "../logging/rotatingLogWriter";
import type { GatewayChildren } from "./gatewayChildren";
import type { GatewayConfig } from "./gatewayConfig";

export class GatewayLogging {
  static readonly #ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

  readonly #config: GatewayConfig;
  readonly #children: GatewayChildren;
  readonly #logger: Logger;
  #logWriter: RotatingLogWriter | null = null;
  #detachFileLog: (() => void) | null = null;
  #logHub: LogHub | null;
  #logControl: LogControlSocket | null = null;
  #logStream: LogStreamRoute | null = null;

  constructor(config: GatewayConfig, children: GatewayChildren, logger: Logger) {
    this.#config = config;
    this.#children = children;
    this.#logger = logger;
    this.#logHub = LogHub.attach();
  }

  get hub() {
    return this.#logHub;
  }

  get stream() {
    return this.#logStream;
  }

  async start() {
    await this.#startLogHub();
    this.#startFileLogging();
  }

  async stop() {
    await this.#stopLogHub();
    await this.#stopFileLogging();
  }

  #startFileLogging() {
    this.#logWriter = RotatingLogWriter.fromRuntimeDir(this.#config.runtimeDir);
    if (this.#logWriter) this.#detachFileLog = HubFileSink.attach(this.#logWriter, this.#logHub, "gateway");
  }

  async #stopFileLogging() {
    this.#detachFileLog?.();
    this.#detachFileLog = null;
    const writer = this.#logWriter;
    this.#logWriter = null;
    await writer?.close();
  }

  async #startLogHub() {
    const hub = LogHub.attach();
    this.#logHub = hub;
    hub.onFloorChange((minSev) => this.#children.fanoutToAll({ type: "log.level", minSev }));
    this.#logStream = LogStreamRoute.fromEnv(() => this.#logHub);
    this.#logControl = await LogControlSocket.open(hub, this.#config.runtimeDir, this.#logger);
  }

  async #stopLogHub() {
    await this.#logControl?.stop();
    this.#logControl = null;
    this.#logStream = null;
    this.#logHub?.close();
    this.#logHub = null;
  }

  writeChildLine(idx: number, role: AkanChildRole, pid: number | null, type: "stdout" | "stderr", line: string) {
    if (Logger.isNdjson) {
      this.#logHub?.ingest(ChildOutputReader.toRecord({ type, text: line, name: "child", role, replicaIdx: idx, pid }));
      return;
    }
    const prefixedLine = `[child:${idx} ${role}] [${type}] ${line}`;
    if (type === "stdout" || this.#config.printChildStderr || !this.#logWriter) process[type].write(prefixedLine);
    this.#logWriter?.write(`${idx}-${role}`, GatewayLogging.#stripAnsi(prefixedLine));
  }

  // ndjson ignores `AKAN_CHILD_STDERR`: the stack that killed a child is the one record a collector must not miss.
  writeChildStderrBlock(idx: number, role: AkanChildRole, pid: number | null, lines: string[]) {
    const text = lines.join("");
    if (GatewayLogging.#isBenignRsdwConnectionClosedBlock(text)) return;
    if (Logger.isNdjson) {
      this.#logHub?.ingest(
        ChildOutputReader.toRecord({ type: "stderr", text, name: "child", role, replicaIdx: idx, pid }),
      );
      return;
    }
    for (const line of lines) this.writeChildLine(idx, role, pid, "stderr", line);
  }

  static #isBenignRsdwConnectionClosedBlock(text: string): boolean {
    return (
      text.includes('reportGlobalError(weakResponse, Error("Connection closed."))') &&
      text.includes("error: Connection closed.") &&
      text.includes("react-server-dom-webpack")
    );
  }

  static #stripAnsi(msg: string) {
    return msg.replace(GatewayLogging.#ansiPattern, "");
  }
}
