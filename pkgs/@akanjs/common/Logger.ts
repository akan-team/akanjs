import dayjs from "dayjs";

const logLevels = ["trace", "verbose", "debug", "log", "info", "warn", "error"] as const;
type LogLevel = (typeof logLevels)[number];

const clc = {
  bold: (text: string) => `\x1B[1m${text}\x1B[0m`,
  green: (text: string) => `\x1B[32m${text}\x1B[39m`,
  yellow: (text: string) => `\x1B[33m${text}\x1B[39m`,
  red: (text: string) => `\x1B[31m${text}\x1B[39m`,
  magentaBright: (text: string) => `\x1B[95m${text}\x1B[39m`,
  cyanBright: (text: string) => `\x1B[96m${text}\x1B[39m`,
};

const colorizeMap: { [key in LogLevel]: (text: string) => string } = {
  trace: clc.bold,
  verbose: clc.cyanBright,
  debug: clc.magentaBright,
  log: clc.green,
  info: clc.green,
  warn: clc.yellow,
  error: clc.red,
};

export class Logger {
  static #ignoreCtxSet = new Set([
    "InstanceLoader",
    "RoutesResolver",
    "RouterExplorer",
    "NestFactory",
    "WebSocketsController",
    "GraphQLModule",
    "NestApplication",
  ]);
  static level: LogLevel = (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel | undefined) ?? "log";
  static #levelIdx = logLevels.findIndex((l) => l === (process.env.NEXT_PUBLIC_LOG_LEVEL ?? "log"));
  static #startAt = dayjs();
  static setLevel(level: LogLevel) {
    this.level = level;
    this.#levelIdx = logLevels.findIndex((l) => l === level);
  }
  static isVerbose() {
    return this.#levelIdx <= 1;
  }

  name?: string;
  constructor(name?: string) {
    this.name = name;
  }
  trace(msg: string, context = "") {
    if (Logger.#levelIdx <= 0) Logger.#printMessages(this.name ?? "App", msg, context, "trace");
  }
  verbose(msg: string, context = "") {
    if (Logger.#levelIdx <= 1) Logger.#printMessages(this.name ?? "App", msg, context, "verbose");
  }
  debug(msg: string, context = "") {
    if (Logger.#levelIdx <= 2) Logger.#printMessages(this.name ?? "App", msg, context, "debug");
  }
  log(msg: string, context = "") {
    if (Logger.#levelIdx <= 3) Logger.#printMessages(this.name ?? "App", msg, context, "log");
  }
  info(msg: string, context = "") {
    if (Logger.#levelIdx <= 4) Logger.#printMessages(this.name ?? "App", msg, context, "info");
  }
  warn(msg: string, context = "") {
    if (Logger.#levelIdx <= 5) Logger.#printMessages(this.name ?? "App", msg, context, "warn");
  }
  error(msg: string, context = "") {
    if (Logger.#levelIdx <= 6) Logger.#printMessages(this.name ?? "App", msg, context, "error");
  }
  raw(msg: string, method?: "console" | "process") {
    Logger.rawLog(msg, method);
  }
  rawLog(msg: string, method?: "console" | "process") {
    Logger.rawLog(msg, method);
  }
  static trace(msg: string, context = "") {
    if (Logger.#levelIdx <= 0) Logger.#printMessages("App", msg, context, "trace");
  }
  static verbose(msg: string, context = "") {
    if (Logger.#levelIdx <= 1) Logger.#printMessages("App", msg, context, "verbose");
  }
  static debug(msg: string, context = "") {
    if (Logger.#levelIdx <= 2) Logger.#printMessages("App", msg, context, "debug");
  }
  static log(msg: string, context = "") {
    if (Logger.#levelIdx <= 3) Logger.#printMessages("App", msg, context, "log");
  }
  static info(msg: string, context = "") {
    if (Logger.#levelIdx <= 4) Logger.#printMessages("App", msg, context, "info");
  }
  static warn(msg: string, context = "") {
    if (Logger.#levelIdx <= 5) Logger.#printMessages("App", msg, context, "warn");
  }
  static error(msg: string, context = "") {
    if (Logger.#levelIdx <= 6) Logger.#printMessages("App", msg, context, "error");
  }
  static #colorize(msg: string, logLevel: LogLevel) {
    return colorizeMap[logLevel](msg);
  }
  static #printMessages(
    name: string | undefined,
    content: string,
    context: string,
    logLevel: LogLevel,
    writeStreamType: "stdout" | "stderr" = logLevel === "error" ? "stderr" : "stdout"
  ) {
    if (this.#ignoreCtxSet.has(context)) return;
    const now = dayjs();
    const processMsg = this.#colorize(
      `[${name ?? "App"}] ${(global.process as unknown as NodeJS.Process | undefined)?.pid ?? "window"} -`,
      logLevel
    );
    const timestampMsg = now.format("MM/DD/YYYY, HH:mm:ss A");
    const logLevelMsg = this.#colorize(logLevel.toUpperCase().padStart(7, " "), logLevel);
    const contextMsg = context ? clc.yellow(`[${context}] `) : "";
    const contentMsg = this.#colorize(content, logLevel);
    const timeDiffMsg = clc.yellow(`+${now.diff(Logger.#startAt, "ms")}ms`);
    if (typeof window === "undefined")
      (process[writeStreamType] as unknown as NodeJS.WriteStream | undefined)?.write(
        `${processMsg} ${timestampMsg} ${logLevelMsg} ${contextMsg} ${contentMsg} ${timeDiffMsg}\n`
      );
    // eslint-disable-next-line no-console
    else console.log(`${processMsg} ${timestampMsg} ${logLevelMsg} ${contextMsg} ${contentMsg} ${timeDiffMsg}\n`);
  }
  static rawLog(msg = "", method?: "console" | "process") {
    this.raw(`${msg}\n`, method);
  }
  static raw(msg = "", method?: "console" | "process") {
    if (
      typeof window === "undefined" &&
      method !== "console" &&
      (global.process as unknown as NodeJS.Process | undefined)
    )
      global.process.stdout.write(msg);
    // eslint-disable-next-line no-console
    else console.log(msg.trim());
  }
}
