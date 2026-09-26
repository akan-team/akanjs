import { mkdir } from "node:fs/promises";
import path from "node:path";

export interface IdleWatchedResult {
  exitCode: number | null;
  hung: boolean;
  timedOut: boolean;
  output: string;
  ms: number;
}

interface IdleWatchedOptions {
  logPath: string;
  idleMs: number;
  totalMs?: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
  onIdle?: () => Promise<void>;
  onOutput?: (text: string) => void;
}

/**
 * Runs a command with its output teed into a log, and gives up on it once the output goes quiet.
 * Silence is the only reliable hang signal: a runner stuck in a synchronous loop (Bun 1.4.2's Windows
 * websocket crash spun at 100% CPU) never lets bun's own per-test timeout fire.
 */
export class IdleWatchedProcess {
  readonly #command: string[];
  readonly #options: IdleWatchedOptions;

  constructor(command: string[], options: IdleWatchedOptions) {
    this.#command = command;
    this.#options = options;
  }

  async run(): Promise<IdleWatchedResult> {
    const { logPath, idleMs, totalMs, cwd, env, onIdle, onOutput } = this.#options;
    await mkdir(path.dirname(logPath), { recursive: true });
    const log = Bun.file(logPath).writer();
    const startedAt = performance.now();
    let lastOutputAt = startedAt;
    let output = "";
    let hung = false;
    let timedOut = false;
    const proc = Bun.spawn(this.#command, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const pump = async (stream: ReadableStream<Uint8Array>) => {
      const decoder = new TextDecoder();
      for await (const chunk of stream) {
        lastOutputAt = performance.now();
        const text = decoder.decode(chunk, { stream: true });
        output += text;
        log.write(chunk);
        onOutput?.(text);
      }
    };
    const pumping = Promise.all([pump(proc.stdout), pump(proc.stderr)]);
    const watch = setInterval(
      () => {
        const now = performance.now();
        if (now - lastOutputAt >= idleMs) hung = true;
        else if (totalMs !== undefined && now - startedAt >= totalMs) timedOut = true;
        else return;
        clearInterval(watch);
        void (async () => {
          await onIdle?.().catch(() => undefined);
          proc.kill();
        })();
      },
      Math.max(50, Math.min(1000, idleMs / 4)),
    );
    const exitCode = await proc.exited;
    clearInterval(watch);
    await pumping;
    await log.end();
    return { exitCode: hung || timedOut ? null : exitCode, hung, timedOut, output, ms: performance.now() - startedAt };
  }
}
