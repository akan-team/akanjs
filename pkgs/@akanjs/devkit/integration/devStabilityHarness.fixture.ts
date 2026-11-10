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
    await Promise.all(
      ["page", "common", "srvkit", "ui", "webkit", "lib", "env", "public"].map((dir) =>
        mkdir(path.join(this.appDir, dir), { recursive: true }),
      ),
    );
    const files: { [relativePath: string]: string } = {
      "main.ts": `import { AkanApp } from "akanjs/server";

const run = async () => {
  await new AkanApp("./server").start();
};
void run();
`,
      "akan.config.ts": `import type { AppConfig } from "akanjs";

const config: AppConfig = {};
export default config;
`,
      "package.json": `{
  "type": "module",
  "name": "${this.appName}",
  "version": "0.0.1"
}
`,
      "tsconfig.json": `{
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
      "env/env.client.ts": `export const env = {} as const;
`,
      "env/env.server.ts": `export const env = {} as const;
`,
      "env/env.server.testing.ts": `export { env } from "./env.server";
`,
      "lib/option.ts": `import { AkanOption } from "akanjs/server";

export type ModulesOptions = Record<string, never>;
export const option = new AkanOption<ModulesOptions>();
`,
      "server.ts": `import { AkanServer, AkanLib } from "akanjs/server";
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
      "page/_layout.tsx": `import "./styles.css";
import { layout } from "akanjs/client";

export default layout().render(({ children }) => {
  return <>{children}</>;
});
`,
      "page/_index.tsx": `import { page } from "akanjs/client";
import { marker } from "../common/marker";
import { ClientMarker } from "../ui/ClientMarker";

export default page().render(() => {
  return (
    <main>
      <h1>Dev stability fixture</h1>
      <p data-testid="marker">{marker}</p>
      <ClientMarker />
    </main>
  );
});
`,
      // Route clients are built on demand and cached, so only a never-requested route reaches the builder.
      "page/second/_index.tsx": `import { page } from "akanjs/client";
import { ClientMarker } from "../../ui/ClientMarker";

export default page().render(() => {
  return (
    <main>
      <h1>Second route</h1>
      <ClientMarker />
    </main>
  );
});
`,
      "page/styles.css": `main {
  color: black;
}
`,
      "common/marker.ts": `export const marker = "initial-shared-marker";
`,
      "srvkit/backendMarker.ts": `export const backendMarker = "initial-backend-marker";
`,
      "lib/_fixture/fixture.service.ts": `import { serve } from "akanjs/service";

export class FixtureService extends serve("fixture" as const, { serverMode: "batch" }, () => ({})) {}
`,
      "lib/_fixture/fixture.signal.ts": `import { endpoint, internal } from "akanjs/signal";

import * as srv from "../srv";

export class FixtureInternal extends internal(srv.fixture, () => ({})) {}

export class FixtureEndpoint extends endpoint(srv.fixture, () => ({})) {}
`,
      "lib/_fixture/fixture.dictionary.ts": `import { serviceDictionary } from "akanjs/dictionary";

import type { FixtureEndpoint } from "./fixture.signal";

export const dictionary = serviceDictionary(["en", "ko"])
  .endpoint<FixtureEndpoint>(() => ({}))
  .translate({
    hello: ["Initial Dictionary", "초기 사전"],
    removeMe: ["Remove Me", "삭제 예정"],
  });
`,
      "ui/ClientMarker.tsx": `export function ClientMarker() {
  return <p data-testid="client-marker">initial-client-marker</p>;
}
`,
      "webkit/useMarker.ts": `export const useMarker = () => "initial-webkit-marker";
`,
    };
    await Promise.all(Object.entries(files).map(([relativePath, contents]) => this.writeFile(relativePath, contents)));
    const port = await this.resolvePort();
    return { appName: this.appName, appDir: this.appDir, workspaceRoot: this.workspaceRoot, port };
  }

  // Bounded: an overrun `afterEach` fails the already-passed test and leaves this host running into the next ones.
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
    // Killing the tracked child directly needs no `ps`, so it cannot hang the way the orderly path just did.
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
  // Inside the suite's 60s hook budget, so the harness names the stalled phase before Bun's bare hook timeout.
  static readonly #cleanupBudgetMs = 30_000;

  // Bun reports a hung hook with no location, so warn while a phase is still running, not after it ends.
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
        // The dev-plan/hmr assertions match verbose-level lines.
        AKAN_PUBLIC_LOG_LEVEL: "verbose",
        NODE_NO_WARNINGS: "1",
        //? CI's `.env` names the branch; any env but local makes `akan start` ssh-tunnel to that cluster's Redis.
        AKAN_PUBLIC_ENV: "local",
        PORT_OFFSET: String(offset),
        // Pinned: `getDevPort()` derives from the fixture's index in `apps/`, which parallel runs keep moving.
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
      markLog: () => logs.join("").length,
      waitForLog: (pattern, waitMs) =>
        DevStabilityHarness.#timed(`waitForLog ${pattern}`, () => waitForLogSince(logs, 0, pattern, waitMs)),
      waitForLogSince: (mark, pattern, waitMs) =>
        DevStabilityHarness.#timed(`waitForLogSince ${pattern}`, () => waitForLogSince(logs, mark, pattern, waitMs)),
      stop: async () => {
        await DevStabilityHarness.#dumpLogs(this.appName, logs);
        // Under `bash -lc`, killing `proc` only kills the shell, so every descendant is signalled too; `proc`
        // itself is signalled directly because `descendantPids` is empty when `ps` times out.
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
        // Signalling is not reaping: a live build worker would keep writing into the tree the caller deletes next.
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

  // Bun's recursive `fs.watch` can drop an edit landing in a build's write burst, so re-apply it until the dev
  // server logs evidence of seeing it (a regression detector: `retried` should stay 0); callers assert outcomes.
  async editUntilSeen(
    host: DevStabilityHost,
    mutate: (attempt: number) => Promise<void>,
    {
      evidence = DevStabilityHarness.#editEvidence,
      attempts = 3,
      // Generous: a dropped event never arrives late, while a needless retry can cost a whole dev-host restart.
      evidenceTimeoutMs = 20_000,
    }: {
      evidence?: RegExp;
      attempts?: number;
      evidenceTimeoutMs?: number;
    } = {},
  ): Promise<{ mark: number; attempts: number; evidence: RegExpMatchArray }> {
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
      await wait(750);
    }
  }

  static readonly #editEvidence = /\[dev-plan\] generation=\d+|\[idle-suspend\] waking/;
  static #observedEdits = 0;
  static #retriedEdits = 0;

  static editStats(): { edits: number; retried: number } {
    return { edits: DevStabilityHarness.#observedEdits, retried: DevStabilityHarness.#retriedEdits };
  }

  static readonly #waitDurations: { label: string; ms: number }[] = [];

  // Bounded waits can still sum past the test timeout, and Bun then names no step, so each one is recorded.
  static async #timed<T>(label: string, work: () => Promise<T>): Promise<T> {
    const at = performance.now();
    try {
      return await work();
    } finally {
      DevStabilityHarness.#waitDurations.push({ label, ms: Math.round(performance.now() - at) });
    }
  }

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
      // Re-resolved each poll: a dev-host restart can bind a different port.
      const port = await this.resolvePort();
      // Bounded per request: a recovering dev server can accept a connection and never answer.
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

  // Reconnects like the real client (`akanjs/server/hmr/clientScript.ts`): a socket a backend restart dropped
  // would otherwise read as silence.
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
        // Bounded and short: the last close is the teardown in `cleanup()`, where retrying would poll a dead port.
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
          // A server gone for good surfaces through the caller's own waits; never throw from a listener.
          .catch(() => undefined);
      });
    };
    listen(socket);
    return {
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

  async resolvePort(): Promise<number> {
    return this.#gatewayPortFromLogs() ?? this.#boundPort ?? (await this.#allocatePort()).port;
  }

  // The latest match: a restarted dev host recomputes its port from the `apps/` listing, which may have moved.
  #gatewayPortFromLogs(): number | null {
    const logs = this.#host?.logs;
    if (!logs) return null;
    let latest: number | null = null;
    for (const match of logs.join("").matchAll(/AkanApp gateway is running on port http:\/\/localhost:(\d+)/g))
      latest = Number(match[1]);
    return latest;
  }

  // A pid-seeded, forward-only cursor probed against the OS: no two harnesses in a process share an offset while
  // one still shuts down, and concurrent runs start in different places.
  static readonly portOffsetMin = 3_000;
  static readonly portOffsetMax = 4_000;
  // The port is `8282 + appIndex + offset`: a stride wider than any index drift keeps neighbouring offsets apart.
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

  // The default interface is the strict test: a bind there fails if any address the app might pick is held.
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
      // Child 0's websocket port is `port + 10_000` (`AkanApp` `#wsBasePort`), so both must be free.
      if ((await DevStabilityHarness.isPortFree(port)) && (await DevStabilityHarness.isPortFree(port + 10_000)))
        return { port, offset };
    }
    throw new Error(
      `No free dev port for ${this.appName} after probing ${DevStabilityHarness.#portOffsetSlots} offsets`,
    );
  }

  // Mirrors `getDevPort()`: dirs holding an akan.config.ts, locale-sorted; a stray entry would shift the port.
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

  // Only fixtures whose owning test pid is gone, so a concurrent run's live fixtures are never touched.
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

  // Not `incrementalBuilder`: the disposable worker `incrementalBuilder/buildBatch.proc.ts` would match too.
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

  static async builderProcess(rootPid: number): Promise<{ pid: number; rssBytes: number } | null> {
    return DevStabilityHarness.#findProcess(rootPid, DevStabilityHarness.#builderCmd);
  }

  static async buildWorkerProcess(rootPid: number): Promise<{ pid: number; rssBytes: number } | null> {
    return DevStabilityHarness.#findProcess(rootPid, DevStabilityHarness.#buildWorkerCmd);
  }

  static async #findProcess(rootPid: number, cmdIncludes: string) {
    const rows = await DevStabilityHarness.#psRowsOrThrow();
    const pids = DevStabilityHarness.#collectDescendants(rows, rootPid);
    const found = rows.find((row) => pids.has(row.pid) && row.cmd.includes(cmdIncludes));
    return found ? { pid: found.pid, rssBytes: found.rssKb * 1024 } : null;
  }

  // Deepest first, so callers signal children before parents.
  static async descendantPids(rootPid: number | undefined): Promise<number[]> {
    if (!rootPid) return [];
    const pids = DevStabilityHarness.#collectDescendants(await DevStabilityHarness.#psRowsOrEmpty(), rootPid);
    return [...pids].reverse();
  }

  // `ps` hangs under parallel load, so it is bounded and spawned directly (a hung `Bun.$` shell leaks). `null`, not
  // `[]`, means "could not look", which a measurement must never read as "nothing running".
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
      // Slim images such as `oven/bun` ship without procps.
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

  static async #psRowsOrEmpty(): Promise<Array<{ pid: number; ppid: number; rssKb: number; cmd: string }>> {
    return (await DevStabilityHarness.#psRows()) ?? [];
  }

  static async #psRowsOrThrow(): Promise<Array<{ pid: number; ppid: number; rssKb: number; cmd: string }>> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rows = await DevStabilityHarness.#psRows();
      if (rows) return rows;
    }
    throw new Error("ps did not answer twice in a row; cannot measure the process tree");
  }

  static #collectDescendants(rows: Array<{ pid: number; ppid: number }>, rootPid: number): Set<number> {
    // To a fixpoint, not a fixed depth: the tree is seven levels deep and `ps` lists it in no particular order.
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
