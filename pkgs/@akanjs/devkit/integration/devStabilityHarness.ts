import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isPortInUseError } from "akanjs/server/lifecycle/portInUse";

export interface DevStabilityFixture {
  appName: string;
  appDir: string;
  workspaceRoot: string;
  port: number;
}

export interface DevStabilityHost {
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  logs: string[];
  markLog(): number;
  waitForLog(pattern: RegExp, timeoutMs?: number): Promise<RegExpMatchArray>;
  waitForLogSince(mark: number, pattern: RegExp, timeoutMs?: number): Promise<RegExpMatchArray>;
  stop(): Promise<void>;
}

export interface DevStabilityHmrProbe {
  /** The live socket — a reconnect replaces it, so read it rather than holding on to one. */
  readonly ws: WebSocket;
  readonly reconnects: number;
  messages: unknown[];
  mark(): number;
  waitForMessageSince(mark: number, predicate: (message: unknown) => boolean, timeoutMs?: number): Promise<unknown>;
  waitForNoMessageSince(mark: number, predicate: (message: unknown) => boolean, quietMs?: number): Promise<void>;
  close(): void;
}

const DEFAULT_TIMEOUT_MS = 60_000;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class DevStabilityHarness {
  static readonly fixturePrefix = "zz-dev-stability-";
  static readonly defaultWorkspaceRoot = path.resolve(import.meta.dir, "../../../..");
  readonly workspaceRoot: string;
  readonly appName: string;
  readonly appDir: string;
  readonly #explicitPortOffset: number | null;
  #portAllocation: Promise<{ port: number; offset: number }> | null = null;
  #boundPort: number | null = null;
  #host: DevStabilityHost | null = null;
  /** What the last HTTP poll saw, so a timeout can say which port answered and with what. */
  #lastHttpProbe: { port: number; body: string | null } = { port: 0, body: null };

  constructor({
    workspaceRoot = DevStabilityHarness.defaultWorkspaceRoot,
    appName = `${DevStabilityHarness.fixturePrefix}${process.pid}-${Date.now()}`,
    portOffset,
  }: {
    workspaceRoot?: string;
    appName?: string;
    portOffset?: number;
  } = {}) {
    this.workspaceRoot = workspaceRoot;
    this.appName = appName;
    this.appDir = path.join(workspaceRoot, "apps", appName);
    this.#explicitPortOffset = portOffset ?? null;
  }

  async createFixture(): Promise<DevStabilityFixture> {
    await rm(this.appDir, { recursive: true, force: true });
    await Promise.all([
      mkdir(path.join(this.appDir, "page"), { recursive: true }),
      mkdir(path.join(this.appDir, "common"), { recursive: true }),
      mkdir(path.join(this.appDir, "srvkit"), { recursive: true }),
      mkdir(path.join(this.appDir, "ui"), { recursive: true }),
      mkdir(path.join(this.appDir, "webkit"), { recursive: true }),
      mkdir(path.join(this.appDir, "lib"), { recursive: true }),
      mkdir(path.join(this.appDir, "env"), { recursive: true }),
      mkdir(path.join(this.appDir, "public"), { recursive: true }),
    ]);
    await Promise.all([
      this.writeFile(
        "main.ts",
        `import { AkanApp } from "akanjs/server";

const run = async () => {
  await new AkanApp("./server").start();
};
void run();
`,
      ),
      this.writeFile(
        "akan.config.ts",
        `import type { AppConfig } from "akanjs";

const config: AppConfig = {};
export default config;
`,
      ),
      this.writeFile(
        "package.json",
        `{
  "type": "module",
  "name": "${this.appName}",
  "version": "0.0.1"
}
`,
      ),
      this.writeFile(
        "tsconfig.json",
        `{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "resolveJsonModule": true,
    "jsx": "preserve"
  },
  "include": ["./**/*.ts", "./**/*.tsx"]
}
`,
      ),
      this.writeFile(
        "env/env.client.ts",
        `import { getEnv } from "akanjs/base";

export const env = {
  ...getEnv(),
} as const;
`,
      ),
      this.writeFile(
        "env/env.server.ts",
        `import { getEnv } from "akanjs/base";

export const env = {
  ...getEnv(),
} as const;
`,
      ),
      this.writeFile(
        "env/env.server.testing.ts",
        `export { env } from "./env.server";
`,
      ),
      this.writeFile(
        "lib/option.ts",
        `import { AkanOption } from "akanjs/server";

export type ModulesOptions = Record<string, never>;
export const option = new AkanOption<ModulesOptions>();
`,
      ),
      this.writeFile(
        "server.ts",
        `import { AkanServer, AkanLib } from "akanjs/server";
import { backendMarker } from "./srvkit/backendMarker";

void backendMarker;

export const lib = new AkanLib("${this.appName}", {});
export const server = new AkanServer("${this.appName}", {
  appName: "${this.appName}",
  env: "local",
  operation: "local",
  publicOrigin: "http://localhost",
  serveDomain: "localhost",
} as never, undefined, lib);
`,
      ),
      this.writeFile(
        "page/_layout.tsx",
        `import "./styles.css";
import type { LayoutProps } from "akanjs/client";

export default function Layout({ children }: LayoutProps) {
  return <>{children}</>;
}
`,
      ),
      this.writeFile(
        "page/_index.tsx",
        `import { marker } from "../common/marker";
import { ClientMarker } from "../ui/ClientMarker";

export default function Page() {
  return (
    <main>
      <h1>Dev stability fixture</h1>
      <p data-testid="marker">{marker}</p>
      <ClientMarker />
    </main>
  );
}
`,
      ),
      // A second route exists so a test can ask for a page the backend has *never* built, at a moment of
      // its choosing. Route clients are built on demand and cached, so on a one-route fixture the first
      // request of a test is the only one that reaches the builder at all.
      this.writeFile(
        "page/second/_index.tsx",
        `import { ClientMarker } from "../../ui/ClientMarker";

export default function Page() {
  return (
    <main>
      <h1>Second route</h1>
      <ClientMarker />
    </main>
  );
}
`,
      ),
      this.writeFile(
        "page/styles.css",
        `main {
  color: black;
}
`,
      ),
      this.writeFile(
        "common/marker.ts",
        `export const marker = "initial-shared-marker";
`,
      ),
      this.writeFile(
        "srvkit/backendMarker.ts",
        `export const backendMarker = "initial-backend-marker";
`,
      ),
      this.writeFile(
        "lib/_fixture/fixture.service.ts",
        `import { serve } from "akanjs/service";

export class FixtureService extends serve("fixture" as const, { serverMode: "batch" }, () => ({})) {}
`,
      ),
      this.writeFile(
        "lib/_fixture/fixture.signal.ts",
        `import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class FixtureInternal extends internal(srv.fixture, () => ({})) {}

export class FixtureEndpoint extends endpoint(srv.fixture, () => ({})) {}
`,
      ),
      this.writeFile(
        "lib/_fixture/fixture.dictionary.ts",
        `import { serviceDictionary } from "akanjs/dictionary";

import type { FixtureEndpoint } from "./fixture.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<FixtureEndpoint>(() => ({}))
  .translate({
    hello: ["Initial Dictionary", "초기 사전"],
    removeMe: ["Remove Me", "삭제 예정"],
  });
`,
      ),
      this.writeFile(
        "ui/ClientMarker.tsx",
        `export function ClientMarker() {
  return <p data-testid="client-marker">initial-client-marker</p>;
}
`,
      ),
      this.writeFile(
        "webkit/useMarker.ts",
        `export const useMarker = () => "initial-webkit-marker";
`,
      ),
    ]);
    const port = await this.resolvePort();
    return { appName: this.appName, appDir: this.appDir, workspaceRoot: this.workspaceRoot, port };
  }

  /**
   * Stop the dev server and delete the fixture, within a budget that cannot outlive the hook awaiting it.
   *
   * Overrunning the `afterEach` budget costs more than one red test. Bun fails the test that had *already
   * passed*, and the fixture is dropped from the cleanup list either way — so its dev host keeps running,
   * holding ports and shifting the app index, and the tests after it fail too. That cascade is what turned
   * one slow cleanup into three failures in a parallel shard.
   */
  async cleanup(): Promise<void> {
    const startedAt = Date.now();
    const finished = await Promise.race([
      this.#stopAndDelete().then(() => true),
      wait(DevStabilityHarness.#cleanupBudgetMs).then(() => false),
    ]);
    if (finished) {
      if (Date.now() - startedAt > DevStabilityHarness.#slowCleanupMs)
        console.warn(`[harness] ${this.appName} cleanup took ${Date.now() - startedAt}ms`);
      return;
    }
    // Give up on the orderly path, but not on the process: killing the tracked child directly involves no
    // `ps` and cannot itself hang, which is what the orderly path just demonstrated it can do.
    this.#host?.proc.kill("SIGKILL");
    this.#host = null;
    console.warn(
      `[harness] ${this.appName} cleanup exceeded ${DevStabilityHarness.#cleanupBudgetMs}ms; killed the host directly and moved on`,
    );
  }

  async #stopAndDelete(): Promise<void> {
    await DevStabilityHarness.#watched(`${this.appName} stop`, () => this.stopHost());
    // Retries because the delete can still lose a race with a straggler writing into `.akan/artifact`.
    await DevStabilityHarness.#watched(`${this.appName} delete`, () =>
      rm(this.appDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }),
    );
  }

  static readonly #slowCleanupMs = 10_000;
  /** Comfortably inside the suite's 60s hook budget, so a hang is reported by the harness — which knows
   *  which phase stalled — rather than by Bun, which only knows that a hook did not return. */
  static readonly #cleanupBudgetMs = 30_000;

  /**
   * Names a phase that is still running, rather than only reporting one that finished.
   *
   * A cleanup that never returns is reported by Bun as a bare `a beforeEach/afterEach hook timed out`
   * against the test that had already passed, with nothing at all about where it hung — so any
   * end-of-phase timing is exactly the information a hang destroys.
   */
  static async #watched<T>(label: string, work: () => Promise<T>): Promise<T> {
    const timer = setTimeout(
      () => console.warn(`[harness] ${label} still running after ${DevStabilityHarness.#slowCleanupMs}ms`),
      DevStabilityHarness.#slowCleanupMs,
    );
    try {
      return await work();
    } finally {
      clearTimeout(timer);
    }
  }

  static async #waitForPidsGone(pids: number[], timeoutMs: number): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!pids.some((pid) => DevStabilityHarness.#pidIsAlive(pid))) return true;
      await wait(50);
    }
    return false;
  }

  async startHost({
    timeoutMs = DEFAULT_TIMEOUT_MS,
    env = {},
  }: {
    timeoutMs?: number;
    env?: Record<string, string>;
  } = {}): Promise<DevStabilityHost> {
    const logs: string[] = [];
    const { port, offset } = await this.#allocatePort();
    const proc = Bun.spawn(["bash", "-lc", `bun run akan start ${JSON.stringify(this.appName)}`], {
      cwd: this.workspaceRoot,
      env: {
        ...process.env,
        AKAN_VERBOSE: "1",
        // The dev-plan/hmr assertions match verbose-level Logger lines; without this the log
        // stream only carries info/warn/error and those waits time out with empty tails.
        AKAN_PUBLIC_LOG_LEVEL: "verbose",
        NODE_NO_WARNINGS: "1",
        PORT_OFFSET: String(offset),
        // Pinned, not predicted. `getDevPort()` derives the port from this fixture's index in the `apps/`
        // listing, and a parallel run adds and removes fixtures constantly — so the index moved between the
        // allocation here and the host reading it, and again on every restart. Tests that merely *wait* on a
        // port recovered by adopting the logged one, but a test that has to reserve a port before boot (the
        // occupied-ws-port test blocks `port + 10_000`) had no way to be right, and spent 60s waiting for a
        // fallback that could not happen because the gateway had gone to a different port entirely.
        AKAN_DEV_PORT: String(port),
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const consume = async (stream: ReadableStream<Uint8Array> | null) => {
      if (!stream) return;
      const decoder = new TextDecoder();
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          logs.push(decoder.decode(value, { stream: true }));
        }
      } finally {
        reader.releaseLock();
      }
    };
    void consume(proc.stdout);
    void consume(proc.stderr);
    const host: DevStabilityHost = {
      proc,
      logs,
      markLog: () => markLog(logs),
      waitForLog: (pattern, waitMs) =>
        DevStabilityHarness.#timed(`waitForLog ${pattern}`, () => waitForLog(logs, pattern, waitMs)),
      waitForLogSince: (mark, pattern, waitMs) =>
        DevStabilityHarness.#timed(`waitForLogSince ${pattern}`, () => waitForLogSince(logs, mark, pattern, waitMs)),
      stop: async () => {
        await DevStabilityHarness.#dumpLogs(this.appName, logs);
        // The host runs under `bash -lc`, so killing `proc` only kills the shell: the dev host, its
        // builder and its backend outlive it as orphans that keep watching a deleted fixture app and
        // interfere with later tests. Collect the descendants first, then signal all of them.
        //
        // The tracked child is always signalled directly as well, because `descendantPids` comes back empty
        // when the `ps` behind it times out — and that path must still take the shell down.
        const pids = await DevStabilityHarness.#watched("descendants", () =>
          DevStabilityHarness.descendantPids(proc.pid),
        );
        DevStabilityHarness.#signalPids(pids, "SIGTERM");
        proc.kill("SIGTERM");
        await DevStabilityHarness.#watched("await exit", () =>
          Promise.race([proc.exited.catch(() => undefined), wait(3_000)]),
        );
        const survivors = await DevStabilityHarness.#watched("descendants after term", () =>
          DevStabilityHarness.descendantPids(proc.pid),
        );
        DevStabilityHarness.#signalPids(survivors, "SIGKILL");
        DevStabilityHarness.#signalPids(pids, "SIGKILL");
        proc.kill("SIGKILL");
        // Signalling is not reaping. Returning while a build worker is still alive leaves it writing
        // into `.akan/artifact` while the caller's `rm -rf` walks the same tree.
        const signalled = [...new Set([...pids, ...survivors])];
        const gone = await DevStabilityHarness.#watched("await gone", () =>
          DevStabilityHarness.#waitForPidsGone(signalled, 15_000),
        );
        if (!gone)
          console.warn(
            `[harness] ${this.appName}: ${signalled.filter((pid) => DevStabilityHarness.#pidIsAlive(pid)).length} process(es) outlived SIGKILL`,
          );
      },
    };
    this.#host = host;
    await DevStabilityHarness.#timed("startHost:boot", () =>
      host.waitForLog(/backend ready pid=(\d+)|AkanApp gateway is running on port/, timeoutMs),
    );
    await this.#adoptBoundPort(host);
    return host;
  }

  async stopHost(): Promise<void> {
    await this.#host?.stop();
    this.#host = null;
  }

  /**
   * Write a host's whole log to `AKAN_DEV_STABILITY_LOG_DIR` when it is set.
   *
   * A failing wait prints only a tail, and a *passing* run prints nothing — so a stall that stays inside
   * the timeout budget is invisible, which is exactly the state a slow-but-green suite hides. Off unless
   * the variable is set, since the suite otherwise produces megabytes per round.
   */
  static async #dumpLogs(appName: string, logs: string[]): Promise<void> {
    const dir = process.env.AKAN_DEV_STABILITY_LOG_DIR;
    if (!dir) return;
    await mkdir(dir, { recursive: true }).catch(() => undefined);
    await Bun.write(path.join(dir, `${appName}.log`), logs.join("")).catch(() => undefined);
  }

  async writeFile(relativePath: string, contents: string): Promise<void> {
    const target = path.join(this.appDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }

  /**
   * Apply an edit and return once the dev server has demonstrably *seen* it, re-applying it if it has not.
   *
   * Bun's recursive `fs.watch` reports about one path per coalescing window and discards the rest, so an
   * edit landing in the same window as a build's write burst used to be dropped entirely — no rebuild, no
   * HMR, no error. In a 3-way parallel run that failed the same test in all three shards, with 60 seconds
   * of *completely empty* log output after the edit.
   *
   * `HmrWatcher` now resolves changes against a `SourceMtimeIndex` instead of trusting those payloads, so
   * this no longer settles before editing: edits deliberately land right after the previous build's burst,
   * which is exactly the case that used to be lost. `retried` staying 0 is therefore evidence the fix
   * holds, where before it only meant the settle had dodged the window.
   *
   * The retry stays as the regression detector. What it waits for is evidence the watcher saw the edit,
   * not the outcome the caller cares about: evidence arrives within a debounce, while an outcome can
   * legitimately take far longer than any retry budget — so callers keep their own assertions, patterns
   * and timeouts exactly as they were. An edit the dev server genuinely fails to act on exhausts every
   * attempt and fails the test rather than being retried into a pass.
   */
  async editUntilSeen(
    host: DevStabilityHost,
    mutate: (attempt: number) => Promise<void>,
    {
      evidence = DevStabilityHarness.#editEvidence,
      attempts = 3,
      // Generous on purpose. A dropped event yields *nothing, ever*, so waiting longer never weakens the
      // discrimination — while a budget tight enough to mistake a loaded machine for a dropped event makes
      // the retry actively harmful, since re-applying an edit is not always cheap (a config rewrite costs a
      // whole dev-host restart, and four of those overran a 120s test).
      evidenceTimeoutMs = 20_000,
      settleMs = 0,
      retryDelayMs = 750,
    }: {
      evidence?: RegExp;
      attempts?: number;
      evidenceTimeoutMs?: number;
      settleMs?: number;
      retryDelayMs?: number;
    } = {},
  ): Promise<{ mark: number; attempts: number; evidence: RegExpMatchArray }> {
    // Kept as an escape hatch for a caller that needs spacing for its own reasons; the watcher no longer
    // needs it, so the default is 0 and edits land inside the burst window on purpose.
    if (settleMs > 0) await wait(settleMs);
    for (let attempt = 1; ; attempt++) {
      const mark = host.markLog();
      await mutate(attempt);
      const seen = await host.waitForLogSince(mark, evidence, evidenceTimeoutMs).catch(() => null);
      if (seen) {
        DevStabilityHarness.#observedEdits++;
        if (attempt > 1) DevStabilityHarness.#retriedEdits++;
        return { mark, attempts: attempt, evidence: seen };
      }
      if (attempt >= attempts)
        throw new Error(
          `Dev server never reacted to ${attempts} edit(s) of ${this.appName}: waited ${evidenceTimeoutMs}ms each for ${evidence}`,
        );
      await wait(retryDelayMs);
    }
  }

  /** Every classified change logs a dev plan before anything acts on it, and an idle-suspended host logs a
   *  wake first, so either line proves the watcher saw the edit. */
  static readonly #editEvidence = /\[dev-plan\] generation=\d+|\[idle-suspend\] waking/;
  static #observedEdits = 0;
  static #retriedEdits = 0;

  static editStats(): { edits: number; retried: number } {
    return { edits: DevStabilityHarness.#observedEdits, retried: DevStabilityHarness.#retriedEdits };
  }

  static readonly #waitDurations: { label: string; ms: number }[] = [];

  /**
   * Time one wait so a run that dies of *cumulative* slowness can say where the time went.
   *
   * Each wait here is individually bounded, but their budgets sum past the per-test timeout — `startHost`
   * (60s) plus one `waitForLogSince` (60s) plus one `waitForHttpText` (60s) already reaches 180s. So a
   * loaded round can kill a test without any single wait failing, and Bun reports only "this test timed out",
   * naming neither the step nor how close the others came. That produced failures that looked like they
   * rotated between tests at random, when what rotates is which long test happened to be slowest.
   */
  static async #timed<T>(label: string, work: () => Promise<T>): Promise<T> {
    const at = performance.now();
    try {
      return await work();
    } finally {
      DevStabilityHarness.#waitDurations.push({ label, ms: Math.round(performance.now() - at) });
    }
  }

  /** The slowest waits observed, worst first, for an end-of-run report. */
  static waitStats(limit = 5): { label: string; ms: number }[] {
    return [...DevStabilityHarness.#waitDurations].sort((a, b) => b.ms - a.ms).slice(0, limit);
  }

  async replaceText(relativePath: string, search: string | RegExp, replacement: string): Promise<void> {
    const file = Bun.file(path.join(this.appDir, relativePath));
    const contents = await file.text();
    await this.writeFile(relativePath, contents.replace(search, replacement));
  }

  async removeFile(relativePath: string): Promise<void> {
    await rm(path.join(this.appDir, relativePath), { force: true });
  }

  async waitForHttpText(text: string | RegExp, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
    const body = await this.tryWaitForHttpText(text, timeoutMs);
    if (body) return body;
    const { port, body: last } = this.#lastHttpProbe;
    // The host's own tail matters as much as the response: a 60s wait that ends in a served error page says
    // what the browser saw, but only the dev server's log says why it got into that state.
    const tail = (this.#host?.logs.join("") ?? "").slice(-2_000);
    throw new Error(
      `Timed out waiting for HTTP text ${String(text)} after ${timeoutMs}ms on port ${port}; ` +
        (last === null
          ? "nothing ever answered on that port"
          : `last response was ${last.length} bytes: ${last.slice(0, 400)}`) +
        `\nRecent host logs:\n${tail}`,
    );
  }

  async tryWaitForHttpText(text: string | RegExp, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string | null> {
    return DevStabilityHarness.#timed(`waitForHttpText ${String(text)}`, () => this.#pollHttpText(text, timeoutMs));
  }

  async #pollHttpText(text: string | RegExp, timeoutMs: number): Promise<string | null> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      // Re-resolved every poll rather than once up front. A dev-host restart re-runs `getDevPort()` and can
      // bind a different port, and quietly polling a port nobody listens on for the rest of the budget is
      // indistinguishable from a page that never updated — it cost 60s and a misleading failure.
      const port = await this.resolvePort();
      // Bounded per request, because the deadline above is only checked *between* iterations. A dev server
      // mid-recovery accepts the connection and then never answers, so an unbounded `fetch` parks here for
      // as long as the peer likes: measured 225561ms against this method's own 60000ms budget, which then
      // ate the whole 180s test timeout and reported "this test timed out" with no other information.
      const budget = Math.max(250, Math.min(5_000, timeoutMs - (Date.now() - started)));
      const body = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(budget) })
        .then((res) => res.text())
        .catch(() => null);
      this.#lastHttpProbe = { port, body };
      if (body && (typeof text === "string" ? body.includes(text) : text.test(body))) return body;
      await wait(100);
    }
    return null;
  }

  async connectHmr(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<WebSocket> {
    const port = await this.resolvePort();
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const ws = await new Promise<WebSocket | null>((resolve) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/_akan/hmr`);
        const timeout = setTimeout(() => {
          socket.close();
          resolve(null);
        }, 750);
        socket.addEventListener("open", () => {
          clearTimeout(timeout);
          resolve(socket);
        });
        socket.addEventListener("error", () => {
          clearTimeout(timeout);
          socket.close();
          resolve(null);
        });
      });
      if (ws) return ws;
      await wait(100);
    }
    throw new Error("Timed out connecting HMR websocket");
  }

  /**
   * An HMR probe that reconnects, because the browser it stands in for does.
   *
   * A raw socket dies whenever the backend restarts, and a dead socket is indistinguishable from a quiet
   * one: `waitForMessageSince` polls an array nothing can ever append to, then reports a plain timeout a
   * minute later. In a 3-way parallel run that was a third of all failures — the diagnostic read
   * `socket=closed since-mark=[] total=3` — and it says nothing about the product, since the real client
   * reconnects and picks the stream back up (`akanjs/server/hmr/clientScript.ts`).
   */
  async connectHmrProbe(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<DevStabilityHmrProbe> {
    const messages: unknown[] = [];
    let socket = await this.connectHmr(timeoutMs);
    let closedByCaller = false;
    let reconnects = 0;
    const listen = (ws: WebSocket): void => {
      ws.addEventListener("message", (event) => {
        const raw = typeof event.data === "string" ? event.data : "";
        try {
          messages.push(JSON.parse(raw));
        } catch {
          /* ignore non-json websocket payloads */
        }
      });
      ws.addEventListener("close", () => {
        // Bounded, and with a short budget: the last close of a probe's life is the dev server being torn
        // down in `cleanup()`, and an unbounded retry there would keep reconnecting at a dead port for a
        // minute after the test ended.
        if (closedByCaller || reconnects >= DevStabilityHarness.#maxProbeReconnects) return;
        void this.connectHmr(Math.min(timeoutMs, 5_000))
          .then((next) => {
            if (closedByCaller) {
              next.close();
              return;
            }
            reconnects++;
            socket = next;
            listen(next);
          })
          // A dev server that is gone for good is the caller's problem to notice through its own waits,
          // not something to throw from an event listener.
          .catch(() => undefined);
      });
    };
    listen(socket);
    return {
      get ws() {
        return socket;
      },
      get reconnects() {
        return reconnects;
      },
      messages,
      mark: () => messages.length,
      waitForMessageSince: (mark, predicate, waitMs) =>
        waitForHmrMessageSince(messages, mark, predicate, waitMs, () =>
          DevStabilityHarness.#describeProbe(socket, messages, mark, reconnects),
        ),
      waitForNoMessageSince: (mark, predicate, quietMs) => waitForNoHmrMessageSince(messages, mark, predicate, quietMs),
      close: () => {
        closedByCaller = true;
        socket.close();
      },
    };
  }

  static readonly #maxProbeReconnects = 5;

  static #describeProbe(ws: WebSocket, messages: unknown[], mark: number, reconnects: number): string {
    const state = ["connecting", "open", "closing", "closed"][ws.readyState] ?? String(ws.readyState);
    const types = messages
      .slice(mark)
      .map((message) => (message as { type?: unknown } | null)?.type ?? "?")
      .join(",");
    return `socket=${state} reconnects=${reconnects} since-mark=[${types}] total=${messages.length}`;
  }

  async tryConnectHmrProbe(timeoutMs = 3_000): Promise<DevStabilityHmrProbe | null> {
    try {
      return await this.connectHmrProbe(timeoutMs);
    } catch {
      return null;
    }
  }

  async waitForHmrMessage(
    ws: WebSocket,
    predicate: (message: unknown) => boolean,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<unknown> {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.removeEventListener("message", onMessage);
        reject(new Error("Timed out waiting for HMR message"));
      }, timeoutMs);
      const onMessage = (event: MessageEvent) => {
        const raw = typeof event.data === "string" ? event.data : "";
        let message: unknown;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }
        if (!predicate(message)) return;
        clearTimeout(timeout);
        ws.removeEventListener("message", onMessage);
        resolve(message);
      };
      ws.addEventListener("message", onMessage);
    });
  }

  /**
   * The port this fixture's dev server is reachable on — the one the gateway actually bound once it is
   * up, and a probed prediction before that.
   *
   * It used to recompute `8282 + appIndex + randomOffset` from the `apps/` listing on every call, which
   * is wrong twice over. `appIndex` moves whenever any *other* fixture appears or disappears, and two
   * suites running in parallel create and delete one every few seconds — so the answer changed
   * mid-test and every HTTP wait then polled a port nobody was listening on. And the random offset
   * collides, roughly 1-in-N per pair, while the gateway has no fallback for its http port
   * (`AkanApp.start` logs "already in use" and exits), so a collision reads as a boot timeout with no
   * hint of a port problem. Both failures are indistinguishable from a product regression, which is
   * most of why a red run of this suite could not be told apart from noise.
   */
  async resolvePort(): Promise<number> {
    return this.#gatewayPortFromLogs() ?? this.#boundPort ?? (await this.#allocatePort()).port;
  }

  /**
   * The port the *most recent* gateway bound, or null before one has said.
   *
   * Read fresh rather than adopted once, because the port can move mid-test: a config edit restarts the dev
   * host, and the replacement recomputes its own port from the `apps/` listing (`AppExecutor.getDevPort`) —
   * which a parallel run has changed in the meantime. Holding the boot-time port meant the config test
   * watched the restart succeed and then timed out fetching from the address the *old* gateway had used.
   * (Worth knowing outside the tests too: adding or removing an app during a session moves a running dev
   * server's port at its next restart.)
   */
  #gatewayPortFromLogs(): number | null {
    const logs = this.#host?.logs;
    if (!logs) return null;
    let latest: number | null = null;
    for (const match of logs.join("").matchAll(/AkanApp gateway is running on port http:\/\/localhost:(\d+)/g))
      latest = Number(match[1]);
    return latest;
  }

  /** Offsets are handed out in stride steps from a pid-seeded cursor and probed against the OS, never
   *  drawn at random. Forward-only means no two harnesses in one process share an offset even while the
   *  first host is still shutting down and holding its port; the probe covers everything outside this
   *  process; and the pid seed keeps two concurrent runs out of each other's band. */
  static readonly portOffsetMin = 3_000;
  static readonly portOffsetMax = 4_000;
  /** The app's port is `8282 + appIndex + offset`, so offsets one apart alias each other as soon as a
   *  fixture shifts the index. A stride wider than any plausible drift keeps them distinct. */
  static readonly portOffsetStride = 4;
  static #portOffsetCursor: number | null = null;

  static get #portOffsetSlots(): number {
    return (
      (DevStabilityHarness.portOffsetMax - DevStabilityHarness.portOffsetMin) / DevStabilityHarness.portOffsetStride
    );
  }

  static #nextPortOffset(): number {
    const slots = DevStabilityHarness.#portOffsetSlots;
    DevStabilityHarness.#portOffsetCursor =
      DevStabilityHarness.#portOffsetCursor === null
        ? process.pid % slots
        : (DevStabilityHarness.#portOffsetCursor + 1) % slots;
    return (
      DevStabilityHarness.portOffsetMin + DevStabilityHarness.#portOffsetCursor * DevStabilityHarness.portOffsetStride
    );
  }

  /** Probed on the default interface, which is the strict test: a bind there fails if anything holds
   *  the port on any address the app might pick. */
  static async isPortFree(port: number): Promise<boolean> {
    try {
      Bun.serve({ port, fetch: () => new Response("probe") }).stop(true);
      return true;
    } catch (error) {
      if (isPortInUseError(error)) return false;
      throw error;
    }
  }

  async #allocatePort(): Promise<{ port: number; offset: number }> {
    this.#portAllocation ??= this.#allocatePortOnce();
    return await this.#portAllocation;
  }

  async #allocatePortOnce(): Promise<{ port: number; offset: number }> {
    const basePort = 8282 + (await this.#appIndex());
    if (this.#explicitPortOffset !== null)
      return { port: basePort + this.#explicitPortOffset, offset: this.#explicitPortOffset };
    for (let attempt = 0; attempt < DevStabilityHarness.#portOffsetSlots; attempt++) {
      const offset = DevStabilityHarness.#nextPortOffset();
      const port = basePort + offset;
      // The gateway derives child 0's websocket port from its http port (`AkanApp` `#wsBasePort`), so
      // both have to be free for a boot to be clean.
      if ((await DevStabilityHarness.isPortFree(port)) && (await DevStabilityHarness.isPortFree(port + 10_000)))
        return { port, offset };
    }
    throw new Error(
      `No free dev port for ${this.appName} after probing ${DevStabilityHarness.#portOffsetSlots} offsets`,
    );
  }

  /** Mirror the CLI's `getDevPort()` exactly (apps = directories containing akan.config.ts,
   *  locale-sorted): counting stray entries like .DS_Store would put us one port off the gateway. */
  async #appIndex(): Promise<number> {
    const appsDir = path.join(this.workspaceRoot, "apps");
    const entries = await readdir(appsDir, { withFileTypes: true }).catch(() => []);
    const checked = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) =>
          (await Bun.file(path.join(appsDir, entry.name, "akan.config.ts")).exists()) ? entry.name : null,
        ),
    );
    const apps = [...new Set([...checked.filter((name): name is string => name !== null), this.appName])].sort((a, b) =>
      a.localeCompare(b),
    );
    return Math.max(apps.indexOf(this.appName), 0);
  }

  /** Stop predicting once the gateway has said what it bound. */
  async #adoptBoundPort(host: DevStabilityHost): Promise<void> {
    const match = await host
      .waitForLog(/AkanApp gateway is running on port http:\/\/localhost:(\d+)/, 30_000)
      .catch(() => null);
    const bound = Number(match?.[1]);
    if (!Number.isFinite(bound) || bound <= 0) return;
    const predicted = await this.resolvePort();
    this.#boundPort = bound;
    if (bound !== predicted)
      console.warn(`[harness] ${this.appName} bound port ${bound}, not the predicted ${predicted}`);
  }

  /**
   * Fixtures and dev hosts left behind by a test process that died before `cleanup()` could run.
   *
   * They keep watching a deleted app, hold their ports, and — because the fixture directory is still in
   * `apps/` — shift the app index every other harness predicts its port from. Only fixtures whose
   * owning test pid is gone are swept, so a concurrent run's live fixtures are never touched.
   */
  static async sweepAbandonedFixtures(workspaceRoot: string): Promise<string[]> {
    const appsDir = path.join(workspaceRoot, "apps");
    const entries = await readdir(appsDir, { withFileTypes: true }).catch(() => []);
    const abandoned = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(DevStabilityHarness.fixturePrefix))
      .filter((entry) => {
        const ownerPid = Number(entry.name.slice(DevStabilityHarness.fixturePrefix.length).split("-")[0]);
        return Number.isFinite(ownerPid) && ownerPid > 0 && !DevStabilityHarness.#pidIsAlive(ownerPid);
      });
    if (!abandoned.length) return [];
    const rows = await DevStabilityHarness.#psRowsOrEmpty();
    for (const entry of abandoned) {
      for (const row of rows.filter((candidate) => candidate.cmd.includes(entry.name)))
        DevStabilityHarness.#signalPids(await DevStabilityHarness.descendantPids(row.pid), "SIGKILL");
      await rm(path.join(appsDir, entry.name), { recursive: true, force: true });
    }
    return abandoned.map((entry) => entry.name);
  }

  static #pidIsAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // ESRCH is the only code that means gone — EPERM is a live process owned by someone else.
      return (error as { code?: string }).code !== "ESRCH";
    }
  }

  /**
   * Resident set size of the whole `akan start` process tree, which is what a dev sandbox actually
   * costs: supervisor, builder, gateway, replica and rsc worker. `excludeBuilder` drops the bundler
   * process, whose growth across saves is `Bun.build` native arena retention rather than a leak the
   * other processes could be blamed for.
   */
  // Matched precisely, not by directory: the disposable build worker lives at
  // `incrementalBuilder/buildBatch.proc.ts`, so a substring match on `incrementalBuilder` would count
  // the worker as the watcher and make every builder measurement depend on spawn timing.
  static readonly #builderCmd = "incrementalBuilder.proc";
  static readonly #buildWorkerCmd = "buildBatch.proc";

  static async processTreeRssBytes(
    rootPid: number,
    { excludeBuilder = false }: { excludeBuilder?: boolean } = {},
  ): Promise<number> {
    const rows = await DevStabilityHarness.#psRowsOrThrow();
    const pids = DevStabilityHarness.#collectDescendants(rows, rootPid);
    return (
      rows
        .filter((row) => pids.has(row.pid))
        // `bun run akan …` is the npm-script shell wrapper, not a dev process.
        .filter((row) => !row.cmd.startsWith("bash -lc") && !row.cmd.includes("cli/build.ts"))
        .filter((row) => !excludeBuilder || !row.cmd.includes(DevStabilityHarness.#builderCmd))
        .reduce((total, row) => total + row.rssKb * 1024, 0)
    );
  }

  /**
   * The long-lived builder process on its own: its RSS is what bundler-arena retention used to move,
   * and its pid is what changes when the host recycles it, so a bounded-builder assertion needs both.
   */
  static async builderProcess(rootPid: number): Promise<{ pid: number; rssBytes: number } | null> {
    return DevStabilityHarness.#findProcess(rootPid, DevStabilityHarness.#builderCmd);
  }

  /** The disposable per-generation build worker, which should only exist while a build is running. */
  static async buildWorkerProcess(rootPid: number): Promise<{ pid: number; rssBytes: number } | null> {
    return DevStabilityHarness.#findProcess(rootPid, DevStabilityHarness.#buildWorkerCmd);
  }

  static async #findProcess(rootPid: number, cmdIncludes: string) {
    const rows = await DevStabilityHarness.#psRowsOrThrow();
    const pids = DevStabilityHarness.#collectDescendants(rows, rootPid);
    const found = rows.find((row) => pids.has(row.pid) && row.cmd.includes(cmdIncludes));
    return found ? { pid: found.pid, rssBytes: found.rssKb * 1024 } : null;
  }

  /** Pids of `rootPid` and everything under it, deepest first, so callers can signal children before parents. */
  static async descendantPids(rootPid: number | undefined): Promise<number[]> {
    if (!rootPid) return [];
    const pids = DevStabilityHarness.#collectDescendants(await DevStabilityHarness.#psRowsOrEmpty(), rootPid);
    return [...pids].reverse();
  }

  /**
   * `ps` output as rows, or `null` when `ps` did not answer in time.
   *
   * Bounded because the unbounded version hung indefinitely under parallel load, and it was the single
   * root cause of every remaining cleanup failure: a `ps` that never returns became an `afterEach` timeout,
   * and once a `beforeAll` timeout that cost an entire shard — 0 of 16 tests ran. The watchdog named it
   * outright (`descendants still running after 10000ms`). It also spawns `ps` directly rather than through
   * `Bun.$`, whose hung shells were what the runner then reported as `killed 1 dangling process`.
   *
   * `null` rather than `[]` on purpose: an empty list is a legitimate answer to "is the builder running",
   * so collapsing the two would let a measurement read a timeout as "no such process" and quietly assert
   * the opposite of what it meant to.
   */
  static readonly #psTimeoutMs = 5_000;

  static async #psRows(): Promise<Array<{ pid: number; ppid: number; rssKb: number; cmd: string }> | null> {
    let proc: Bun.Subprocess<"ignore", "pipe", "ignore">;
    try {
      proc = Bun.spawn(["ps", "-eo", "pid,ppid,rss,command"], {
        stdout: "pipe",
        stderr: "ignore",
        stdin: "ignore",
      });
    } catch (error) {
      // No `ps` at all — a slim container image such as `oven/bun` ships without procps. Same answer as
      // a timeout, and for the same reason: this is "could not look", not "nothing is running".
      console.warn(`[harness] could not run ps: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    const output = await Promise.race([
      new Response(proc.stdout).text().catch(() => ""),
      wait(DevStabilityHarness.#psTimeoutMs).then(() => null),
    ]);
    if (output === null) {
      proc.kill("SIGKILL");
      console.warn(`[harness] ps did not answer within ${DevStabilityHarness.#psTimeoutMs}ms`);
      return null;
    }
    return output
      .split("\n")
      .slice(1)
      .flatMap((line) => {
        const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
        return match
          ? [{ pid: Number(match[1]), ppid: Number(match[2]), rssKb: Number(match[3]), cmd: match[4] ?? "" }]
          : [];
      });
  }

  /** For callers that kill: an incomplete list is survivable, because they also signal the tracked child
   *  directly, and hanging instead would cost the whole test. */
  static async #psRowsOrEmpty(): Promise<Array<{ pid: number; ppid: number; rssKb: number; cmd: string }>> {
    return (await DevStabilityHarness.#psRows()) ?? [];
  }

  /** For callers that measure: a missing process list must fail loudly, never read as "nothing running". */
  static async #psRowsOrThrow(): Promise<Array<{ pid: number; ppid: number; rssKb: number; cmd: string }>> {
    const rows = (await DevStabilityHarness.#psRows()) ?? (await DevStabilityHarness.#psRows());
    if (!rows) throw new Error("ps did not answer twice in a row; cannot measure the process tree");
    return rows;
  }

  static #collectDescendants(rows: Array<{ pid: number; ppid: number }>, rootPid: number): Set<number> {
    // Iterate to a fixpoint rather than a fixed depth: the tree is `bash -lc` -> `bun run` -> the `&&`
    // shell -> dev host -> gateway -> replica -> rsc worker, and a pass only guarantees one new
    // generation when `ps` happens to list parents before children. A capped walk silently leaves the
    // deepest processes unsignalled, which is how orphaned dev hosts survived `stop()`.
    const pids = new Set([rootPid]);
    for (let added = 1; added > 0; ) {
      added = 0;
      for (const row of rows)
        if (pids.has(row.ppid) && !pids.has(row.pid)) {
          pids.add(row.pid);
          added++;
        }
    }
    return pids;
  }

  static #signalPids(pids: number[], signal: NodeJS.Signals): void {
    for (const pid of pids) {
      try {
        process.kill(pid, signal);
      } catch {
        // Already exited, or reaped between the `ps` snapshot and here.
      }
    }
  }
}

