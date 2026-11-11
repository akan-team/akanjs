import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs } from "../test/testHelpers";
import { BuilderChannel } from "./builderChannel";

const tempDir = tempDirs("builder-channel-");

type SendMode = "drain" | "await" | "bare";

// Shape decides whether a bare send survives: `manifest` is many short strings, `css` one long string.
const sendThenExit = async (
  bytes: number,
  { mode, payload }: { mode: SendMode; payload: "manifest" | "css" },
): Promise<Array<{ type?: string }>> => {
  const dir = await tempDir();
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

const withDeferredFlushes = async (fn: (flushes: Array<() => void>) => Promise<void>) => {
  const send = process.send;
  const flushes: Array<() => void> = [];
  try {
    (process as { send?: unknown }).send = (_msg: unknown, _h: unknown, _o: unknown, cb: () => void) => {
      flushes.push(cb);
      return true;
    };
    await fn(flushes);
  } finally {
    (process as { send?: unknown }).send = send;
  }
};

describe("BuilderChannel", () => {
  test("delivers a reply too large for the pipe buffer before the process exits", async () => {
    expect(await sendThenExit(1_000_000, { mode: "await", payload: "manifest" })).toMatchObject([{ id: 7 }]);
    expect(await sendThenExit(0, { mode: "await", payload: "manifest" })).toMatchObject([{ id: 7 }]);
  });

  test("a drained event survives the exit even though nobody awaited it", async () => {
    expect(await sendThenExit(200_000, { mode: "drain", payload: "css" })).toMatchObject([{ type: "css-updated" }]);
  });

  // darwin only: on Linux a message sent right before `process.exit` arrives in full, so the loss does not reproduce.
  test.skipIf(process.platform !== "darwin")(
    "without the flush wait the same messages are lost, which is why this class exists",
    async () => {
      // Controls, not requirements: if a future bun flushes ipc writes on exit, these fail and say so.
      expect(await sendThenExit(1_000_000, { mode: "bare", payload: "manifest" })).toEqual([]);
      expect(await sendThenExit(20_000, { mode: "bare", payload: "css" })).toEqual([]);
    },
  );

  test("drain resolves only once every tracked send has flushed", async () => {
    await withDeferredFlushes(async (flushes) => {
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
    });
  });

  test("a send started while draining is drained too", async () => {
    await withDeferredFlushes(async (flushes) => {
      BuilderChannel.emit({ type: "builder-ready" });
      const draining = BuilderChannel.drain();
      BuilderChannel.emit({ type: "builder-metrics", data: { rssBytes: 1, generation: 1, workCount: 1 } });
      for (let i = 0; i < 4 && flushes.length; i++) {
        flushes.shift()?.();
        await Bun.sleep(1);
      }
      expect(await draining).toBe(2);
    });
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
