// Running toolchain commands with readable failures.

import { AsyncLocalStorage } from "node:async_hooks";
import { basename } from "node:path";
import { pipeLines } from "./launch.ts";
import { CliError, dim, isTerminal, log, ToolError } from "./log.ts";

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** Print the command before running it. Default true. */
  echo?: boolean;
  /** Stream output to the terminal instead of capturing it (to the log sink inside an API call). */
  inherit?: boolean;
  /** The tool name on streamed lines. Default the command's file name. */
  tool?: string;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

const signals = new AsyncLocalStorage<AbortSignal>();

/** Runs `fn` with every command it starts killed when `signal` aborts (docs/api.md `signal`). */
export function withSignal<T>(signal: AbortSignal | undefined, fn: () => T): T {
  return signal ? signals.run(signal, fn) : fn();
}

/** The abort signal of the API call this runs in, if any. */
export function currentSignal(): AbortSignal | undefined {
  return signals.getStore();
}

/** A command killed because the API call was cancelled. */
export class CancelledError extends CliError {
  constructor() {
    super("cancelled");
    this.name = "CancelledError";
  }
}

/** Throws CancelledError once the current API call was cancelled. */
export function throwIfCancelled(): void {
  if (signals.getStore()?.aborted) throw new CancelledError();
}

function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function formatCommand(cmd: string[]): string {
  return cmd.map(shellQuote).join(" ");
}

/** Runs a command and returns its output. Does not throw on a non-zero exit. */
export async function exec(cmd: string[], options: ExecOptions = {}): Promise<ExecResult> {
  throwIfCancelled();
  if (options.echo !== false) log.info(dim(`$ ${formatCommand(cmd)}`));
  const signal = signals.getStore();
  // Inside an API call there is no terminal: streamed output becomes tool lines of the caller's log.
  const stream = options.inherit && isTerminal() ? "inherit" : "pipe";
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdin: "ignore",
    stdout: stream,
    stderr: stream,
    ...(signal ? { signal } : {}),
  });
  let stdout = "";
  let stderr = "";
  if (options.inherit && stream === "pipe") {
    const tool = options.tool ?? basename(cmd[0] ?? "");
    await Promise.all([
      pipeLines(proc.stdout as ReadableStream, (line) => log.tool(tool, line)),
      pipeLines(proc.stderr as ReadableStream, (line) => log.tool(tool, line)),
    ]);
  } else if (stream === "pipe") {
    [stdout, stderr] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
    ]);
  }
  const code = await proc.exited;
  throwIfCancelled();
  return { code, stdout, stderr };
}

/** Runs a command and throws a ToolError with its output when it fails. */
export async function execOrThrow(cmd: string[], options: ExecOptions = {}): Promise<ExecResult> {
  const result = await exec(cmd, options);
  if (result.code !== 0) {
    const tail = (result.stderr || result.stdout).trim().split("\n").slice(-30);
    const output = tail.join("\n");
    throw new ToolError(
      `command failed (exit ${result.code}): ${formatCommand(cmd)}${output ? `\n${output}` : ""}`,
      output ? tail : [],
    );
  }
  return result;
}
