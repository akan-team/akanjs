import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DevResourceProbe, type DevResourceProc } from "./devResourceProbe";

export type SsrProcRole = "gateway" | "replica" | "rsc" | "other";

export type SsrProc = DevResourceProc<SsrProcRole>;

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

// `jscExtra` is JSC's off-heap attribution, where typed-array backing stores (cached Flight chunks) land.
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
  distDir: string;
  port: number;
  basePaths: string;
  repoName: string;
  serveDomain: string;
  scenarios: number[];
  repeats: number;
  concurrencies: number[];
  idleSeconds: number;
  metricsIntervalMs: number;
  cacheOff: boolean;
  gcOnReport: boolean;
  passes: number;
  sweep: number[];
  logPath: string;
}

// Usage: bun pkgs/@akanjs/devkit/integration/ssrMemoryProbe.ts <app> [--scenarios=1,2,5] [--cache=off]
// The cgroup `anon`/`file` split exists only on Linux; read a macOS run as directional.
export class SsrMemoryProbe {
  static readonly #columns: SsrProcRole[] = ["gateway", "replica", "rsc"];

  static parseArgs(argv: string[]): SsrMemoryProbeOptions {
    const { appName, args, num } = DevResourceProbe.parseArgMap(argv);
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
  readonly #statusToken = randomBytes(32).toString("hex");
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
        // A missing one fails the replica while the gateway stays up and keeps answering.
        AKAN_PUBLIC_REPO_NAME: process.env.AKAN_PUBLIC_REPO_NAME ?? repoName,
        AKAN_PUBLIC_SERVE_DOMAIN: process.env.AKAN_PUBLIC_SERVE_DOMAIN ?? serveDomain,
        AKAN_PUBLIC_ENV: "local",
        AKAN_PUBLIC_OPERATION_MODE: "local",
        SERVER_MODE: "federation",
        ...(basePaths ? { AKAN_PUBLIC_BASE_PATHS: basePaths } : {}),
        PORT: String(port),
        // A built app run outside `akan start` keeps the health detail and metrics behind this token.
        AKAN_STATUS_TOKEN: this.#statusToken,
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
      await DevResourceProbe.killTree(gateway, () => this.#sampleTree());
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

    // s7: flat passes after the first mean a working set; continued growth means per-render retention.
    if (scenarios.includes(7)) {
      if (!this.#options.cacheOff)
        console.info("[probe] WARNING s7 without --cache=off measures cache hits from pass 2 on");
      if (!this.#options.gcOnReport)
        console.info("[probe] WARNING s7 without --gc cannot separate retention from uncollected garbage");
      for (let pass = 1; pass <= this.#options.passes; pass += 1)
        await this.#run(`s7 pass ${pass}/${this.#options.passes}`, routes, 1);
    }

    // s8: cumulative, so RSS against distinct-route count separates the per-route slope from the intercept.
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

  // A dead replica still answers instant 503s, which would read as a legitimately cheap row.
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

  // cgroup v2 only. `file` is page cache the kernel reclaims under pressure; `anon` is what gets OOM-killed.
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

  // Counters ride a periodic two-hop IPC report (worker → replica → gateway), so wait until both hops have
  // re-reported after `since`, or one scenario's growth lands in the next row.
  async #sampleCaches(since: number): Promise<SsrCacheSample | null> {
    const deadline = Date.now() + this.#options.metricsIntervalMs * 3 + 5_000;
    let children: Array<Record<string, number>> = [];
    let fresh = false;
    while (Date.now() < deadline) {
      children = await this.#fetchChildMetrics();
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
    const sum = (key: string) => children.reduce((total, metrics) => total + Number(metrics[key] ?? 0), 0);
    const mb = (key: string) => sum(key) / 1024 / 1024;
    return {
      replicaRssMb: mb("rssBytes"),
      rscWorkerRssMb: mb("rscWorkerRssBytes"),
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

  async #fetchChildMetrics(): Promise<Array<Record<string, number>>> {
    try {
      const res = await fetch(`http://localhost:${this.#options.port}/_akan/app/metrics`, {
        headers: { authorization: `Bearer ${this.#statusToken}` },
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

  #sampleTree(): Promise<SsrProc[]> {
    return DevResourceProbe.sampleTree(this.#gatewayPid, (command) => this.#roleOf(command));
  }

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

  // The gateway answers `/health` while every replica crash-loops, so wait for a ready child instead.
  async #waitForReady(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let lastError = "";
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://localhost:${this.#options.port}/_akan/app/health`, {
          headers: { authorization: `Bearer ${this.#statusToken}` },
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
}

if (import.meta.main) await new SsrMemoryProbe(SsrMemoryProbe.parseArgs(process.argv.slice(2))).run();
