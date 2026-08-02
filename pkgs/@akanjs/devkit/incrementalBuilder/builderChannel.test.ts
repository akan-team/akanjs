import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BuilderChannel } from "./builderChannel";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

type SendMode = "drain" | "await" | "bare";

/**
 * Run a child that sends what the builder sends and then exits the way the recycle drain does, and
 * report what the parent actually received.
 *
 * `payload` picks the message shape, because shape decides whether a bare send survives: `manifest` is a
 * map of many short strings (a `build-route-res` delta), `css` is one long string (a base64 stylesheet).
 */
const sendThenExit = async (
  bytes: number,
  { mode, payload }: { mode: SendMode; payload: "manifest" | "css" },
): Promise<Array<{ type?: string }>> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "builder-channel-"));
  tempDirs.push(dir);
  const entry = path.join(dir, "child.ts");
  const modulePath = JSON.stringify(path.join(import.meta.dir, "builderChannel"));
  const build =
    payload === "manifest"
      ? [
          'const chunk = "x".repeat(200);',
          "const moduleMap: Record<string, string> = {};",
          `for (let i = 0; i * 210 < ${bytes}; i++) moduleMap["chunk-" + i] = chunk;`,
          'const msg = { type: "build-route-res", id: 7, ok: true, data: { ssrManifestDelta: moduleMap } };',
        ]
      : [
          `const css = "y".repeat(${bytes});`,
          'const msg = { type: "css-updated", data: { cssAssets: {}, cssBase64ByUrl: { "/a.css": css } } };',
        ];
  const sendLine = {
    drain: "BuilderChannel.emit(msg as never);\nawait BuilderChannel.drain();",
    await: "await BuilderChannel.send(msg as never);",
    bare: "process.send?.(msg);",
  }[mode];
  await Bun.write(
    entry,
    [`import { BuilderChannel } from ${modulePath};`, ...build, sendLine, "process.exit(0);"].join("\n"),
  );
  const received: Array<{ type?: string }> = [];
  const proc = Bun.spawn(["bun", entry], {
    stdio: ["ignore", "inherit", "inherit"],
    // The mode the dev host actually spawns the builder with; it changes where the loss cliff sits.
    serialization: "advanced",
    ipc: (message) => {
      received.push(message as { type?: string });
    },
  });
  await proc.exited;
  // Messages land before the exit callback, never after, but leave room for a straggler to prove it.
  await Bun.sleep(50);
  return received;
};

describe("BuilderChannel", () => {
  test("delivers a reply too large for the pipe buffer before the process exits", async () => {
    expect(await sendThenExit(1_000_000, { mode: "await", payload: "manifest" })).toMatchObject([{ id: 7 }]);
    // A manifest delta is usually well past the buffer, but the small case must keep working too.
    expect(await sendThenExit(0, { mode: "await", payload: "manifest" })).toMatchObject([{ id: 7 }]);
  });

  test("a drained event survives the exit even though nobody awaited it", async () => {
    // The event path: `css-updated` is relayed with no caller to await it, and the recycle drain exits
    // milliseconds later. Only `drain()` stands between the two.
    expect(await sendThenExit(200_000, { mode: "drain", payload: "css" })).toMatchObject([{ type: "css-updated" }]);
  });

  /**
   * darwin only, measured: on Linux a 1MB message sent immediately before `process.exit` **arrives in
   * full**, so the loss this control demonstrates does not reproduce there and the assertion would fail
   * for the right reason on the wrong platform. `BuilderChannel` itself stays correct and costs nothing
   * on Linux — the bug it prevents is one macOS developers hit and a Linux fleet does not.
   */
  test.skipIf(process.platform !== "darwin")(
    "without the flush wait the same messages are lost, which is why this class exists",
    async () => {
      // Controls, not requirements: if a future bun flushes ipc writes on exit, these fail and say so.
      expect(await sendThenExit(1_000_000, { mode: "bare", payload: "manifest" })).toEqual([]);
      // 20KB of css, far below the 64KB the manifest shape survives — one long string dies much earlier,
      // so no size threshold would have been safe to special-case.
      expect(await sendThenExit(20_000, { mode: "bare", payload: "css" })).toEqual([]);
    },
  );

  test("drain resolves only once every tracked send has flushed", async () => {
    const send = process.send;
    const flushes: Array<() => void> = [];
    try {
      (process as { send?: unknown }).send = (_msg: unknown, _h: unknown, _o: unknown, cb: () => void) => {
        flushes.push(cb);
        return true;
      };
      BuilderChannel.emit({ type: "builder-ready" });
      BuilderChannel.emit({ type: "builder-ready" });
      let drained = false;
      const draining = BuilderChannel.drain().then((count) => {
        drained = true;
        return count;
      });
      flushes[0]?.();
      await Bun.sleep(1);
      expect(drained).toBe(false);
      flushes[1]?.();
      expect(await draining).toBe(2);
    } finally {
      (process as { send?: unknown }).send = send;
    }
  });

  test("a send started while draining is drained too", async () => {
    const send = process.send;
    const flushes: Array<() => void> = [];
    try {
      (process as { send?: unknown }).send = (_msg: unknown, _h: unknown, _o: unknown, cb: () => void) => {
        flushes.push(cb);
        return true;
      };
      BuilderChannel.emit({ type: "builder-ready" });
      const draining = BuilderChannel.drain();
      // What `#reportMetrics` does from a work item's `finally`, after the drain has begun.
      BuilderChannel.emit({ type: "builder-metrics", data: { rssBytes: 1, generation: 1, workCount: 1 } });
      for (let i = 0; i < 4 && flushes.length; i++) {
        flushes.shift()?.();
        await Bun.sleep(1);
      }
      expect(await draining).toBe(2);
    } finally {
      (process as { send?: unknown }).send = send;
    }
  });

  test("resolves instead of hanging when there is no ipc channel", async () => {
    const send = process.send;
    try {
      (process as { send?: typeof process.send }).send = undefined;
      await BuilderChannel.send({ type: "build-csr-res", id: 1, ok: true });
      expect(await BuilderChannel.drain()).toBe(0);
    } finally {
      (process as { send?: typeof process.send }).send = send;
    }
  });
});
