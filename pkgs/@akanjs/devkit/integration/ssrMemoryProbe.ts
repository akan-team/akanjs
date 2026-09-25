import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type SsrProcRole = "gateway" | "replica" | "rsc" | "other";

export interface SsrProc {
  pid: number;
  ppid: number;
  rssMb: number;
  cpuSec: number;
  role: SsrProcRole;
  command: string;
}

export interface SsrCgroupSample {
  currentMb: number;
  anonMb: number;
  fileMb: number;
}

export interface SsrCacheSample {
  replicaRssMb: number;
  rscWorkerRssMb: number;
  htmlEntries: number;
  htmlBytes: number;
  rscEntries: number;
  rscBytes: number;
  patchEntries: number;
  patchBytes: number;
  ssrChunkKeys: number;
  loadedRouteModules: number;
  fullSsr: number;
  rscNavigation: number;
  heap: SsrHeapSample;
}

/**
 * RSS minus JS heap is what a module graph costs beyond its objects — compiled code, module
 * records, native allocator retention — so the split is what separates "the app retains objects"
 * from "the runtime retains code". `jscExtra` is JSC's off-heap attribution, which is where
 * typed-array backing stores (cached Flight chunks) land.
 */
export interface SsrHeapSample {
  replicaHeapUsedMb: number;
  replicaJscHeapMb: number;
  replicaJscExtraMb: number;
  workerHeapUsedMb: number;
  workerJscHeapMb: number;
  workerJscExtraMb: number;
}

export interface SsrMemoryProbeOptions {
  appName: string;
  /** Built app directory — `dist/apps/<app>` unless the build was relocated. */
  distDir: string;
  port: number;
  basePaths: string;
  repoName: string;
  serveDomain: string;
  scenarios: number[];
  /** Repeat count for scenario 1 (same route) and per-route passes in scenario 6. */
  repeats: number;
  concurrencies: number[];
  idleSeconds: number;
  /** Report cadence forced on the children; also bounds how long a sample waits for a fresh one. */
  metricsIntervalMs: number;
  /** Disables both result caches at boot — the second half of scenario 3. */
  cacheOff: boolean;
  /**
   * Forces `Bun.gc(true)` before every metrics sample. Required for the s7 ratchet test: without
   * it, growth across passes cannot be told apart from garbage that has not been collected yet.
   */
  gcOnReport: boolean;
  /** s7: how many times to walk the whole route list. */
  passes: number;
  /** s8: cumulative distinct-route counts to sample the per-route slope at. */
  sweep: number[];
  logPath: string;
}

/**
 * Production process-tree RSS and cache occupancy — probe §0.3 of
 * `local/reduce-ssr-ram/01-measurement-harness.md`, and the source of the phase 0 results table.
 *
 *   bun pkgs/@akanjs/devkit/integration/ssrMemoryProbe.ts <app> [--scenarios=1,2,5] [--cache=off]
 *
 * The production tree is gateway → replica × N → rsc worker × N, with no builder; `DevResourceProbe`
 * measures the dev tree instead and the two are not interchangeable.
 *
 * Two things this exists to get right:
 *
 * - **Replica and worker RSS are reported separately.** They are separate processes and the worker
 *   holds a private copy of the pages bundle, so one summed number hides which of the two grows.
 * - **On Linux it samples the cgroup's `anon` / `file` split, not just RSS.** Whether a cache is
 *   anonymous heap (an OOM contributor) or page cache (evictable) is the entire question phase 2
 *   asks; RSS cannot answer it, and neither can macOS, where the file half does not exist in the
 *   same form. Read a macOS run as directional only.
 */
export class SsrMemoryProbe {
  static readonly #columns: SsrProcRole[] = ["gateway", "replica", "rsc"];

  static parseArgs(argv: string[]): SsrMemoryProbeOptions {
    const args = new Map(
      argv.slice(1).map((arg) => {
        const [key, value] = arg.replace(/^--/, "").split("=");
        return [key ?? "", value ?? "1"];
      }),
    );
    const appName = argv[0] ?? "akan";
    const num = (key: string, fallback: number) => Number(args.get(key) ?? fallback);
    const list = (key: string, fallback: number[]) =>
      args.has(key)
        ? (args.get(key) ?? "")
            .split(",")
            .map(Number)
            .filter((value) => Number.isFinite(value) && value > 0)
        : fallback;
    return {
      appName,
      distDir: args.get("dist") ?? path.join(process.cwd(), "dist", "apps", appName),
      port: num("port", 8482),
      basePaths: args.get("basePaths") ?? "",
      repoName: args.get("repo") ?? path.basename(process.cwd()),
      serveDomain: args.get("domain") ?? "localhost",
      scenarios: list("scenarios", [1, 2, 5, 6]),
      repeats: num("repeats", 200),
      concurrencies: list("concurrency", [1, 8, 32]),
      idleSeconds: num("idle", 300),
      metricsIntervalMs: num("metricsInterval", 10_000),
      cacheOff: args.get("cache") === "off",
      gcOnReport: args.has("gc"),
      passes: num("passes", 3),
      sweep: list("sweep", [1, 10, 50, 169]),
      logPath: args.get("log") ?? path.join(os.tmpdir(), `akan-ssr-memory-${appName}.log`),
    };
  }

