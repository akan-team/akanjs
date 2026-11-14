import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { BuilderMessage } from "akanjs/server";
import { IncrementalBuilderHost } from "../incrementalBuilder";
import { createTempApp, isolateEnv, tempRoots, writeText } from "../test/testHelpers";
import { AkanAppHost } from "./akanApp.host";
import type { DevHostEvent } from "./devHostPolicy";

describe("readProcessRssBytes", () => {
  test("reads this process's own rss", async () => {
    const rssBytes = await AkanAppHost.readProcessRssBytes(process.pid);
    if (rssBytes === null) throw new Error("expected to read this process's own rss");
    expect(rssBytes).toBeGreaterThan(1024 * 1024);
    expect(rssBytes).toBeLessThan(64 * 1024 * 1024 * 1024);
  });

  // The builder's own report triggers a recycle and this reading settles it, so the two must agree.
  test.skipIf(process.platform !== "darwin")("reads what the process reports once it frees memory", async () => {
    let held: number[][] | null = Array.from({ length: 64 }, (_, idx) => new Array<number>(500_000).fill(idx + 0.5));
    expect(held.length).toBe(64);
    held = null;
    Bun.gc(true);
    await Bun.sleep(500);
    const rssBytes = await AkanAppHost.readProcessRssBytes(process.pid);
    if (rssBytes === null) throw new Error("expected to read this process's own rss");
    expect(Math.abs(rssBytes - process.memoryUsage.rss())).toBeLessThan(64 * 1024 * 1024);
  });

  // A 0 would read as "settled below the ceiling" and cancel a recycle that should happen.
  test("returns null for a pid that does not exist", async () => {
    expect(await AkanAppHost.readProcessRssBytes(2_147_483_646)).toBeNull();
  });
});

describe("Redis tunnels during dev startup", () => {
  isolateEnv({ AKAN_PUBLIC_REPO_NAME: "repo", AKAN_PUBLIC_SERVE_DOMAIN: "localhost", AKAN_PUBLIC_ENV: "testing" });
  const track = tempRoots();

  test.each(["single", "multiple", "cluster", undefined, "local"] as const)(
    "%s mode preserves its Redis startup requirement",
    async (mode) => {
      const { root, app } = track(await createTempApp("demo"));
      await writeText(
        path.join(root, "apps/demo/main.ts"),
        'process.send?.({ type: "backend-ready", pid: process.pid });\nsetInterval(() => undefined, 1_000);\n',
      );
      const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
      const port = listener.port;
      listener.stop(true);
      process.env.SSH_TUNNEL_PORT = String(port);
      if (mode === "local") process.env.AKAN_PUBLIC_ENV = "local";
      const create = IncrementalBuilderHost.create;
      IncrementalBuilderHost.create = async () =>
        ({
          status: "ready",
          patcherOff: false,
          start: ({ onReady }: { onReady?: () => void }) => onReady?.(),
          send: () => true,
          stop: () => undefined,
        }) as unknown as IncrementalBuilderHost;
      const ready = Promise.withResolvers<void>();
      const env = { ...process.env } as Record<string, string>;
      delete env.AKAN_DATABASE_MODE;
      if (mode !== undefined && mode !== "local") env.AKAN_DATABASE_MODE = mode;
      const host = new AkanAppHost(app, {
        env,
        onDevEvent: (event) => {
          if ("state" in event && event.state === "ready") ready.resolve();
        },
      });
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        if (mode === "single" || mode === "local") {
          await host.start();
          await Promise.race([
            ready.promise,
            new Promise<never>((_, reject) => {
              deadline = setTimeout(() => reject(new Error("backend-ready IPC timed out")), 5_000);
            }),
          ]);
          expect(host.env.REDIS_HOST).toBe(mode === "local" ? "localhost" : "redis-tunnel-unavailable.invalid");
          if (mode === "single") expect(host.env.REDIS_HOST).not.toBe("localhost");
        } else {
          await expect(host.start()).rejects.toThrow(
            new RegExp(`redis.*demo-testing\\.localhost:${port}.*ECONNREFUSED`),
          );
        }
      } finally {
        clearTimeout(deadline);
        await host.stop();
        IncrementalBuilderHost.create = create;
      }
    },
  );
});

