import dayjs from "dayjs";

const logLevels = ["trace", "verbose", "debug", "log", "info", "warn", "error"] as const;
export type LogLevel = (typeof logLevels)[number];

export interface LoggerSinkEntry {
  stream: "stdout" | "stderr";
  level?: LogLevel;
  message: string;
  plainMessage: string;
}

export type LoggerSink = (entry: LoggerSinkEntry) => void | Promise<void>;

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

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

/** Log-level aware logger used by Akan runtime, CLI, and application services. */
export class Logger {
  static level: LogLevel = (process.env?.AKAN_PUBLIC_LOG_LEVEL as LogLevel | undefined) ?? "log";
  static #levelIdx = logLevels.findIndex((l) => l === (process.env?.AKAN_PUBLIC_LOG_LEVEL ?? "log"));
  static fileLevel: LogLevel = (process.env?.AKAN_LOG_FILE_LEVEL as LogLevel | undefined) ?? "trace";
  static #fileLevelIdx = logLevels.findIndex((l) => l === (process.env?.AKAN_LOG_FILE_LEVEL ?? "trace"));
  static #startAt = dayjs();
  static #sinks = new Set<LoggerSink>();

  static setLevel(level: LogLevel) {
    Logger.level = level;
    Logger.#levelIdx = logLevels.indexOf(level);
  }
  static addSink(sink: LoggerSink) {
    Logger.#sinks.add(sink);
    return () => Logger.removeSink(sink);
  }
  static removeSink(sink: LoggerSink) {
    Logger.#sinks.delete(sink);
  }
  static setFileLevel(level: LogLevel) {
    Logger.fileLevel = level;
    Logger.#fileLevelIdx = logLevels.indexOf(level);
  }
  static isVerbose() {
    return Logger.#levelIdx <= 1;
  }

