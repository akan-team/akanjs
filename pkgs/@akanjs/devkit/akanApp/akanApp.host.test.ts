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

  // A 0 would read as "settled below the ceiling" and cancel a recycle that should happen.
  test("returns null for a pid that does not exist", async () => {
    expect(await AkanAppHost.readProcessRssBytes(2_147_483_646)).toBeNull();
  });
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