describe("a gateway whose replica crash-loops", () => {
  isolateEnv({ AKAN_PUBLIC_REPO_NAME: "repo", AKAN_PUBLIC_SERVE_DOMAIN: "localhost", AKAN_PUBLIC_ENV: "local" });
  const track = tempRoots();
  const crashLoop = "Backend replica 0/federation failed 3 consecutive boots; waiting for a code change to retry: boom";
  const readyBuilder = {
    status: "ready",
    patcherOff: false,
    start: ({ onReady }: { onReady?: () => void }) => onReady?.(),
    send: () => true,
    stop: () => undefined,
  } as unknown as IncrementalBuilderHost;

  test("fails the dev server at once, and leaves it running for the fix", async () => {
    const { root, app } = track(await createTempApp("demo"));
    await writeText(
      path.join(root, "apps/demo/main.ts"),
      [
        `process.send?.({ type: "build-status", data: { generation: -1, phase: "backend", ok: false, files: [], message: ${JSON.stringify(crashLoop)} } });`,
        "setInterval(() => undefined, 1_000);",
        "",
      ].join("\n"),
    );
    const create = IncrementalBuilderHost.create;
    IncrementalBuilderHost.create = async () => readyBuilder;
    const events: DevHostEvent[] = [];
    const failed = Promise.withResolvers<void>();
    const host = new AkanAppHost(app, {
      env: { ...process.env } as Record<string, string>,
      onDevEvent: (event) => {
        events.push(event);
        if ("state" in event && event.state === "failed") failed.resolve();
      },
    });
    let beforeStop: DevHostEvent[] = [];
    try {
      await host.start();
      await failed.promise;
      await Bun.sleep(300);
      beforeStop = [...events];
    } finally {
      await host.stop();
      IncrementalBuilderHost.create = create;
    }

    expect(beforeStop).toEqual([
      { app: "demo", state: "starting" },
      { app: "demo", state: "failed", detail: crashLoop },
    ]);
  });
});

describe("a builder request while no builder is running", () => {
  isolateEnv({ AKAN_PUBLIC_REPO_NAME: "repo", AKAN_PUBLIC_SERVE_DOMAIN: "localhost", AKAN_PUBLIC_ENV: "local" });
  const track = tempRoots();
  const stoppedBuilder = {
    status: "stopped",
    patcherOff: false,
    start: ({ onReady }: { onReady?: () => void }) => onReady?.(),
    send: () => false,
    stop: () => undefined,
  } as unknown as IncrementalBuilderHost;

  test("is answered at once and marked unavailable, so the backend can tell it from a failed build", async () => {
    const { root, app } = track(await createTempApp("demo"));
    const replyPath = path.join(root, "reply.json");
    await writeText(
      path.join(root, "apps/demo/main.ts"),
      [
        'import fs from "node:fs";',
        `const replyPath = ${JSON.stringify(replyPath)};`,
        'process.on("message", (message) => {',
        '  if (message?.type !== "build-graph-res") return;',
        '  fs.writeFileSync(replyPath + ".tmp", JSON.stringify(message));',
        '  fs.renameSync(replyPath + ".tmp", replyPath);',
        "});",
        'process.send?.({ type: "backend-ready", pid: process.pid });',
        'process.send?.({ type: "build-graph", id: 7 });',
        "setInterval(() => undefined, 1_000);",
        "",
      ].join("\n"),
    );
    const create = IncrementalBuilderHost.create;
    IncrementalBuilderHost.create = async () => stoppedBuilder;
    const host = new AkanAppHost(app, { env: { ...process.env } as Record<string, string> });
    try {
      await host.start();
      const deadline = performance.now() + 5_000;
      while (!(await Bun.file(replyPath).exists()) && performance.now() < deadline) await Bun.sleep(25);
      expect(await Bun.file(replyPath).json()).toEqual({
        type: "build-graph-res",
        id: 7,
        ok: false,
        error: "builder is stopped; reload after the builder is ready",
        kind: "unavailable",
      });
    } finally {
      await host.stop();
      IncrementalBuilderHost.create = create;
    }
  });
});

