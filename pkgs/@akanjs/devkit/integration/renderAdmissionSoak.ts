import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DevResourceProbe, type DevResourceProc } from "./devResourceProbe";

export type SoakMix = "cpu" | "io" | "mixed";
export type SoakKind = "cpu" | "io" | "hit";
export type SoakArrival = "burst" | "steady";
type SoakRole = "server" | "rsc" | "other";

export interface RenderAdmissionSoakOptions {
  appName: string;
  workspaceRoot: string;
  cliEntry: string;
  distDir: string;
  port: number;
  caps: number[];
  mixes: SoakMix[];
  runs: number;
  seconds: number;
  concurrency: number;
  arrival: SoakArrival;
  softNavigationPercent: number;
  abortPercent: number;
  maxQueue: string | null;
  prepare: boolean;
  logPath: string;
  outPath: string | null;
}

interface SoakRequest {
  kind: SoakKind;
  soft: boolean;
  url: string;
  credentialed: boolean;
  abortAfterMs: number | null;
}

interface SoakTally {
  latencies: Record<SoakKind, number[]>;
  documents: number[];
  softNavigations: number[];
  refused: number;
  aborted: number;
  failed: number;
}

interface SoakMemory {
  workerRssMb: number;
  serverRssMb: number;
  workerHeapMb: number;
  queueDepth: number;
  inFlight: number;
}

interface SoakWait {
  count: number;
  sumSeconds: number;
  buckets: Map<number, number>;
  refusals: number;
}

export interface SoakRunResult {
  cap: number;
  mix: SoakMix;
  run: number;
  ok: number;
  refused: number;
  aborted: number;
  failed: number;
  throughput: number;
  p50: number;
  p95: number;
  p99: number;
  p50ByKind: Record<SoakKind, number | null>;
  p50Document: number;
  p50SoftNavigation: number;
  waitMeanMs: number;
  waitP95Ms: number;
  refusals: number;
  peakDepth: number;
  peakInFlight: number;
  peakWorkerRssMb: number;
  workerRssGrowthMb: number;
  peakServerRssMb: number;
  workerHeapGrowthMb: number;
}

