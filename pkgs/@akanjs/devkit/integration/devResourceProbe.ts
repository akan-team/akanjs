import os from "node:os";
import path from "node:path";

export type DevResourceRole = "host" | "builder" | "batch" | "gateway" | "replica" | "rsc" | "other";

export interface DevResourceProc {
  pid: number;
  ppid: number;
  rssMb: number;
  cpuSec: number;
  role: DevResourceRole;
  command: string;
}

export interface DevResourceProbeOptions {
  appName: string;
  /** Must be the workspace root: package resolution has to match the real dev processes. */
  workspaceRoot: string;
  /** A tenant runs `node_modules/@akanjs/cli`; this repo runs its own `dist` build. */
  cliEntry: string;
  port: number;
  edits: number;
  idleSeconds: number;
  /** `0` leaves idle suspend at its default; any other value also arms the suspend phase. */
  suspendSeconds: number;
  /** App-relative file to append a comment to, once per edit. */
  editPath: string;
  logPath: string;
}

/**
 * Process-tree RSS over boot, browse, edits and idle-suspend — probe #1 of
 * `04-measurement-harness.md`, and the source of every idle/warm/suspended number in the
 * `optimize-resource` docs.
 *
 *   bun pkgs/@akanjs/devkit/integration/devResourceProbe.ts <app> [--idle=120] [--edits=3] [--suspend=60]
 *
 * Run it from the workspace root. Two things it exists to get right, both learned the hard way:
 * it walks the process tree to a **fixpoint** (the tree is seven levels deep in places, so a
 * fixed-depth walk silently misses the workers), and it **restores the edited file** in a `finally`
 * so a killed probe cannot leave a comment in the tree.
 *
 * On macOS, a plateau that drops with no activity is the OS trimming idle pages, not convergence —
 * report both numbers rather than the lower one.
 */
export class DevResourceProbe {
  static readonly #columns: DevResourceRole[] = ["host", "builder", "batch", "gateway", "replica", "rsc"];

  static parseArgs(argv: string[]): DevResourceProbeOptions {
    const args = new Map(
      argv.slice(1).map((arg) => {
        const [key, value] = arg.replace(/^--/, "").split("=");
        return [key ?? "", value ?? "1"];
      }),
    );
    const appName = argv[0] ?? "akan";
    const num = (key: string, fallback: number) => Number(args.get(key) ?? fallback);
    return {
      appName,
      workspaceRoot: args.get("root") ?? process.cwd(),
      cliEntry: args.get("cli") ?? "dist/pkgs/@akanjs/cli/index.js",
      port: num("port", 8482),
      edits: num("edits", 3),
      idleSeconds: num("idle", 120),
      suspendSeconds: num("suspend", 0),
      editPath: args.get("edit") ?? "page/(home)/_index.tsx",
      logPath: args.get("log") ?? path.join(os.tmpdir(), `akan-dev-resource-${appName}.log`),
    };
  }

  readonly #options: DevResourceProbeOptions;
  #hostPid = 0;

  constructor(options: DevResourceProbeOptions) {
    this.#options = options;
  }