  name?: string;
  constructor(name?: string) {
    this.name = name;
  }
  trace(msg: string, context = "", name = this.name ?? "App") {
    if (Logger.#shouldLog("trace")) Logger.#printMessages(name, msg, context, "trace");
  }
  verbose(msg: string, context = "", name = this.name ?? "App") {
    if (Logger.#shouldLog("verbose")) Logger.#printMessages(name, msg, context, "verbose");
  }
  debug(msg: string, context = "", name = this.name ?? "App") {
    if (Logger.#shouldLog("debug")) Logger.#printMessages(name, msg, context, "debug");
  }
  log(msg: string, context = "", name = this.name ?? "App") {
    if (Logger.#shouldLog("log")) Logger.#printMessages(name, msg, context, "log");
  }
  info(msg: string, context = "", name = this.name ?? "App") {
    if (Logger.#shouldLog("info")) Logger.#printMessages(name, msg, context, "info");
  }
  warn(msg: string, context = "", name = this.name ?? "App") {
    if (Logger.#shouldLog("warn")) Logger.#printMessages(name, msg, context, "warn");
  }
  error(msg: string, context = "", name = this.name ?? "App") {
    if (Logger.#shouldLog("error")) Logger.#printMessages(name, msg, context, "error");
  }
  raw(msg: string, method?: "console" | "process") {
    Logger.rawLog(msg, method);
  }
  rawLog(msg: string, method?: "console" | "process") {
    Logger.rawLog(msg, method);
  }
  // biome-ignore lint/suspicious/useAdjacentOverloadSignatures: static logger API mirrors the instance API.
  static trace(msg: string, context = "", name = "App") {
    if (Logger.#shouldLog("trace")) Logger.#printMessages(name, msg, context, "trace");
  }
  static verbose(msg: string, context = "", name = "App") {
    if (Logger.#shouldLog("verbose")) Logger.#printMessages(name, msg, context, "verbose");
  }
  static debug(msg: string, context = "", name = "App") {
    if (Logger.#shouldLog("debug")) Logger.#printMessages(name, msg, context, "debug");
  }
  static log(msg: string, context = "", name = "App") {
    if (Logger.#shouldLog("log")) Logger.#printMessages(name, msg, context, "log");
  }
  static info(msg: string, context = "", name = "App") {
    if (Logger.#shouldLog("info")) Logger.#printMessages(name, msg, context, "info");
  }
  static warn(msg: string, context = "", name = "App") {
    if (Logger.#shouldLog("warn")) Logger.#printMessages(name, msg, context, "warn");
  }
  static error(msg: string, context = "", name = "App") {
    if (Logger.#shouldLog("error")) Logger.#printMessages(name, msg, context, "error");
  }
  static #colorize(msg: string, logLevel: LogLevel) {
    return colorizeMap[logLevel](msg);
  }
  static #stripAnsi(msg: string) {
    return msg.replace(ansiPattern, "");
  }
  static #shouldLog(logLevel: LogLevel) {
    return Logger.#shouldWriteConsole(logLevel) || Logger.#shouldEmitSink(logLevel);
  }
  static #shouldWriteConsole(logLevel: LogLevel) {
    return Logger.#levelIdx <= logLevels.indexOf(logLevel);
  }
  static #shouldEmitSink(logLevel: LogLevel) {
    return Logger.#sinks.size > 0 && Logger.#fileLevelIdx <= logLevels.indexOf(logLevel);
  }
  static #emit(entry: LoggerSinkEntry) {
    for (const sink of Logger.#sinks) {
      try {
        void Promise.resolve(sink(entry)).catch(() => undefined);
      } catch {
        // Log sinks are observers; they must not break application logging.
      }
    }
  }
  static #printMessages(
    name: string | undefined,
    content: string,
    context: string,
    logLevel: LogLevel,
    writeStreamType: "stdout" | "stderr" = logLevel === "error" ? "stderr" : "stdout",
  ) {
    const now = dayjs();
    const replicaIdx = (process as unknown as NodeJS.Process | undefined)?.env?.AKAN_REPLICA_IDX;
    const replicaMsg = replicaIdx === undefined ? "" : `#${replicaIdx} `;
    const processMsg = Logger.#colorize(
      `[${name ?? "App"}] ${replicaMsg}${(process as unknown as NodeJS.Process | undefined)?.pid ?? "window"} -`,
      logLevel,
    );
    const timestampMsg = now.format("MM/DD/YYYY, HH:mm:ss A");
    const logLevelMsg = Logger.#colorize(logLevel.toUpperCase().padStart(7, " "), logLevel);
    const contextMsg = context ? clc.yellow(`[${context}] `) : "";
    const contentMsg = Logger.#colorize(content, logLevel);
    const timeDiffMsg = clc.yellow(`+${now.diff(Logger.#startAt, "ms")}ms`);
    const message = `${processMsg} ${timestampMsg} ${logLevelMsg} ${contextMsg} ${contentMsg} ${timeDiffMsg}\n`;
    if (Logger.#shouldEmitSink(logLevel))
      Logger.#emit({ stream: writeStreamType, level: logLevel, message, plainMessage: Logger.#stripAnsi(message) });
    if (!Logger.#shouldWriteConsole(logLevel)) return;
    if (typeof window === "undefined")
      (process[writeStreamType] as unknown as NodeJS.WriteStream | undefined)?.write(message);
    // biome-ignore lint/suspicious/noConsole: browser fallback
    else console.log(message);
  }
  static rawLog(msg = "", method?: "console" | "process", outputStream?: "log" | "error") {
    Logger.raw(`${msg}\n`, method, outputStream);
  }
  static raw(msg = "", method?: "console" | "process", outputStream?: "log" | "error") {
    const stream = outputStream === "error" ? "stderr" : "stdout";
    Logger.#emit({ stream, message: msg, plainMessage: Logger.#stripAnsi(msg) });
    if (typeof window === "undefined" && method !== "console" && (process as unknown as NodeJS.Process | undefined))
      process[stream].write(msg);
    // biome-ignore lint/suspicious/noConsole: browser fallback
    else console[outputStream === "error" ? "error" : "log"](msg.trim());
  }
}