  readonly #options: SsrMemoryProbeOptions;
  #gatewayPid = 0;

  constructor(options: SsrMemoryProbeOptions) {
    this.#options = options;
  }

  async run(): Promise<void> {
    const { appName, distDir, port, basePaths, repoName, serveDomain, logPath, cacheOff } = this.#options;
    if (!fs.existsSync(path.join(distDir, "main.js")))
      throw new Error(`no built app at ${distDir} — run \`akan build ${appName}\` first`);
    await Bun.write(logPath, "");
    const gateway = Bun.spawn(["bun", "main.js"], {
      cwd: distDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        USE_AKANJS_PKGS: "true",
        AKAN_PUBLIC_APP_NAME: appName,
        // `getEnv()` requires these one at a time, and a missing one fails the *replica* while the
        // gateway stays up: the process tree still looks like a healthy three, and only the child's
        // `ready` flag and the 503s give it away. Both are why `#waitForReady` checks child
        // readiness rather than the gateway's own 200.
        AKAN_PUBLIC_REPO_NAME: process.env.AKAN_PUBLIC_REPO_NAME ?? repoName,
        AKAN_PUBLIC_SERVE_DOMAIN: process.env.AKAN_PUBLIC_SERVE_DOMAIN ?? serveDomain,
        AKAN_PUBLIC_ENV: "local",
        AKAN_PUBLIC_OPERATION_MODE: "local",
        SERVER_MODE: "federation",
        ...(basePaths ? { AKAN_PUBLIC_BASE_PATHS: basePaths } : {}),
        PORT: String(port),
        AKAN_MEMORY_LOG: "1",
        AKAN_MEMORY_LOG_INTERVAL_MS: String(this.#options.metricsIntervalMs),
        ...(cacheOff ? { AKAN_HTML_RESULT_CACHE: "0", AKAN_RSC_RESULT_CACHE: "0" } : {}),
        ...(this.#options.gcOnReport ? { AKAN_MEMORY_GC_ON_REPORT: "1" } : {}),
      },
      stdout: Bun.file(logPath),
      stderr: Bun.file(logPath),
    });
    this.#gatewayPid = gateway.pid;
    console.info(
      `[probe] app=${appName} pid=${gateway.pid} port=${port} cache=${cacheOff ? "off" : "on"} log=${logPath}`,
    );
    try {
      await this.#measure();
    } finally {
      await this.#cleanup(gateway);
    }
  }

  async #measure(): Promise<void> {
    const { scenarios, repeats, concurrencies, idleSeconds } = this.#options;
    if (!(await this.#waitForReady(180_000)))
      throw new Error(`no replica became ready within 180s — see ${this.#options.logPath}`);
    // Route modules are evaluated on first request, so nothing before this line is a floor.
    await Bun.sleep(5_000);

    console.info(`\n${"sample".padEnd(24)} ${["gway", "repl", "rsc"].map((h) => h.padStart(6)).join(" ")}`);
    await this.#sample("boot");

    const routes = await this.#staticRoutes();
    console.info(`[probe] ${routes.length} static route(s) resolved`);

    if (scenarios.includes(1)) {
      const route = routes[0] ?? "/";
      await this.#run(
        `s1 same-route x${repeats}`,
        Array.from({ length: repeats }, () => route),
        1,
      );
    }

    if (scenarios.includes(2)) await this.#run("s2 every-route x1", routes, 1);

    if (scenarios.includes(4)) {
      await this.#run(
        "s4 rsc-only",
        routes.map((route) => `/__rsc?url=${encodeURIComponent(route)}`),
        1,
      );
    }

    if (scenarios.includes(6)) {
      for (const concurrency of concurrencies) await this.#run(`s6 concurrency=${concurrency}`, routes, concurrency);
    }

    // s7 — ratchet vs working set. Every pass renders the same routes, so pass 1 pays for module
    // evaluation and later passes pay for nothing new. Flat later passes mean the memory is a
    // working set and only a smaller bundle or fewer replicas reduces it; continued growth means
    // per-render retention, which is a bug worth more than any ceiling. Run with `--cache=off --gc`
    // or it measures cache hits and uncollected garbage instead.
    if (scenarios.includes(7)) {
      if (!this.#options.cacheOff)
        console.info("[probe] WARNING s7 without --cache=off measures cache hits from pass 2 on");
      if (!this.#options.gcOnReport)
        console.info("[probe] WARNING s7 without --gc cannot separate retention from uncollected garbage");
      for (let pass = 1; pass <= this.#options.passes; pass += 1)
        await this.#run(`s7 pass ${pass}/${this.#options.passes}`, routes, 1);
    }

    // s8 — per-route slope vs fixed intercept. Cumulative: each step adds routes the process has
    // not seen, so the RSS series against distinct-route count separates the two.
    if (scenarios.includes(8)) {
      for (const count of this.#options.sweep) {
        const subset = routes.slice(0, Math.min(count, routes.length));
        if (subset.length === 0) continue;
        await this.#run(`s8 routes<=${subset.length}`, subset, 1);
      }
    }

    if (scenarios.includes(5)) {
      const started = Date.now();
      while ((Date.now() - started) / 1_000 < idleSeconds) {
        await Bun.sleep(30_000);
        await this.#sample(`s5 idle+${Math.round((Date.now() - started) / 1_000)}s`);
      }
      console.info("[probe] idle reclamation is the delta from the last pre-idle row; expect none today");
    }
  }

  /**
   * A scenario is only a measurement if its requests succeeded. A gateway whose replica died still
   * answers — with 503s, instantly — and the resulting RSS row looks like a legitimately cheap one.
   * Fail loudly rather than publish that number.
   */
  async #run(label: string, urls: string[], concurrency: number): Promise<void> {
    const started = Date.now();
    const { ok, failed, statuses } = await this.#browse(urls, concurrency);
    const elapsed = ((Date.now() - started) / 1_000).toFixed(1);
    const breakdown = [...statuses.entries()].map(([status, count]) => `${status}×${count}`).join(" ");
    console.info(`[probe] ${label}: ok=${ok} failed=${failed} in ${elapsed}s (${breakdown})`);
    if (ok === 0) throw new Error(`${label}: every request failed (${breakdown}) — the sample would be meaningless`);
    if (failed > 0) console.info(`[probe] WARNING ${label} has ${failed} failed request(s); the row below is partial`);
    await this.#sample(label, Date.now());
  }

  async #sample(label: string, since = Date.now()): Promise<void> {
    const procs = await this.#sampleTree();
    const byRole = new Map<SsrProcRole, number>();
    for (const proc of procs) byRole.set(proc.role, (byRole.get(proc.role) ?? 0) + proc.rssMb);
    const total = procs.reduce((sum, proc) => sum + proc.rssMb, 0);
    const mb = (value: number) => value.toFixed(0).padStart(6);
    const cells = SsrMemoryProbe.#columns.map((role) => (byRole.has(role) ? mb(byRole.get(role) ?? 0) : "     —"));
    const cgroup = SsrMemoryProbe.readCgroupSample();
    console.info(
      `${label.padEnd(24)} ${cells.join(" ")} | total ${mb(total)}MB n=${procs.length}` +
        (cgroup
          ? ` | cgroup ${cgroup.currentMb.toFixed(0)}MB anon=${cgroup.anonMb.toFixed(0)} file=${cgroup.fileMb.toFixed(0)}`
          : ""),
    );
    const cache = await this.#sampleCaches(since);
    if (!cache) return;
    console.info(
      `${"".padEnd(24)} caches: html=${cache.htmlEntries}/${SsrMemoryProbe.#mib(cache.htmlBytes)} ` +
        `rsc=${cache.rscEntries}/${SsrMemoryProbe.#mib(cache.rscBytes)} ` +
        `patch=${cache.patchEntries}/${SsrMemoryProbe.#mib(cache.patchBytes)} ` +
        `ssrChunkKeys=${cache.ssrChunkKeys} routeModules=${cache.loadedRouteModules} ` +
        `req=${cache.fullSsr}ssr/${cache.rscNavigation}rsc`,
    );
    const { heap } = cache;
    const n = (value: number) => value.toFixed(0);
    console.info(
      `${"".padEnd(24)} heap:   repl heapUsed=${n(heap.replicaHeapUsedMb)} jsc=${n(heap.replicaJscHeapMb)} ` +
        `jscExtra=${n(heap.replicaJscExtraMb)} | rsc heapUsed=${n(heap.workerHeapUsedMb)} ` +
        `jsc=${n(heap.workerJscHeapMb)} jscExtra=${n(heap.workerJscExtraMb)} (MB)`,
    );
  }

  static #mib(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(1)}MiB`;
  }