  async run(): Promise<void> {
    const { appName, workspaceRoot, cliEntry, port, logPath, suspendSeconds } = this.#options;
    await Bun.write(logPath, "");
    const host = Bun.spawn(["bun", cliEntry, "start", appName], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        AKAN_PUBLIC_LOG_LEVEL: "verbose",
        // Pinned: the derived port moves with the `apps/` listing, so a probe cannot predict it.
        AKAN_DEV_PORT: String(port),
        ...(suspendSeconds ? { AKAN_DEV_IDLE_SUSPEND_MS: String(suspendSeconds * 1_000) } : {}),
      },
      stdout: Bun.file(logPath),
      stderr: Bun.file(logPath),
    });
    this.#hostPid = host.pid;
    console.info(`[probe] app=${appName} hostPid=${host.pid} port=${port} log=${logPath}`);

    // Captured before the try so a crashed probe cannot leave a probe comment in the user's tree.
    const target = path.join(workspaceRoot, "apps", appName, this.#options.editPath);
    const original = await Bun.file(target)
      .text()
      .catch(() => null);
    try {
      await this.#measure(target, original);
    } finally {
      if (
        original !== null &&
        (await Bun.file(target)
          .text()
          .catch(() => "")) !== original
      )
        await Bun.write(target, original);
      await this.#cleanup(host);
    }
  }

  async #measure(target: string, original: string | null): Promise<void> {
    const { appName, edits, idleSeconds, suspendSeconds } = this.#options;
    const booted = await this.#waitForLog(/backend ready pid=\d+|gateway is running on port/, 240_000);
    console.info(`[probe] boot log seen=${booted}`);

    const header = ["host", "bldr", "batch", "gway", "repl", "rsc"].map((h) => h.padStart(5)).join(" ");
    console.info(`\n${"sample".padEnd(22)} ${header}`);
    const started = Date.now();
    let idleTotal = 0;
    while ((Date.now() - started) / 1_000 < idleSeconds) {
      await Bun.sleep(5_000);
      idleTotal = this.#row(`idle+${Math.round((Date.now() - started) / 1_000)}s`, await this.#sampleTree());
    }
    console.info(`[probe] IDLE BASELINE ${idleTotal.toFixed(0)}MB`);
    await this.#reportMetrics("idle");

    // 4.2: every idle number understates, because route modules are evaluated on first request.
    const routes = await this.#staticRoutes();
    const first = await this.#browse(routes);
    console.info(`[probe] browsed ${routes.length} static route(s): ok=${first.ok} failed=${first.failed}`);
    this.#row("browse-all-once", await this.#sampleTree());
    const hot = routes.slice(0, Math.max(1, Math.ceil(routes.length / 4)));
    for (let pass = 1; pass <= 3; pass++) await this.#browse(hot);
    const warm = this.#row("browse-hot-x3", await this.#sampleTree());
    console.info(`[probe] WARM TOTAL ${warm.toFixed(0)}MB (idle was ${idleTotal.toFixed(0)}MB)`);
    await this.#reportMetrics("warm");

    if (original === null) console.info(`[probe] no edit target at ${target}; skipping edits`);
    else {
      for (let edit = 1; edit <= edits; edit++) {
        await Bun.write(target, `${original}\n// probe-edit-${edit}\n`);
        await Bun.sleep(25_000);
        this.#row(`edit${edit}`, await this.#sampleTree());
      }
      await Bun.write(target, original);
      await Bun.sleep(10_000);
      this.#row("restored", await this.#sampleTree());
    }
    await this.#reportMetrics("after-edits");

    if (!suspendSeconds) return;
    const suspended = await this.#waitForLog(/\[idle-suspend\].*released the builder/, (suspendSeconds + 60) * 1_000);
    console.info(`[probe] idle-suspend seen=${suspended} (app=${appName})`);
    await Bun.sleep(5_000);
    console.info(`[probe] IDLE-SUSPENDED ${this.#row("idle-suspended", await this.#sampleTree()).toFixed(0)}MB`);
  }

  #roleOf(command: string): DevResourceRole {
    if (/cli\/index\.js\s+start\s/.test(command)) return "host";
    if (/incrementalBuilder\.proc/.test(command)) return "builder";
    if (/buildBatch\.proc/.test(command)) return "batch";
    if (/rscWorker|react-server/.test(command)) return "rsc";
    if (new RegExp(`apps/${this.#options.appName}/main\\.ts`).test(command)) return "gateway";
    if (/server\.ts|import\(/.test(command)) return "replica";
    return "other";
  }

  /** One `ps`, then walk from the host pid to a fixpoint — the tree is seven levels deep in places. */
  async #sampleTree(): Promise<DevResourceProc[]> {
    const proc = Bun.spawn(["ps", "-eo", "pid=,ppid=,rss=,time=,command="], { stdout: "pipe" });
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    const all = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = /^(\d+)\s+(\d+)\s+(\d+)\s+([\d:.]+)\s+(.*)$/.exec(line);
        if (!match) return null;
        const [, pid, ppid, rss, time, command] = match;
        const parts = (time ?? "0:0").split(":");
        const cpuSec =
          parts.length === 3
            ? Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
            : Number(parts[0] ?? 0) * 60 + Number(parts[1] ?? 0);
        return {
          pid: Number(pid),
          ppid: Number(ppid),
          rssMb: Number(rss) / 1024,
          cpuSec,
          role: this.#roleOf(command ?? ""),
          command: command ?? "",
        } satisfies DevResourceProc;
      })
      .filter((proc): proc is DevResourceProc => proc !== null);
    const kept = new Map<number, DevResourceProc>();
    const root = all.find((proc) => proc.pid === this.#hostPid);
    if (root) kept.set(this.#hostPid, root);
    for (let pass = 0; pass < 12; pass++) {
      const before = kept.size;
      for (const proc of all) if (kept.has(proc.ppid) && !kept.has(proc.pid)) kept.set(proc.pid, proc);
      if (kept.size === before) break;
    }
    return [...kept.values()].filter((proc) => proc.role !== "other" || proc.pid === this.#hostPid);
  }

  #row(label: string, procs: DevResourceProc[]): number {
    const byRole = new Map<DevResourceRole, number>();
    for (const proc of procs) byRole.set(proc.role, (byRole.get(proc.role) ?? 0) + proc.rssMb);
    const total = procs.reduce((sum, proc) => sum + proc.rssMb, 0);
    const cpu = procs.reduce((sum, proc) => sum + proc.cpuSec, 0);
    const fmt = (value: number) => value.toFixed(0).padStart(5);
    const cells = DevResourceProbe.#columns.map((role) => (byRole.has(role) ? fmt(byRole.get(role) ?? 0) : "    —"));
    console.info(
      `${label.padEnd(22)} ${cells.join(" ")} | total ${fmt(total)}MB cpu ${cpu.toFixed(0)}s n=${procs.length}`,
    );
    return total;
  }

  /**
   * Static route urls from the page tree: `(group)` segments are stripped, and a route with a
   * `[dynamic]` segment is skipped because it needs a real id to render.
   */
  async #staticRoutes(): Promise<string[]> {
    const glob = new Bun.Glob("**/_index.tsx");
    const cwd = path.join(this.#options.workspaceRoot, "apps", this.#options.appName, "page");
    const urls = new Set<string>();
    for await (const file of glob.scan({ cwd })) {
      if (/\[[^\]]+\]/.test(file)) continue;
      const segments = file
        .replace(/\/?_index\.tsx$/, "")
        .split("/")
        .filter((segment) => segment && !/^\(.*\)$/.test(segment));
      urls.add(`/${segments.join("/")}`);
    }
    return [...urls].sort();
  }

  async #browse(urls: string[]): Promise<{ ok: number; failed: number }> {
    let ok = 0;
    let failed = 0;
    for (const url of urls) {
      try {
        const res = await fetch(`http://localhost:${this.#options.port}${url}`, {
          signal: AbortSignal.timeout(60_000),
        });
        await res.text();
        if (res.ok) ok++;
        else failed++;
      } catch {
        failed++;
      }
    }
    return { ok, failed };
  }

  /** Only the counters 4.2 asks for; the raw payload is hundreds of fields. */
  async #reportMetrics(label: string): Promise<void> {
    const child = await (async () => {
      try {
        const res = await fetch(`http://localhost:${this.#options.port}/_akan/app/metrics`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { children?: { metrics?: { [key: string]: number } }[] };
        return body.children?.[0]?.metrics ?? null;
      } catch {
        return null;
      }
    })();
    if (!child) {
      console.info(`[metrics ${label}] unavailable`);
      return;
    }
    const keys = [
      "rscRenderCount",
      "rscRouteModuleCount",
      "rscLoadedRouteModuleCount",
      "ssrChunkRegistrySize",
      "ssrChunkLoadCount",
      "rscWorkerRecycleCount",
      "httpFullSsrCount",
    ];
    const rssMb = (Number(child.rssBytes ?? 0) / 1024 / 1024).toFixed(0);
    const parts = keys.map((key) => `${key}=${child[key] ?? "?"}`);
    console.info(`[metrics ${label}] rsc rss=${rssMb}MB ${parts.join(" ")}`);
  }

  async #waitForLog(pattern: RegExp, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const text = await Bun.file(this.#options.logPath)
        .text()
        .catch(() => "");
      if (pattern.test(text)) return true;
      await Bun.sleep(500);
    }
    return false;
  }

  async #cleanup(host: { kill: (signal: NodeJS.Signals) => void }): Promise<void> {
    for (const proc of (await this.#sampleTree()).reverse()) {
      try {
        process.kill(proc.pid, "SIGKILL");
      } catch {}
    }
    try {
      host.kill("SIGKILL");
    } catch {}
    await Bun.sleep(1_000);
    console.info(`[probe] survivors after kill: ${(await this.#sampleTree()).length}`);
  }
}

if (import.meta.main) await new DevResourceProbe(DevResourceProbe.parseArgs(process.argv.slice(2))).run();