describe("the builder's answers and a returning builder", () => {
  isolateEnv({ AKAN_PUBLIC_REPO_NAME: "repo", AKAN_PUBLIC_SERVE_DOMAIN: "localhost", AKAN_PUBLIC_ENV: "local" });
  const track = tempRoots();
  const until = async (done: () => boolean | Promise<boolean>, timeoutMs = 10_000) => {
    const deadline = performance.now() + timeoutMs;
    while (!(await done()) && performance.now() < deadline) await Bun.sleep(25);
    expect(await done()).toBe(true);
  };
  const fakeBuilder = (sent: BuilderMessage[]) =>
    ({
      status: "ready",
      patcherOff: false,
      start: ({ onReady }: { onReady?: () => void }) => onReady?.(),
      send: (message: BuilderMessage) => {
        sent.push(message);
        return true;
      },
      stop: () => undefined,
    }) as unknown as IncrementalBuilderHost;

  test("a restarted backend never receives its predecessor's answer", async () => {
    const { root, app } = track(await createTempApp("demo"));
    const bootPath = path.join(root, "boot.txt");
    const repliesPath = path.join(root, "replies.txt");
    await writeText(
      path.join(root, "apps/demo/main.ts"),
      [
        'import fs from "node:fs";',
        `const bootPath = ${JSON.stringify(bootPath)};`,
        `const repliesPath = ${JSON.stringify(repliesPath)};`,
        'const boot = (fs.existsSync(bootPath) ? Number(fs.readFileSync(bootPath, "utf8")) : 0) + 1;',
        "fs.writeFileSync(bootPath, String(boot));",
        'process.on("message", (message) => {',
        '  if (message?.type === "build-graph-res") fs.appendFileSync(repliesPath, message.id + ":" + message.error + "\\n");',
        "});",
        'process.send?.({ type: "backend-ready", pid: process.pid });',
        'process.send?.({ type: "build-graph", id: 1 });',
        "if (boot === 1) setTimeout(() => process.exit(1), 100);",
        "setInterval(() => undefined, 1_000);",
        "",
      ].join("\n"),
    );
    const sent: BuilderMessage[] = [];
    let toHost: (message: BuilderMessage) => void = () => undefined;
    const create = IncrementalBuilderHost.create;
    IncrementalBuilderHost.create = (async (_app: unknown, _env: unknown, onMessage: typeof toHost) => {
      toHost = onMessage;
      return fakeBuilder(sent);
    }) as unknown as typeof IncrementalBuilderHost.create;
    const host = new AkanAppHost(app, { env: { ...process.env } as Record<string, string> });
    try {
      await host.start();
      await until(() => sent.length >= 2);
      const [stale, live] = sent as unknown as { id: number }[];
      toHost({
        type: "build-graph-res",
        id: stale.id,
        ok: false,
        error: "stale",
        kind: "unavailable",
      } as BuilderMessage);
      toHost({ type: "build-graph-res", id: live.id, ok: false, error: "live", kind: "unavailable" } as BuilderMessage);
      await until(() => Bun.file(repliesPath).exists());
      expect(await Bun.file(repliesPath).text()).toBe("1:live\n");
    } finally {
      await host.stop();
      IncrementalBuilderHost.create = create;
    }
  }, 20_000);

  test("a request that wakes an idle builder reaches it once the wake ends", async () => {
    process.env.AKAN_DEV_IDLE_SUSPEND_MS = "200";
    const { root, app } = track(await createTempApp("demo"));
    const triggerPath = path.join(root, "trigger.txt");
    await writeText(
      path.join(root, "apps/demo/main.ts"),
      [
        'import fs from "node:fs";',
        `const triggerPath = ${JSON.stringify(triggerPath)};`,
        'process.send?.({ type: "backend-ready", pid: process.pid });',
        "const poll = setInterval(() => {",
        "  if (!fs.existsSync(triggerPath)) return;",
        "  clearInterval(poll);",
        '  process.send?.({ type: "build-graph", id: 5 });',
        "}, 20);",
        "setInterval(() => undefined, 1_000);",
        "",
      ].join("\n"),
    );
    const sent: BuilderMessage[] = [];
    const create = IncrementalBuilderHost.create;
    IncrementalBuilderHost.create = async () => fakeBuilder(sent);
    const suspended = Promise.withResolvers<void>();
    const host = new AkanAppHost(app, {
      env: { ...process.env } as Record<string, string>,
      onDevEvent: (event) => {
        if ("state" in event && event.state === "suspended") suspended.resolve();
      },
    });
    try {
      await host.start();
      await suspended.promise;
      expect(sent.filter((message) => message.type === "build-graph")).toEqual([]);
      await writeText(triggerPath, "go");
      await until(() => sent.some((message) => message.type === "build-graph"));
    } finally {
      await host.stop();
      IncrementalBuilderHost.create = create;
    }
  }, 20_000);
});

