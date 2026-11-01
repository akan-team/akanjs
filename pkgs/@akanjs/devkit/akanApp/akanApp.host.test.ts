import { describe, expect, test } from "bun:test";
import path from "node:path";
import { IncrementalBuilderHost } from "../incrementalBuilder";
import { createTempApp, isolateEnv, tempRoots, writeText } from "../testHelpers";
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
