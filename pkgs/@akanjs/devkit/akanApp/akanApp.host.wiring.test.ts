import { afterEach, describe, expect, jest, mock, spyOn, test } from "bun:test";
import path from "node:path";
import type { BuilderMessage, ChangeBatch, DevBuildStatus } from "akanjs/server";
import { IncrementalBuilderHost } from "../incrementalBuilder";
import { createTempApp, isolateEnv, tempRoots, writeText } from "../test/testHelpers";
import { backendRecoveryPolicy, type DevHostEvent } from "./devHostPolicy";

interface FakeWatcher {
  onBatch: (batch: ChangeBatch) => void;
  stopped: number;
}

const watchers: FakeWatcher[] = [];

mock.module("../frontendBuild/watchRootResolver", () => ({
  WatchRootResolver: class {
    async resolve() {
      return ["/repo"];
    }
  },
}));
mock.module("../frontendBuild/hmrWatcher", () => ({
  HmrWatcher: class {
    readonly #watcher: FakeWatcher;
    constructor({ onBatch }: { onBatch: (batch: ChangeBatch) => void }) {
      this.#watcher = { onBatch, stopped: 0 };
      watchers.push(this.#watcher);
    }
    async start() {}
    stop() {
      this.#watcher.stopped += 1;
    }
  },
}));

const { AkanAppHost } = await import("./akanApp.host");

type Boot = "ready" | "exit" | "hold" | "starting";

interface BuilderStartOptions {
  onExit?: () => void;
  onReady?: () => void;
  onRestartReady?: () => void;
  onAway?: () => void;
}

interface FakeBuilder {
  status: string;
  sent: BuilderMessage[];
  recycled: string[];
  stopped: number;
  toHost: (message: BuilderMessage) => void;
  ready: () => void;
  away: () => void;
  restartReady: () => void;
}

interface FakeBackend {
  sent: BuilderMessage[];
  signals: string[];
  lingers: boolean;
  say: (message: BuilderMessage) => void;
  crash: () => void;
  exit: () => void;
}

interface BackendSpawnOptions {
  ipc: (message: BuilderMessage) => void;
  onExit?: (proc: unknown, code: number | null, signal: string | null) => void;
}

const track = tempRoots();
const hosts: InstanceType<typeof AkanAppHost>[] = [];
const restores: (() => void)[] = [];

afterEach(async () => {
  try {
    await Promise.all(hosts.splice(0).map((host) => host.stop()));
  } finally {
    for (const restore of restores.splice(0)) restore();
    watchers.length = 0;
  }
});

const until = async (done: () => boolean, timeoutMs = 5_000) => {
  const deadline = performance.now() + timeoutMs;
  while (!done() && performance.now() < deadline) await Bun.sleep(10);
  return done();
};

const fakeBuilder = (toHost: (message: BuilderMessage) => void, boot: Boot) => {
  let options: BuilderStartOptions = {};
  const builder: FakeBuilder = {
    status: "stopped",
    sent: [],
    recycled: [],
    stopped: 0,
    toHost,
    ready: () => {
      builder.status = "ready";
      options.onReady?.();
    },
    away: () => {
      builder.status = "restarting";
      options.onAway?.();
    },
    restartReady: () => {
      builder.status = "ready";
      options.onRestartReady?.();
    },
  };
  const host = {
    patcherOff: false,
    pid: process.pid,
    get status() {
      return builder.status;
    },
    start: (startOptions: BuilderStartOptions) => {
      options = startOptions;
      if (boot === "exit") {
        builder.status = "stopped";
        options.onExit?.();
      } else if (boot === "ready") builder.ready();
      else {
        builder.status = "starting";
        if (boot === "starting") options.onReady?.();
      }
    },
    send: (message: BuilderMessage) => {
      if (builder.status !== "ready") return false;
      builder.sent.push(message);
      return true;
    },
    stop: () => {
      builder.stopped += 1;
      builder.status = "stopped";
    },
    recycle: (reason: string) => {
      if (builder.status !== "ready") return false;
      builder.recycled.push(reason);
      builder.status = "recycling";
      return true;
    },
  };
  return { builder, host: host as unknown as IncrementalBuilderHost };
};

const fakeBackends = () => {
  const backends: FakeBackend[] = [];
  const spawn = Bun.spawn;
  const spawned = spyOn(Bun, "spawn").mockImplementation(((cmd: string[], options: BackendSpawnOptions) => {
    if (cmd[0] !== "bun" || cmd[1] !== "apps/demo/main.ts") return spawn(cmd, options as Parameters<typeof spawn>[1]);
    const exit = Promise.withResolvers<number>();
    let exited = false;
    const finish = (code: number, signal: string | null) => {
      if (exited) return;
      exited = true;
      exit.resolve(code);
      queueMicrotask(() => options.onExit?.(proc, code, signal));
    };
    const backend: FakeBackend = {
      sent: [],
      signals: [],
      lingers: false,
      say: (message) => options.ipc(message),
      crash: () => finish(1, null),
      exit: () => finish(0, "SIGTERM"),
    };
    const proc = {
      pid: 5_000_000 + backends.length,
      killed: false,
      exited: exit.promise,
      send: (message: BuilderMessage) => void backend.sent.push(message),
      kill: (signal = "SIGTERM") => {
        backend.signals.push(signal);
        proc.killed = true;
        if (!backend.lingers || signal === "SIGKILL") finish(0, signal);
      },
    };
    backends.push(backend);
    return proc;
  }) as unknown as typeof Bun.spawn);
  restores.push(() => spawned.mockRestore());
  return backends;
};

const devHost = async (boots: Boot[] = []) => {
  const { root, app } = track(await createTempApp("demo"));
  const mainPath = path.join(root, "apps/demo/main.ts");
  await writeText(mainPath, "export const version = 1;\n");
  const backends = fakeBackends();
  const builders: FakeBuilder[] = [];
  const events: DevHostEvent[] = [];
  const eventTimes: number[] = [];
  const logs: string[] = [];
  const create = IncrementalBuilderHost.create;
  IncrementalBuilderHost.create = (async (_app: unknown, _env: unknown, toHost: (message: BuilderMessage) => void) => {
    const { builder, host } = fakeBuilder(toHost, boots.shift() ?? "ready");
    builders.push(builder);
    return host;
  }) as unknown as typeof IncrementalBuilderHost.create;
  restores.push(() => {
    IncrementalBuilderHost.create = create;
  });
  const host = new AkanAppHost(app, {
    env: { ...process.env } as Record<string, string>,
    onDevEvent: (event) => {
      events.push(event);
      eventTimes.push(performance.now());
    },
  });
  hosts.push(host);
  const awaited: { text: string; resolve: () => void }[] = [];
  for (const level of ["verbose", "info", "warn", "error"] as const)
    spyOn(host.logger, level).mockImplementation((message: string) => {
      logs.push(message);
      for (const waiter of awaited.filter(({ text }) => message.includes(text))) {
        awaited.splice(awaited.indexOf(waiter), 1);
        waiter.resolve();
      }
    });
  return {
    app,
    host,
    root,
    mainPath,
    backends,
    builders,
    events,
    logs,
    builder: () => builders.at(-1) as FakeBuilder,
    backend: () => backends.at(-1) as FakeBackend,
    logged: (text: string) => logs.some((line) => line.includes(text)),
    nextLog: (text: string) => new Promise<void>((resolve) => void awaited.push({ text, resolve })),
    suspended: () => events.some((event) => "state" in event && event.state === "suspended"),
    suspendedAt: () => eventTimes[events.findIndex((event) => "state" in event && event.state === "suspended")],
    lastState: () => events.flatMap((event) => ("state" in event ? [event.state] : [])).at(-1),
  };
};

type DevHost = Awaited<ReturnType<typeof devHost>>;

const readyBackend = (dev: DevHost) => dev.backend().say({ type: "backend-ready", pid: 1 });

const startedHost = async (boots: Boot[] = []) => {
  const dev = await devHost(boots);
  await dev.host.start();
  readyBackend(dev);
  return dev;
};

const pages = (generation: number, reason?: "builder-recycle", bundle = generation) =>
  ({
    type: "pages-updated",
    data: { bundlePath: `/app/pages-${bundle}.js`, buildId: bundle, generation, ...(reason ? { reason } : {}) },
  }) as BuilderMessage;

const status = (generation: number, ok: boolean, files = ["/app/lib/a.ts"]): DevBuildStatus => ({
  generation,
  phase: "pages",
  ok,
  files,
  ...(ok ? {} : { message: "Type error" }),
});

const invalidate = (generation: number, actions: string[], files: string[] = ["/app/lib/a.ts"]) =>
  ({
    type: "invalidate",
    kinds: [],
    files,
    generation,
    devPlan: { generation, files, generatedFiles: [], roles: ["server"], actions, reasonByFile: {} },
  }) as unknown as BuilderMessage;

const metrics = (generation: number) =>
  ({ type: "builder-metrics", data: { rssBytes: 64 * 1024 * 1024, generation, workCount: 3 } }) as BuilderMessage;

const sentOf = (messages: BuilderMessage[], type: BuilderMessage["type"]) =>
  messages.filter((message) => message.type === type);

const statusesOf = (messages: BuilderMessage[]) =>
  messages.flatMap((message) => (message.type === "build-status" ? [message.data] : []));

describe("AkanAppHost relays the builder to the backend", () => {
  isolateEnv({ AKAN_PUBLIC_REPO_NAME: "repo", AKAN_PUBLIC_SERVE_DOMAIN: "localhost", AKAN_PUBLIC_ENV: "local" });

  test("hands the backend every builder event it does not act on itself", async () => {
    const dev = await startedHost();
    const events: BuilderMessage[] = [
      { type: "builder-ready" },
      { type: "csr-updated", data: { generation: 1, mode: "registry", reload: false } },
      { type: "ssr-updated", data: { generation: 1, reload: false } },
    ];
    for (const event of events) dev.builder().toHost(event);

    expect(await until(() => dev.backend().sent.length >= events.length)).toBe(true);
    expect(dev.backend().sent).toEqual(events);
  });

  test("replays the last good pages and css to a backend that is ready only after they were built", async () => {
    const dev = await devHost();
    await dev.host.start();
    const css = { type: "css-updated", data: { generation: 3, cssAssets: {} } } as unknown as BuilderMessage;
    dev.builder().toHost(pages(2));
    dev.builder().toHost(css);
    expect(await until(() => dev.host.env.AKAN_BUILDER_INITIAL_GENERATION === "3")).toBe(true);
    expect(dev.backend().sent).toEqual([]);

    readyBackend(dev);

    expect(dev.backend().sent).toEqual([css, pages(2)]);
  });

  test("passes on a recycled builder's pages only when its bundle moved", async () => {
    const dev = await startedHost();
    dev.builder().toHost(pages(2));
    dev.builder().toHost(pages(9, "builder-recycle", 2));
    expect(await until(() => dev.host.env.AKAN_BUILDER_INITIAL_GENERATION === "9")).toBe(true);
    expect(sentOf(dev.backend().sent, "pages-updated")).toEqual([pages(2)]);

    dev.builder().toHost(pages(10, "builder-recycle"));

    expect(await until(() => sentOf(dev.backend().sent, "pages-updated").length === 2)).toBe(true);
  });

  test("relays a build status to the backend, and starts the next builder from its generation", async () => {
    const dev = await startedHost();

    dev.builder().toHost({ type: "build-status", data: status(5, true) });

    expect(await until(() => statusesOf(dev.backend().sent).length > 0)).toBe(true);
    expect(statusesOf(dev.backend().sent)).toEqual([status(5, true)]);
    expect(dev.host.env.AKAN_BUILDER_INITIAL_GENERATION).toBe("5");
  });

  test("holds a builder restart whose generation failed to build, and tells the backend why", async () => {
    const dev = await startedHost();
    const onHold = () => statusesOf(dev.backend().sent).some((sent) => sent.phase === "scan" && !sent.ok);

    dev.builder().toHost({ type: "build-status", data: status(7, false) });
    dev.builder().toHost(invalidate(7, ["restart-builder"]));

    expect(await until(() => onHold() || dev.builders.length > 1)).toBe(true);
    expect(onHold()).toBe(true);
    expect(dev.builders).toHaveLength(1);
  });

  test("retries a config restart that failed to apply once a green build touches its file", async () => {
    const dev = await startedHost();
    const configPath = path.join(dev.root, "apps/demo/akan.config.ts");
    spyOn(dev.app, "getConfig").mockRejectedValue(new Error("akan.config.ts does not load"));
    dev.builder().toHost({ type: "invalidate", kinds: ["config"], files: [configPath], generation: 2 });
    expect(await until(() => dev.backends.length === 2)).toBe(true);
    readyBackend(dev);

    dev.builder().toHost({ type: "build-status", data: status(3, true, [configPath]) });

    expect(await until(() => dev.backends[1].signals.length > 0)).toBe(true);
  });

  test("restarts the backend for an invalidate whose plan restarts it", async () => {
    const dev = await startedHost();

    dev.builder().toHost(invalidate(4, ["restart-backend"]));

    expect(await until(() => dev.backends.length === 2)).toBe(true);
    expect(dev.backends[0].signals).toEqual(["SIGTERM"]);
  });

  test("brings a backend that gave up back on the next green build", async () => {
    const policy = { ...backendRecoveryPolicy };
    Object.assign(backendRecoveryPolicy, { min: 5, max: 5, maxAttempts: 1 });
    restores.push(() => Object.assign(backendRecoveryPolicy, policy));
    const dev = await startedHost();
    dev.backend().crash();
    expect(await until(() => dev.backends.length === 2)).toBe(true);
    dev.backend().crash();
    expect(await until(() => dev.lastState() === "failed")).toBe(true);

    dev.builder().toHost({ type: "build-status", data: status(3, true) });

    expect(await until(() => dev.backends.length === 3)).toBe(true);
  });

  test("reports the app booted once its backend is ready and the builder's boot builds settled", async () => {
    const dev = await startedHost();

    dev.builder().toHost({ type: "boot-armed" });

    expect(await until(() => dev.events.some((event) => "booted" in event), 2_000)).toBe(true);
    expect(dev.events.filter((event) => "booted" in event)).toEqual([{ app: "demo", booted: true }]);
  });
});

describe("AkanAppHost through a builder's own restart", () => {
  isolateEnv({ AKAN_PUBLIC_REPO_NAME: "repo", AKAN_PUBLIC_SERVE_DOMAIN: "localhost", AKAN_PUBLIC_ENV: "local" });

  test("hands the returning builder the requests held for it, and the backend its last good state again", async () => {
    const dev = await startedHost();
    dev.builder().toHost(pages(2));
    expect(await until(() => sentOf(dev.backend().sent, "pages-updated").length === 1)).toBe(true);

    dev.builder().away();
    dev.backend().say({ type: "build-graph", id: 4 });
    expect(dev.builder().sent).toEqual([]);
    dev.builder().restartReady();

    expect(sentOf(dev.builder().sent, "build-graph")).toHaveLength(1);
    expect(sentOf(dev.backend().sent, "pages-updated")).toEqual([pages(2), pages(2)]);
  });

  test("restarts the backend for a backend file saved while the builder was away", async () => {
    const dev = await startedHost();

    dev.builder().away();
    expect(await until(() => dev.logged("[builder-gap] stamped"))).toBe(true);
    await writeText(dev.mainPath, "export const version = 22;\n");
    dev.builder().restartReady();

    expect(await until(() => dev.backends.length === 2)).toBe(true);
  });

  test("drops the requests a restarted backend's predecessor left held for the builder", async () => {
    const dev = await startedHost();
    dev.builder().away();
    dev.backend().say({ type: "build-graph", id: 1 });

    dev.builder().toHost(invalidate(4, ["restart-backend"]));
    expect(await until(() => dev.backends.length === 2)).toBe(true);
    dev.builder().restartReady();

    expect(dev.builder().sent).toEqual([]);
  });

  test("recycles a builder past its rss ceiling, and counts a save made from that request as missed", async () => {
    process.env.AKAN_BUILDER_MAX_RSS_MB = "1";
    const dev = await startedHost();

    dev.builder().toHost(metrics(1));
    expect(await until(() => dev.builder().recycled.length > 0)).toBe(true);
    expect(await until(() => dev.logged("[builder-gap] stamped"))).toBe(true);
    await writeText(dev.mainPath, "export const version = 22;\n");
    dev.builder().away();
    dev.builder().restartReady();

    expect(await until(() => dev.backends.length === 2)).toBe(true);
    expect(await until(() => dev.logged("a freshly recycled builder is already at"))).toBe(true);
  });

  test("skips an rss recycle while a builder restart is on hold", async () => {
    process.env.AKAN_BUILDER_MAX_RSS_MB = "1";
    const dev = await startedHost();
    dev.builder().toHost({ type: "build-status", data: status(7, false) });
    dev.builder().toHost(invalidate(7, ["restart-builder"]));

    dev.builder().toHost(metrics(8));

    const skipped = () => dev.logged("a dev restart is already pending");
    expect(await until(() => skipped() || dev.builder().recycled.length > 0)).toBe(true);
    expect(skipped()).toBe(true);
    expect(dev.builder().recycled).toEqual([]);
  });

  test("forgets an armed rss recycle once the builder is replaced", async () => {
    process.env.AKAN_BUILDER_MAX_RSS_MB = "1";
    process.env.AKAN_DEV_IDLE_SUSPEND_MS = "50";
    const dev = await devHost();
    await dev.host.start();
    dev.builder().toHost(metrics(1));
    dev.builder().toHost(invalidate(2, ["restart-builder"]));
    expect(await until(() => dev.backends.length === 2)).toBe(true);

    readyBackend(dev);

    const restartPending = () => dev.logged("skipped (restart-pending)");
    expect(await until(() => dev.suspended() || restartPending())).toBe(true);
    expect(restartPending()).toBe(false);
  });
});

describe("AkanAppHost through an idle suspend", () => {
  isolateEnv({
    AKAN_PUBLIC_REPO_NAME: "repo",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
    AKAN_PUBLIC_ENV: "local",
    AKAN_DEV_IDLE_SUSPEND_MS: "50",
  });

  const suspendedHost = async (boots: Boot[] = []) => {
    const dev = await startedHost(boots);
    expect(await until(dev.suspended)).toBe(true);
    return dev;
  };

  test("releases the builder, and comes back as ready on a new one", async () => {
    const dev = await suspendedHost();
    expect(dev.builders[0].stopped).toBe(1);

    watchers[0].onBatch({ files: ["/app/ui/Button.css"], kinds: new Set(["css"]) });

    expect(await until(() => dev.lastState() === "ready")).toBe(true);
    expect(dev.builders).toHaveLength(2);
  });

  test("restarts the backend for a backend file saved while the builder was released", async () => {
    const dev = await suspendedHost();
    expect(await until(() => dev.logged("[builder-gap] stamped"))).toBe(true);
    await writeText(dev.mainPath, "export const version = 22;\n");

    dev.backend().say({ type: "build-graph", id: 3 });

    expect(await until(() => dev.backends.length === 2)).toBe(true);
  });

  test("answers a held request when the builder cannot start, and reports the builder recovered once it can", async () => {
    const dev = await suspendedHost(["ready", "exit", "exit", "exit", "hold"]);
    const backend = dev.backend();

    backend.say({ type: "build-graph", id: 6 });
    expect(await until(() => sentOf(backend.sent, "build-graph-res").length > 0)).toBe(true);
    expect(sentOf(backend.sent, "build-graph-res")).toEqual([
      { type: "build-graph-res", id: 6, ok: false, error: "builder failed to start", kind: "unavailable" },
    ]);

    expect(await until(() => dev.builders.length === 5)).toBe(true);
    backend.say({ type: "build-graph", id: 8 });
    expect(dev.builder().sent).toEqual([]);
    dev.builder().ready();
    expect(dev.builder().sent).toHaveLength(1);

    expect(await until(() => statusesOf(backend.sent).some((sent) => sent.message === "Builder recovered"))).toBe(true);
  }, 10_000);

  test("stops watching for edits once the host stops", async () => {
    const dev = await suspendedHost();
    expect(watchers.map((watcher) => watcher.stopped)).toEqual([0]);

    await dev.host.stop();

    expect(watchers.map((watcher) => watcher.stopped)).toEqual([1]);
  });

  test.each([
    ["the builder is not ready", "builder-not-ready", ["starting"], readyBackend],
    ["the backend is not ready", "backend-not-ready", [], () => undefined],
    [
      "the build is failing",
      "build-failed",
      [],
      (dev: DevHost) => {
        dev.builder().toHost({ type: "build-status", data: status(2, false) });
        readyBackend(dev);
      },
    ],
    [
      "a backend restart is pending",
      "restart-pending",
      [],
      (dev: DevHost) => {
        readyBackend(dev);
        dev.builder().toHost(invalidate(3, ["restart-backend"]));
      },
    ],
    [
      "an rss recycle is armed",
      "restart-pending",
      [],
      (dev: DevHost) => {
        process.env.AKAN_BUILDER_MAX_RSS_MB = "1";
        dev.builder().toHost(metrics(1));
        readyBackend(dev);
      },
    ],
  ] as [string, string, Boot[], (dev: DevHost) => void][])(
    "keeps the builder while %s",
    async (_when, decision, boots, arrange) => {
      const dev = await devHost(boots);
      await dev.host.start();
      arrange(dev);

      const skipped = () => dev.logged(`[idle-suspend] skipped (${decision})`);
      expect(await until(() => skipped() || dev.suspended())).toBe(true);
      expect(skipped()).toBe(true);
      expect(dev.suspended()).toBe(false);
    },
  );

  test("keeps the builder while a config change that failed to apply waits for its fix", async () => {
    const dev = await devHost();
    await dev.host.start();
    const configPath = path.join(dev.root, "apps/demo/akan.config.ts");
    spyOn(dev.app, "getConfig").mockRejectedValue(new Error("akan.config.ts does not load"));
    dev.builder().toHost({ type: "invalidate", kinds: ["config"], files: [configPath], generation: 2 });
    expect(await until(() => dev.logged("[builder-recovery] builder recovered"))).toBe(true);
    readyBackend(dev);
    const greenAt = dev.logs.length;

    dev.builder().toHost({ type: "build-status", data: { generation: 3, phase: "scan", ok: true, files: [] } });

    const skipped = () => dev.logs.slice(greenAt).some((line) => line.includes("skipped (restart-pending)"));
    expect(await until(() => skipped() || dev.suspended())).toBe(true);
    expect(dev.suspended()).toBe(false);
  }, 10_000);

  //? Activity only re-arms the idle timer, so the time the suspend lands is the one thing that shows it.
  test.each([
    ["a builder message", (dev: DevHost) => dev.builder().toHost({ type: "builder-ready" })],
    ["a backend request", (dev: DevHost) => dev.backend().say({ type: "build-graph", id: 1 })],
  ] as [string, (dev: DevHost) => void][])("%s puts the suspend off", async (_activity, poke) => {
    process.env.AKAN_DEV_IDLE_SUSPEND_MS = "400";
    const dev = await startedHost();
    let pokes = 0;
    let lastPokeAt = 0;
    const poking = setInterval(() => {
      if (pokes === 30) return clearInterval(poking);
      pokes += 1;
      lastPokeAt = performance.now();
      poke(dev);
    }, 20);
    restores.push(() => clearInterval(poking));

    expect(await until(() => pokes === 30 && dev.suspended())).toBe(true);
    expect(dev.suspendedAt() - lastPokeAt).toBeGreaterThanOrEqual(400);
  });
});

describe("AkanAppHost start and stop", () => {
  isolateEnv({ AKAN_PUBLIC_REPO_NAME: "repo", AKAN_PUBLIC_SERVE_DOMAIN: "localhost", AKAN_PUBLIC_ENV: "local" });

  test("a stop answers the requests held for the builder, then stops the backend and the builder", async () => {
    const dev = await startedHost();
    dev.builder().away();
    dev.backend().say({ type: "build-graph", id: 2 });

    await dev.host.stop();

    expect(dev.backend().sent).toEqual([
      { type: "build-graph-res", id: 2, ok: false, error: "dev server is shutting down", kind: "unavailable" },
    ]);
    expect(dev.backend().signals).toEqual(["SIGTERM"]);
    expect(dev.builder().stopped).toBe(1);
  });

  test("a stop while a builder restart waits on its new builder leaves no backend behind", async () => {
    const dev = await startedHost(["ready", "hold"]);
    dev.builder().toHost(invalidate(2, ["restart-builder"]));
    expect(await until(() => dev.builders.length === 2)).toBe(true);

    await dev.host.stop();

    expect(await until(() => dev.logged("restart failed generation=2"))).toBe(true);
    expect(dev.backends).toHaveLength(1);
  });

  test("a stop during a backend restart waits for it, and signals the backend once", async () => {
    const dev = await startedHost();
    dev.backend().lingers = true;
    dev.builder().toHost(invalidate(4, ["restart-backend"]));
    expect(await until(() => dev.backend().signals.length > 0)).toBe(true);

    const stopping = dev.host.stop();
    dev.backend().exit();
    await stopping;

    expect(dev.backends.map((backend) => backend.signals)).toEqual([["SIGTERM"]]);
  });

  test("drops a builder message that lands after the stop", async () => {
    const dev = await startedHost();
    await dev.host.stop();
    const seen = dev.events.length;

    dev.builder().toHost(invalidate(5, ["restart-backend"]));
    //? The dropped message and a handled one both settle in microtasks, so one macrotask turn shows either.
    await new Promise((resolve) => setImmediate(resolve));

    expect(dev.events.slice(seen)).toEqual([]);
  });

  test("a second start replaces the backend and the builder the first one started", async () => {
    const dev = await startedHost();

    await dev.host.start();

    expect(dev.backends.map((backend) => backend.signals)).toEqual([["SIGTERM"], []]);
    expect(dev.builders.map((builder) => builder.stopped)).toEqual([1, 0]);
  });
});

describe("AkanAppHost on a fake clock", () => {
  isolateEnv({
    AKAN_PUBLIC_REPO_NAME: "repo",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
    AKAN_PUBLIC_ENV: "local",
    AKAN_BUILDER_MAX_RSS_MB: "1",
  });

  //? Every invalidate re-arms the recycle, so only a restart from the builder gap can land inside its quiet window.
  test("skips an rss recycle that comes due while a backend restart waits out its debounce", async () => {
    const dev = await startedHost();
    const stamped = dev.nextLog("[builder-gap] stamped");
    dev.builder().away();
    await stamped;
    await writeText(dev.mainPath, "export const version = 22;\n");
    jest.useFakeTimers();
    try {
      const armed = dev.nextLog("[builder-recycle] armed");
      dev.builder().toHost(metrics(1));
      await armed;
      jest.advanceTimersByTime(700);
      const scheduled = dev.nextLog("-> restart-pending");
      dev.builder().restartReady();
      await scheduled;

      jest.advanceTimersByTime(50);

      expect(dev.logged("a dev restart is already pending")).toBe(true);
      expect(dev.builder().recycled).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});
