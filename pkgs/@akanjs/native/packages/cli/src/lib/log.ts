// Output of the CLI and of the programmatic API (docs/api.md §5). Everything goes through `log`: on
// the command line it prints the familiar `›`, `✓`, `!` lines; inside an API call it becomes
// LogEvents for that call's sink (AsyncLocalStorage, so concurrent calls keep their own).

import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "step" | "info" | "ok" | "warn" | "error" | "tool";

export interface LogEvent {
  level: LogLevel;
  message: string;
  /** For "tool": whose output the line is ("web-build", "swiftc", "kotlinc", "cargo" …). */
  tool?: string;
  time: number;
}

export type LogSink = (event: LogEvent) => void;

const sinks = new AsyncLocalStorage<LogSink>();

/** Runs `fn` with its log going to `sink` (none: dropped) instead of the terminal. */
export function withLogSink<T>(sink: LogSink | undefined, fn: () => T): T {
  return sinks.run(sink ?? (() => {}), fn);
}

/** Whether output goes to the terminal (the CLI), not to an API caller's sink. */
export function isTerminal(): boolean {
  return sinks.getStore() === undefined;
}

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (text: string) => (color && isTerminal() ? `\x1b[${code}m${text}\x1b[0m` : text);

export const dim = paint("2");
export const bold = paint("1");
export const green = paint("32");
export const yellow = paint("33");
export const red = paint("31");
export const cyan = paint("36");

function emit(level: LogLevel, message: string, tool?: string): void {
  const sink = sinks.getStore();
  if (sink) {
    sink({ level, message, ...(tool ? { tool } : {}), time: Date.now() });
    return;
  }
  switch (level) {
    case "step":
      console.info(`${cyan("›")} ${message}`);
      return;
    case "info":
      console.info(`  ${message}`);
      return;
    case "ok":
      console.info(`${green("✓")} ${message}`);
      return;
    case "warn":
      console.warn(`${yellow("!")} ${message}`);
      return;
    case "error":
      console.error(`${red("✗")} ${message}`);
      return;
    case "tool":
      console.info(message);
      return;
  }
}

export const log = {
  step: (text: string) => emit("step", text),
  info: (text: string) => emit("info", text),
  ok: (text: string) => emit("ok", text),
  warn: (text: string) => emit("warn", text),
  error: (text: string) => emit("error", text),
  /** A line of a child process's output (web build, compilers) that the terminal would show as is. */
  tool: (tool: string, line: string) => emit("tool", line, tool),
};

/** An error whose message is shown to the user without a stack trace. */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}

/** A required toolchain (SDK, JDK, kotlinc, simulator runtime) is missing (AkanNativeError TOOLCHAIN_MISSING). */
export class ToolchainError extends CliError {
  constructor(message: string) {
    super(message);
    this.name = "ToolchainError";
  }
}

/** A command that failed: its last output lines travel with the error (AkanNativeError.logTail). */
export class ToolError extends CliError {
  constructor(
    message: string,
    readonly tail: string[],
  ) {
    super(message);
    this.name = "ToolError";
  }
}