  /**
   * Reads the container's own accounting. `memory.current` counts page cache, so a disk-backed
   * cache still shows up here — but under `file`, which the kernel reclaims under pressure instead
   * of OOM-killing. That split is what phase 2 has to move. Returns null off cgroup v2.
   */
  static readCgroupSample(): SsrCgroupSample | null {
    try {
      const current = Number.parseInt(fs.readFileSync("/sys/fs/cgroup/memory.current", "utf8").trim(), 10);
      if (!Number.isFinite(current)) return null;
      const stat = fs.readFileSync("/sys/fs/cgroup/memory.stat", "utf8");
      const field = (name: string) => {
        const parsed = Number.parseInt(new RegExp(`^${name} (\\d+)$`, "m").exec(stat)?.[1] ?? "", 10);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const toMb = (bytes: number) => bytes / 1024 / 1024;
      return { currentMb: toMb(current), anonMb: toMb(field("anon")), fileMb: toMb(field("file")) };
    } catch {
      return null;
    }
  }

  /**
   * Waits for a metrics report sampled *after* `since` before reading the cache columns.
   *
   * The counters ride a periodic IPC report, so reading immediately after a browse returns the
   * state from before it — and the two-hop path (worker → replica → gateway) means the `rsc*` and
   * `rscWorker*` fields can be a further interval behind. Without this wait every row silently
   * attributes one scenario's cache growth to the previous scenario.
   */
  async #sampleCaches(since: number): Promise<SsrCacheSample | null> {
    const deadline = Date.now() + this.#options.metricsIntervalMs * 3 + 5_000;
    let children: Array<Record<string, number>> = [];
    let fresh = false;
    while (Date.now() < deadline) {
      children = await this.#fetchChildMetrics();
      // Both hops must have re-reported: `reportedAt` is the replica's own sample time, and
      // `rscWorkerReportedAt` the worker's as of the replica's last read of it.
      fresh =
        children.length > 0 &&
        children.every(
          (metrics) => Number(metrics.reportedAt ?? 0) >= since && Number(metrics.rscWorkerReportedAt ?? 0) >= since,
        );
      if (fresh) break;
      await Bun.sleep(500);
    }
    if (children.length === 0) return null;
    if (!fresh) console.info(`${"".padEnd(24)} WARNING cache columns are stale — no fresh report within the wait`);
    {
      const sum = (key: string) => children.reduce((total, metrics) => total + Number(metrics[key] ?? 0), 0);
      const mb = (key: string) => sum(key) / 1024 / 1024;
      return {
        replicaRssMb: sum("rssBytes") / 1024 / 1024,
        rscWorkerRssMb: sum("rscWorkerRssBytes") / 1024 / 1024,
        htmlEntries: sum("httpHtmlCacheEntries"),
        htmlBytes: sum("httpHtmlCacheBytes"),
        rscEntries: sum("rscResultCacheEntries"),
        rscBytes: sum("rscResultCacheBytes"),
        patchEntries: sum("rscPatchResultCacheEntries"),
        patchBytes: sum("rscPatchResultCacheBytes"),
        ssrChunkKeys: sum("ssrChunkRegistrySize"),
        loadedRouteModules: sum("rscLoadedRouteModuleCount"),
        fullSsr: sum("httpFullSsrCount"),
        rscNavigation: sum("httpRscNavigationCount"),
        heap: {
          replicaHeapUsedMb: mb("heapUsedBytes"),
          replicaJscHeapMb: mb("jscHeapSizeBytes"),
          replicaJscExtraMb: mb("jscExtraMemorySizeBytes"),
          workerHeapUsedMb: mb("rscWorkerHeapUsedBytes"),
          workerJscHeapMb: mb("rscWorkerJscHeapSizeBytes"),
          workerJscExtraMb: mb("rscWorkerJscExtraMemorySizeBytes"),
        },
      };
    }
  }