export async function waitForHmrMessageSince(
  messages: unknown[],
  mark: number,
  predicate: (message: unknown) => boolean,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  describeProbe?: () => string,
): Promise<unknown> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = messages.slice(mark).find(predicate);
    if (found) return found;
    await wait(50);
  }
  // "Timed out" alone cannot distinguish the two cases that matter: the message was never published, or
  // the socket died and nothing could have arrived. Both look identical from the message array.
  throw new Error(
    `Timed out waiting for HMR message since mark ${mark}${describeProbe ? ` (${describeProbe()})` : ""}`,
  );
}

export async function waitForNoHmrMessageSince(
  messages: unknown[],
  mark: number,
  predicate: (message: unknown) => boolean,
  quietMs = 750,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < quietMs) {
    const found = messages.slice(mark).find(predicate);
    if (found) throw new Error(`Unexpected HMR message after mark ${mark}: ${JSON.stringify(found)}`);
    await wait(50);
  }
}

export async function waitForLog(
  logs: string[],
  pattern: RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RegExpMatchArray> {
  return await waitForLogSince(logs, 0, pattern, timeoutMs);
}

export const markLog = (logs: string[]): number => logs.join("").length;

export async function waitForLogSince(
  logs: string[],
  mark: number,
  pattern: RegExp,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<RegExpMatchArray> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const joined = logs.join("").slice(mark);
    const match = joined.match(pattern);
    if (match) return match;
    await wait(50);
  }
  const tail = logs.join("").slice(mark).slice(-4_000);
  throw new Error(`Timed out waiting for log pattern ${pattern} since mark ${mark}\nRecent logs:\n${tail}`);
}
