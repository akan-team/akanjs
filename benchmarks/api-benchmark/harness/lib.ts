import { mkdir } from "node:fs/promises";
import path from "node:path";

export const BENCH_ROOT = path.resolve(import.meta.dir, "..");
export const RESULTS_DIR = path.join(BENCH_ROOT, "results");

export const ensureDir = async (dir: string): Promise<void> => {
  await mkdir(dir, { recursive: true });
};

export const readJson = async <T>(file: string): Promise<T | null> => {
  const f = Bun.file(file);
  if (!(await f.exists())) return null;
  return (await f.json()) as T;
};

export const writeJson = async (file: string, data: unknown): Promise<void> => {
  await ensureDir(path.dirname(file));
  await Bun.write(file, `${JSON.stringify(data, null, 2)}\n`);
};

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll an HTTP URL until it responds with <500 or until timeout. Returns ms-to-ready. */
export const waitForHttp = async (url: string, timeoutMs = 30_000): Promise<number> => {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (res.status < 500) return performance.now() - start;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

export const round = (value: number | null | undefined, digits = 2): number | null => {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const which = async (bin: string): Promise<boolean> => {
  const proc = Bun.spawn(["sh", "-c", `command -v ${bin}`], { stdout: "ignore", stderr: "ignore" });
  return (await proc.exited) === 0;
};

export interface SpawnHandle {
  proc: Bun.Subprocess;
  pid: number;
  stop: () => Promise<void>;
}

const childPidsOf = async (rootPid: number): Promise<number[]> => {
  const proc = Bun.spawn(["ps", "-axo", "pid=,ppid="], { stdout: "pipe", stderr: "ignore" });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  const children = new Map<number, number[]>();
  for (const line of output.split("\n")) {
    const [pidRaw, ppidRaw] = line.trim().split(/\s+/);
    const pid = Number(pidRaw);
    const ppid = Number(ppidRaw);
    if (!pid || !ppid) continue;
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  const result: number[] = [];
  const stack = [...(children.get(rootPid) ?? [])];
  while (stack.length) {
    const pid = stack.pop();
    if (!pid) continue;
    result.push(pid);
    stack.push(...(children.get(pid) ?? []));
  }
  return result;
};

const killPid = (pid: number, signal: "SIGTERM" | "SIGKILL") => {
  try {
    process.kill(pid, signal);
  } catch {
    // already dead
  }
};

/** Spawn a long-running server process and return a handle with graceful stop. */
export const spawnServer = (cmd: string[], env: Record<string, string>, cwd = BENCH_ROOT): SpawnHandle => {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  const pid = proc.pid;
  const stop = async () => {
    const childPids = await childPidsOf(pid);
    try {
      proc.kill("SIGTERM");
      for (const childPid of childPids) killPid(childPid, "SIGTERM");
      await Promise.race([proc.exited, sleep(5_000)]);
    } catch {
      // ignore
    }
    try {
      proc.kill("SIGKILL");
    } catch {
      // already dead
    }
    for (const childPid of await childPidsOf(pid)) killPid(childPid, "SIGKILL");
    for (const childPid of childPids) killPid(childPid, "SIGKILL");
  };
  return { proc, pid, stop };
};