describe("a stop while the builder is starting", () => {
  isolateEnv({ AKAN_PUBLIC_REPO_NAME: "repo", AKAN_PUBLIC_SERVE_DOMAIN: "localhost", AKAN_PUBLIC_ENV: "local" });
  const track = tempRoots();
  const fakeBuilder = (onStart: (options: { onReady?: () => void; onExit?: () => void }) => void = () => undefined) => {
    const builder = {
      status: "starting",
      patcherOff: false,
      started: 0,
      stopped: 0,
      start: (options: { onReady?: () => void; onExit?: () => void }) => {
        builder.started += 1;
        onStart(options);
      },
      send: () => false,
      stop: () => {
        builder.stopped += 1;
      },
    };
    return builder;
  };
  // Not `.rejects`: on a start that never settles it waits out three ready timeouts instead of failing the test.
  const settled = async (starting: Promise<unknown>) => {
    let timer: Timer | undefined;
    const pending = new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve("still starting"), 2_000);
    });
    const outcome = await Promise.race([
      starting.then(
        () => "started",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      ),
      pending,
    ]);
    clearTimeout(timer);
    return outcome;
  };

  test("stops a builder created after the stop, and never starts it", async () => {
    const { app } = track(await createTempApp("demo"));
    const builder = fakeBuilder();
    const created = Promise.withResolvers<IncrementalBuilderHost>();
    const create = IncrementalBuilderHost.create;
    let creates = 0;
    IncrementalBuilderHost.create = async () => {
      creates += 1;
      return await created.promise;
    };
    const host = new AkanAppHost(app, { env: { ...process.env } as Record<string, string> });
    try {
      const starting = host.start();
      await Bun.sleep(50);
      await host.stop();
      created.resolve(builder as unknown as IncrementalBuilderHost);
      expect(await settled(starting)).toBe("dev server stopped before the builder started");
      expect({ creates, started: builder.started, stopped: builder.stopped }).toEqual({
        creates: 1,
        started: 0,
        stopped: 1,
      });
    } finally {
      IncrementalBuilderHost.create = create;
    }
  });

  test("gives up a builder still booting at once instead of retrying after its ready timeout", async () => {
    const { app } = track(await createTempApp("demo"));
    let exitLate: (() => void) | undefined;
    const builder = fakeBuilder(({ onExit }) => {
      exitLate = onExit;
    });
    const create = IncrementalBuilderHost.create;
    let creates = 0;
    IncrementalBuilderHost.create = async () => {
      creates += 1;
      return builder as unknown as IncrementalBuilderHost;
    };
    const host = new AkanAppHost(app, { env: { ...process.env } as Record<string, string> });
    try {
      const starting = host.start();
      await Bun.sleep(50);
      expect(builder.started).toBe(1);
      await host.stop();
      expect(await settled(starting)).toBe("dev server stopped before the builder was ready");
      exitLate?.();
      await Bun.sleep(50);
      expect({ creates, stopped: builder.stopped }).toEqual({ creates: 1, stopped: 1 });
    } finally {
      IncrementalBuilderHost.create = create;
    }
  });
});