  async #fetchChildMetrics(): Promise<Array<Record<string, number>>> {
    try {
      const res = await fetch(`http://localhost:${this.#options.port}/_akan/app/metrics`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { children?: Array<{ metrics?: Record<string, number> }> };
      return (body.children ?? []).map((child) => child.metrics ?? {});
    } catch {
      return [];
    }
  }

  #roleOf(command: string): SsrProcRole {
    if (/rscWorker\.js|react-server/.test(command)) return "rsc";
    if (/\bmain\.js\b/.test(command)) return "gateway";
    if (/server\.js|bun -e|import\(/.test(command)) return "replica";
    return "other";
  }

  /** One `ps`, then walk from the gateway pid to a fixpoint. */
  async #sampleTree(): Promise<SsrProc[]> {
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
        } satisfies SsrProc;
      })
      .filter((proc): proc is SsrProc => proc !== null);
    const kept = new Map<number, SsrProc>();
    const root = all.find((proc) => proc.pid === this.#gatewayPid);
    if (root) kept.set(this.#gatewayPid, root);
    for (let pass = 0; pass < 12; pass++) {
      const before = kept.size;
      for (const proc of all) if (kept.has(proc.ppid) && !kept.has(proc.pid)) kept.set(proc.pid, proc);
      if (kept.size === before) break;
    }
    return [...kept.values()].filter((proc) => proc.role !== "other" || proc.pid === this.#gatewayPid);
  }

  /**
   * Concrete urls from the built route seed index. `:lang` takes the default locale; any route with
   * another `:param` is skipped because it needs a real id to render.
   */
  async #staticRoutes(): Promise<string[]> {
    const artifactDir = path.join(this.#options.distDir, ".akan", "artifact");
    const seed = (await Bun.file(path.join(artifactDir, "route-seed-index.json")).json()) as {
      entries: Array<{ routeId: string }>;
    };
    const artifact = (await Bun.file(path.join(artifactDir, "base-artifact.json")).json()) as {
      i18n?: { defaultLocale?: string };
    };
    const locale = artifact.i18n?.defaultLocale ?? "en";
    const urls = new Set<string>();
    for (const entry of seed.entries) {
      const url = entry.routeId.replace(/:lang\b/g, locale);
      if (/[:[]/.test(url)) continue;
      urls.add(url.startsWith("/") ? url : `/${url}`);
    }
    return [...urls].sort();
  }

  async #browse(
    urls: string[],
    concurrency: number,
  ): Promise<{ ok: number; failed: number; statuses: Map<string, number> }> {
    let ok = 0;
    let failed = 0;
    let cursor = 0;
    const statuses = new Map<string, number>();
    const record = (key: string) => statuses.set(key, (statuses.get(key) ?? 0) + 1);
    const worker = async () => {
      while (cursor < urls.length) {
        const url = urls[cursor++];
        if (url === undefined) return;
        try {
          const res = await fetch(`http://localhost:${this.#options.port}${url}`, {
            signal: AbortSignal.timeout(60_000),
          });
          // Drain the body: SSR streams, so a response is not rendered until it is read.
          await res.arrayBuffer();
          record(String(res.status));
          if (res.ok) ok++;
          else failed++;
        } catch (error) {
          record(error instanceof Error ? error.name : "error");
          failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    return { ok, failed, statuses };
  }

  /**
   * Waits for a **child** to report ready, not for the gateway to answer. The gateway binds and
   * serves `/health` happily while every replica is in a crash-restart loop, so a 200 here proves
   * nothing about whether anything can render.
   */
  async #waitForReady(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let lastError = "";
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://localhost:${this.#options.port}/_akan/app/health`, {
          signal: AbortSignal.timeout(2_000),
        });
        if (res.ok) {
          const body = (await res.json()) as {
            children?: Array<{ ready?: boolean; role?: string; lastErrorMessage?: string }>;
          };
          const children = body.children ?? [];
          if (children.some((child) => child.ready && child.role !== "batch")) return true;
          lastError = children.find((child) => child.lastErrorMessage)?.lastErrorMessage ?? lastError;
        }
      } catch {
        // The gateway binds before the replicas are up; keep polling until one answers.
      }
      await Bun.sleep(1_000);
    }
    if (lastError) console.info(`[probe] no child became ready; last child error: ${lastError}`);
    return false;
  }

  async #cleanup(gateway: { kill: (signal: NodeJS.Signals) => void }): Promise<void> {
    for (const proc of (await this.#sampleTree()).reverse()) {
      try {
        process.kill(proc.pid, "SIGKILL");
      } catch {}
    }
    try {
      gateway.kill("SIGKILL");
    } catch {}
    await Bun.sleep(1_000);
    console.info(`[probe] survivors after kill: ${(await this.#sampleTree()).length}`);
  }
}

if (import.meta.main) await new SsrMemoryProbe(SsrMemoryProbe.parseArgs(process.argv.slice(2))).run();