// Usage, from the workspace root: bun pkgs/@akanjs/devkit/integration/renderAdmissionSoak.ts <app> --prepare
// With a fixed number in flight (`--arrival=steady`) the mean latency is that number over the throughput whatever
// order renders run in; only rounds sent at once (`burst`) show what first come, first served does to the median.
// Every row is a fresh server: RSS only grows within a process, so a shared one would carry the last cap's peak.
export class RenderAdmissionSoak {
  static readonly #pagePath = "soak/io";
  static readonly #markerName = ".render-admission-soak.json";
  static readonly #page = `import { page } from "akanjs/client";

export default page()
  .search("ms", String)
  .render(async ({ ms }) => {
    const waitMs = Number(ms) || 50;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return (
      <ul>
        {Array.from({ length: 120 }, (_, index) => (
          <li key={index}>{\`row \${index} of a page that waited \${waitMs} ms on its data\`}</li>
        ))}
      </ul>
    );
  });
`;
  static readonly #shares: Record<SoakMix, Record<SoakKind, number>> = {
    cpu: { cpu: 100, io: 0, hit: 0 },
    io: { cpu: 0, io: 100, hit: 0 },
    mixed: { cpu: 40, io: 30, hit: 30 },
  };
  static readonly #routeCount = 32;
  static readonly #hotRouteCount = 8;
  static readonly #reportIntervalMs = 250;

  static parseArgs(argv: string[]): RenderAdmissionSoakOptions {
    const { appName, args, num } = DevResourceProbe.parseArgMap(argv);
    const workspaceRoot = args.get("root") ?? process.cwd();
    const numbers = (key: string, fallback: number[]) =>
      args.has(key)
        ? (args.get(key) ?? "")
            .split(",")
            .map(Number)
            .filter((value) => Number.isInteger(value) && value >= 0)
        : fallback;
    const mixes = (args.get("mixes") ?? "cpu,io,mixed")
      .split(",")
      .filter((mix): mix is SoakMix => mix in RenderAdmissionSoak.#shares);
    return {
      appName,
      workspaceRoot,
      cliEntry: args.get("cli") ?? "dist/pkgs/@akanjs/cli/index.js",
      distDir: args.get("dist") ?? path.join(workspaceRoot, "dist", "apps", appName),
      port: num("port", 8483),
      caps: numbers("caps", [2, 4, 8, 16, 32, 0]),
      mixes,
      runs: num("runs", 3),
      seconds: num("seconds", 12),
      concurrency: num("concurrency", 32),
      arrival: args.get("arrival") === "steady" ? "steady" : "burst",
      softNavigationPercent: num("soft", 30),
      abortPercent: num("aborts", 5),
      maxQueue: args.get("queue") ?? null,
      prepare: args.has("prepare"),
      logPath: args.get("log") ?? path.join(os.tmpdir(), `akan-render-admission-soak-${appName}.log`),
      outPath: args.get("out") ?? null,
    };
  }

  readonly #options: RenderAdmissionSoakOptions;
  readonly #statusToken = randomBytes(32).toString("hex");
  #serverPid = 0;
  #server: { kill: (signal: NodeJS.Signals) => void } | null = null;
  #build: { kill: (signal: NodeJS.Signals) => void } | null = null;
  #injected = false;

  constructor(options: RenderAdmissionSoakOptions) {
    this.#options = options;
  }

  get #origin(): string {
    return `http://127.0.0.1:${this.#options.port}`;
  }

  static pageDirOf(workspaceRoot: string, appName: string): string {
    return path.join(workspaceRoot, "apps", appName, "page", path.dirname(RenderAdmissionSoak.#pagePath));
  }

  //? The marker lists what this script wrote, so a `page/soak` an app owns is neither overwritten nor removed.
  static injectPage(pageDir: string): void {
    const marker = path.join(pageDir, RenderAdmissionSoak.#markerName);
    if (fs.existsSync(pageDir) && !fs.existsSync(marker))
      throw new Error(`${pageDir} already exists and this script did not create it; the soak page needs that name`);
    RenderAdmissionSoak.removePage(pageDir);
    const file = `${path.basename(RenderAdmissionSoak.#pagePath)}.tsx`;
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(marker, JSON.stringify({ files: [file] }));
    fs.writeFileSync(path.join(pageDir, file), RenderAdmissionSoak.#page);
  }

  static removePage(pageDir: string): void {
    const marker = path.join(pageDir, RenderAdmissionSoak.#markerName);
    if (!fs.existsSync(marker)) return;
    const { files } = JSON.parse(fs.readFileSync(marker, "utf8")) as { files: string[] };
    for (const file of files) fs.rmSync(path.join(pageDir, path.basename(file)), { force: true });
    fs.rmSync(marker, { force: true });
    if (fs.readdirSync(pageDir).length === 0) fs.rmdirSync(pageDir);
  }

  async run(): Promise<SoakRunResult[]> {
    const stop = () => void this.#stop().finally(() => process.exit(130));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    try {
      return await this.#measure();
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
    }
  }

  async #stop(): Promise<void> {
    this.#build?.kill("SIGTERM");
    if (this.#injected) RenderAdmissionSoak.removePage(this.#pageDir);
    if (this.#server) await DevResourceProbe.killTree(this.#server, () => this.#sampleTree());
  }

  get #pageDir(): string {
    return RenderAdmissionSoak.pageDirOf(this.#options.workspaceRoot, this.#options.appName);
  }

  async #measure(): Promise<SoakRunResult[]> {
    const { appName, distDir, caps, mixes, runs, outPath } = this.#options;
    if (this.#options.prepare) await this.#prepare();
    if (!fs.existsSync(path.join(distDir, "main.js")))
      throw new Error(
        `no built app at ${distDir} — run this with --prepare, which builds ${appName} with the soak page`,
      );
    const routes = await this.#routes();
    console.info(
      `[soak] app=${appName} arrival=${this.#options.arrival} caps=${caps.join(",")} mixes=${mixes.join(",")} runs=${runs} routes=${routes.docs.length}`,
    );
    const results: SoakRunResult[] = [];
    for (let run = 1; run <= runs; run += 1)
      for (const cap of caps)
        for (const mix of mixes) {
          const result = await this.#runOnce(cap, mix, run, routes);
          results.push(result);
          console.info(RenderAdmissionSoak.#line(result));
          if (outPath) await Bun.write(outPath, JSON.stringify(results, null, 2));
        }
    console.info(`\n${RenderAdmissionSoak.summary(results, caps, mixes)}`);
    return results;
  }

  async #prepare(): Promise<void> {
    const { appName, workspaceRoot, cliEntry } = this.#options;
    RenderAdmissionSoak.injectPage(this.#pageDir);
    this.#injected = true;
    try {
      const build = Bun.spawn(["bun", cliEntry, "build", appName], {
        cwd: workspaceRoot,
        stdout: "inherit",
        stderr: "inherit",
      });
      this.#build = build;
      if ((await build.exited) !== 0) throw new Error(`akan build ${appName} failed`);
    } finally {
      this.#build = null;
      RenderAdmissionSoak.removePage(this.#pageDir);
      this.#injected = false;
    }
  }

  async #routes(): Promise<{ docs: string[]; io: string }> {
    const artifactDir = path.join(this.#options.distDir, ".akan", "artifact");
    const seed = (await Bun.file(path.join(artifactDir, "route-seed-index.json")).json()) as {
      entries: { routeId: string }[];
    };
    const artifact = (await Bun.file(path.join(artifactDir, "base-artifact.json")).json()) as {
      i18n?: { defaultLocale?: string };
    };
    const locale = artifact.i18n?.defaultLocale ?? "en";
    const urls = seed.entries
      .map((entry) => entry.routeId.replace(/:lang\b/g, locale))
      .filter((url) => !/[:[]/.test(url))
      .sort((a, b) => a.localeCompare(b));
    const io = urls.find((url) => url.endsWith(`/${RenderAdmissionSoak.#pagePath}`));
    if (!io) throw new Error("the built app has no soak page — build it with --prepare");
    const docs = urls.filter((url) => url !== io && url.split("/").length > 3);
    return { docs: docs.slice(0, RenderAdmissionSoak.#routeCount), io };
  }

  async #runOnce(
    cap: number,
    mix: SoakMix,
    run: number,
    routes: { docs: string[]; io: string },
  ): Promise<SoakRunResult> {
    const server = this.#spawn(cap);
    this.#serverPid = server.pid;
    this.#server = server;
    try {
      if (!(await this.#waitForReady(120_000)))
        throw new Error(`the server did not become ready within 120s — see ${this.#options.logPath}`);
      await this.#warmUp(routes);
      await Bun.sleep(RenderAdmissionSoak.#reportIntervalMs * 6);
      const [baseline, waitBefore] = [await this.#memory(), await this.#wait()];
      const peak = { ...baseline };
      let sampling = true;
      const sampler = (async () => {
        while (sampling) {
          const sample = await this.#memory();
          for (const key of Object.keys(peak) as (keyof SoakMemory)[]) peak[key] = Math.max(peak[key], sample[key]);
          await Bun.sleep(RenderAdmissionSoak.#reportIntervalMs);
        }
      })();
      const startedAt = performance.now();
      const tally = await this.#load(mix, run, routes);
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      sampling = false;
      await sampler;
      await Bun.sleep(RenderAdmissionSoak.#reportIntervalMs * 6);
      const waitAfter = await this.#wait();
      return RenderAdmissionSoak.#result({ cap, mix, run }, tally, elapsedSeconds, { baseline, peak }, [
        waitBefore,
        waitAfter,
      ]);
    } finally {
      await DevResourceProbe.killTree(server, () => this.#sampleTree());
      this.#server = null;
    }
  }

  #spawn(cap: number) {
    const { appName, distDir, port, logPath, maxQueue } = this.#options;
    return Bun.spawn(["bun", "main.js"], {
      cwd: distDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        USE_AKANJS_PKGS: "true",
        AKAN_PUBLIC_APP_NAME: appName,
        AKAN_PUBLIC_REPO_NAME: process.env.AKAN_PUBLIC_REPO_NAME ?? path.basename(this.#options.workspaceRoot),
        AKAN_PUBLIC_SERVE_DOMAIN: process.env.AKAN_PUBLIC_SERVE_DOMAIN ?? "localhost",
        AKAN_PUBLIC_ENV: "local",
        AKAN_PUBLIC_OPERATION_MODE: "local",
        PORT: String(port),
        AKAN_STATUS_TOKEN: this.#statusToken,
        AKAN_MEMORY_LOG_INTERVAL_MS: String(RenderAdmissionSoak.#reportIntervalMs),
        AKAN_RSC_WORKER_MAX_CONCURRENCY: String(cap),
        ...(maxQueue ? { AKAN_RSC_WORKER_MAX_QUEUE: maxQueue } : {}),
      },
      stdout: Bun.file(logPath),
      stderr: Bun.file(logPath),
    });
  }

  //? Route modules load on their first render and the stored pages have to exist before a hit can be measured.
  async #warmUp(routes: { docs: string[]; io: string }): Promise<void> {
    const visit = async (url: string, credentialed: boolean) => {
      const response = await fetch(`${this.#origin}${url}`, { headers: credentialed ? { cookie: "soak=1" } : {} });
      await response.arrayBuffer();
      if (!response.ok) throw new Error(`warm-up of ${url} answered ${response.status}`);
    };
    for (const route of routes.docs) await visit(route, true);
    await visit(`${routes.io}?ms=20`, true);
    for (const route of routes.docs.slice(0, RenderAdmissionSoak.#hotRouteCount)) {
      await visit(route, false);
      await visit(RenderAdmissionSoak.#softNavigation(route), false);
    }
  }

  static #softNavigation(url: string): string {
    return `/__rsc?url=${encodeURIComponent(url)}`;
  }

  async #load(mix: SoakMix, run: number, routes: { docs: string[]; io: string }): Promise<SoakTally> {
    const { seconds, concurrency } = this.#options;
    const tally: SoakTally = {
      latencies: { cpu: [], io: [], hit: [] },
      documents: [],
      softNavigations: [],
      refused: 0,
      aborted: 0,
      failed: 0,
    };
    const random = RenderAdmissionSoak.#random(run * 7919 + mix.length);
    const deadline = performance.now() + seconds * 1000;
    const one = () => this.#request(this.#next(mix, routes, random), tally);
    const client = async () => {
      while (performance.now() < deadline) await one();
    };
    if (this.#options.arrival === "steady") await Promise.all(Array.from({ length: concurrency }, client));
    else while (performance.now() < deadline) await Promise.all(Array.from({ length: concurrency }, one));
    return tally;
  }

  #next(mix: SoakMix, routes: { docs: string[]; io: string }, random: () => number): SoakRequest {
    const shares = RenderAdmissionSoak.#shares[mix];
    const roll = random() * 100;
    const kind: SoakKind = roll < shares.cpu ? "cpu" : roll < shares.cpu + shares.io ? "io" : "hit";
    const pick = (list: string[]) => list[Math.floor(random() * list.length)] ?? "/";
    const target =
      kind === "io"
        ? `${routes.io}?ms=${20 + Math.floor(random() * 181)}`
        : pick(kind === "hit" ? routes.docs.slice(0, RenderAdmissionSoak.#hotRouteCount) : routes.docs);
    const soft = random() * 100 < this.#options.softNavigationPercent;
    const aborts = kind !== "hit" && random() * 100 < this.#options.abortPercent;
    return {
      kind,
      soft,
      url: soft ? RenderAdmissionSoak.#softNavigation(target) : target,
      credentialed: kind !== "hit",
      abortAfterMs: aborts ? 5 + Math.floor(random() * 55) : null,
    };
  }

  async #request(request: SoakRequest, tally: SoakTally): Promise<void> {
    const startedAt = performance.now();
    try {
      const response = await fetch(`${this.#origin}${request.url}`, {
        headers: request.credentialed ? { cookie: "soak=1" } : {},
        signal: AbortSignal.timeout(request.abortAfterMs ?? 60_000),
      });
      await response.arrayBuffer();
      const elapsed = performance.now() - startedAt;
      if (response.ok) {
        tally.latencies[request.kind].push(elapsed);
        (request.soft ? tally.softNavigations : tally.documents).push(elapsed);
      } else if (response.status === 503) tally.refused += 1;
      else tally.failed += 1;
    } catch {
      if (request.abortAfterMs === null) tally.failed += 1;
      else tally.aborted += 1;
    }
  }

  static #random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = Math.imul(state ^ (state >>> 15), state | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  static #result(
    row: { cap: number; mix: SoakMix; run: number },
    tally: SoakTally,
    elapsedSeconds: number,
    memory: { baseline: SoakMemory; peak: SoakMemory },
    [before, after]: [SoakWait, SoakWait],
  ): SoakRunResult {
    const kinds: SoakKind[] = ["cpu", "io", "hit"];
    const all = kinds.flatMap((kind) => tally.latencies[kind]).sort((a, b) => a - b);
    const at = (sorted: number[], share: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
    const round = (value: number) => Math.round(value * 10) / 10;
    const median = (values: number[]) =>
      round(
        at(
          [...values].sort((a, b) => a - b),
          0.5,
        ),
      );
    const waited = after.count - before.count;
    const p95Bound = [...after.buckets.keys()]
      .sort((a, b) => a - b)
      .find((bound) => (after.buckets.get(bound) ?? 0) - (before.buckets.get(bound) ?? 0) >= waited * 0.95);
    return {
      ...row,
      ok: all.length,
      refused: tally.refused,
      aborted: tally.aborted,
      failed: tally.failed,
      throughput: round(all.length / elapsedSeconds),
      p50: round(at(all, 0.5)),
      p95: round(at(all, 0.95)),
      p99: round(at(all, 0.99)),
      p50ByKind: Object.fromEntries(
        kinds.map((kind) => [kind, tally.latencies[kind].length ? median(tally.latencies[kind]) : null]),
      ) as Record<SoakKind, number | null>,
      p50Document: median(tally.documents),
      p50SoftNavigation: median(tally.softNavigations),
      waitMeanMs: waited > 0 ? round(((after.sumSeconds - before.sumSeconds) / waited) * 1000) : 0,
      waitP95Ms: waited > 0 && p95Bound !== undefined && Number.isFinite(p95Bound) ? p95Bound * 1000 : 0,
      refusals: after.refusals - before.refusals,
      peakDepth: memory.peak.queueDepth,
      peakInFlight: memory.peak.inFlight,
      peakWorkerRssMb: round(memory.peak.workerRssMb),
      workerRssGrowthMb: round(memory.peak.workerRssMb - memory.baseline.workerRssMb),
      peakServerRssMb: round(memory.peak.serverRssMb),
      workerHeapGrowthMb: round(memory.peak.workerHeapMb - memory.baseline.workerHeapMb),
    };
  }

  static #line(result: SoakRunResult): string {
    return (
      `[soak] run=${result.run} cap=${result.cap || "off"} mix=${result.mix}: ${result.throughput} req/s ` +
      `p50=${result.p50} (document ${result.p50Document}, soft ${result.p50SoftNavigation}) p95=${result.p95} ` +
      `p99=${result.p99}ms wait=${result.waitMeanMs}ms(p95<=${result.waitP95Ms}) ` +
      `ok=${result.ok} 503=${result.refused} aborted=${result.aborted} failed=${result.failed} ` +
      `depth<=${result.peakDepth} inFlight<=${result.peakInFlight} rscRss=${result.peakWorkerRssMb}MB ` +
      `(+${result.workerRssGrowthMb}) rscHeap=+${result.workerHeapGrowthMb}MB`
    );
  }

  static summary(results: SoakRunResult[], caps: number[], mixes: SoakMix[]): string {
    const spread = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      return `${median} (${sorted[0] ?? 0}–${sorted.at(-1) ?? 0})`;
    };
    const lines = [
      "| mix | cap | req/s | p50 ms | document p50 | soft p50 | p95 ms | p99 ms | wait ms | 503 | rsc peak RSS MB | rsc heap growth MB |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ];
    for (const mix of mixes)
      for (const cap of caps) {
        const rows = results.filter((result) => result.mix === mix && result.cap === cap);
        if (!rows.length) continue;
        const column = (pick: (result: SoakRunResult) => number) => spread(rows.map(pick));
        lines.push(
          `| ${mix} | ${cap || "off"} | ${column((r) => r.throughput)} | ${column((r) => r.p50)} | ` +
            `${column((r) => r.p50Document)} | ${column((r) => r.p50SoftNavigation)} | ${column((r) => r.p95)} | ` +
            `${column((r) => r.p99)} | ${column((r) => r.waitMeanMs)} | ${column((r) => r.refused)} | ` +
            `${column((r) => r.peakWorkerRssMb)} | ${column((r) => r.workerHeapGrowthMb)} |`,
        );
      }
    return lines.join("\n");
  }

  async #memory(): Promise<SoakMemory> {
    const procs = await this.#sampleTree();
    const rss = (role: SoakRole) =>
      procs.filter((proc) => proc.role === role).reduce((sum, proc) => sum + proc.rssMb, 0);
    const report = await this.#report();
    const gauge = (name: string) =>
      report.families.find((family) => family.name === name)?.samples.reduce((sum, sample) => sum + sample.value, 0) ??
      0;
    return {
      workerRssMb: rss("rsc"),
      serverRssMb: rss("server"),
      workerHeapMb: report.workerHeapUsedBytes / 1024 / 1024,
      queueDepth: gauge("akan_rsc_render_queue_depth"),
      inFlight: gauge("akan_rsc_renders_in_flight"),
    };
  }

  async #report(): Promise<{
    workerHeapUsedBytes: number;
    families: { name: string; samples: { value: number }[] }[];
  }> {
    try {
      const response = await fetch(`${this.#origin}/_akan/app/metrics`, {
        headers: { authorization: `Bearer ${this.#statusToken}` },
        signal: AbortSignal.timeout(5_000),
      });
      const body = (await response.json()) as {
        children?: { metrics?: Record<string, number> }[];
        metricFamilies?: { name: string; samples: { value: number }[] }[];
      };
      const heap = (body.children ?? []).reduce(
        (sum, child) => sum + Number(child.metrics?.rscWorkerHeapUsedBytes ?? 0),
        0,
      );
      return { workerHeapUsedBytes: heap, families: body.metricFamilies ?? [] };
    } catch {
      return { workerHeapUsedBytes: 0, families: [] };
    }
  }

  async #wait(): Promise<SoakWait> {
    const response = await fetch(`${this.#origin}/_akan/app/metrics`, {
      headers: { authorization: `Bearer ${this.#statusToken}`, accept: "text/plain" },
      signal: AbortSignal.timeout(5_000),
    });
    const wait: SoakWait = { count: 0, sumSeconds: 0, buckets: new Map(), refusals: 0 };
    for (const line of (await response.text()).split("\n")) {
      const match = /^(akan_rsc_render_[a-z_]+)(?:\{([^}]*)\})? (\S+)$/.exec(line);
      if (!match) continue;
      const [, name, labels = "", raw] = match;
      const value = Number(raw);
      if (name === "akan_rsc_render_queue_wait_seconds_count") wait.count += value;
      else if (name === "akan_rsc_render_queue_wait_seconds_sum") wait.sumSeconds += value;
      else if (name === "akan_rsc_render_refusals_total") wait.refusals += value;
      else if (name === "akan_rsc_render_queue_wait_seconds_bucket") {
        const bound = /(?:^|,)le="([^"]+)"/.exec(labels)?.[1] ?? "+Inf";
        const le = bound === "+Inf" ? Number.POSITIVE_INFINITY : Number(bound);
        wait.buckets.set(le, (wait.buckets.get(le) ?? 0) + value);
      }
    }
    return wait;
  }

  #sampleTree(): Promise<DevResourceProc<SoakRole>[]> {
    return DevResourceProbe.sampleTree(this.#serverPid, (command) =>
      /rscWorker\.js|react-server/.test(command) ? "rsc" : /\bmain\.js\b/.test(command) ? "server" : "other",
    );
  }

  async #waitForReady(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${this.#origin}/_akan/app/health`, {
          headers: { authorization: `Bearer ${this.#statusToken}` },
          signal: AbortSignal.timeout(2_000),
        });
        const body = (await response.json()) as { children?: { ready?: boolean }[] };
        if (response.ok && body.children?.some((child) => child.ready)) return true;
      } catch {
        // The port is bound only once the server has booted.
      }
      await Bun.sleep(250);
    }
    return false;
  }
}

if (import.meta.main) await new RenderAdmissionSoak(RenderAdmissionSoak.parseArgs(process.argv.slice(2))).run();
