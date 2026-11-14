import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AkanIpcMessage } from "akanjs/service";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const pongOf = async (webRouter: string) => {
  const root = await mkdtemp(path.join(tmpdir(), "akan-parent-channel-"));
  roots.push(root);
  const script = path.join(root, "replica.ts");
  await Bun.write(
    script,
    `
      import { ParentChannel } from ${JSON.stringify(path.join(import.meta.dir, "parentChannel.ts"))};
      const owner = { logger: { warn() {} }, shutdownTimeoutMs: 1000, stop: async () => {} };
      new ParentChannel(owner, { setMinSev() {} }, () => ${webRouter}).register();
      process.send?.({ type: "hello" });
      setTimeout(() => process.exit(0), 5000);
    `,
  );
  const { promise, resolve } = Promise.withResolvers<Extract<AkanIpcMessage, { type: "health.pong" }>>();
  const proc = Bun.spawn(["bun", script], {
    stdio: ["ignore", "ignore", "inherit"],
    ipc: (message: { type: string }) => {
      if (message.type === "hello") proc.send({ type: "health.ping", nonce: "n1", sentAt: 1 });
      if (message.type === "health.pong") resolve(message as Extract<AkanIpcMessage, { type: "health.pong" }>);
    },
  });
  try {
    return await promise;
  } finally {
    proc.kill();
    await proc.exited;
  }
};

describe("ParentChannel", () => {
  test("answers a health ping with its RSC worker's state, and null when it renders no pages", async () => {
    expect(await pongOf(`({ rscWorkerStatus: "restarting" })`)).toMatchObject({
      type: "health.pong",
      nonce: "n1",
      sentAt: 1,
      rscWorker: "restarting",
    });
    expect((await pongOf("null")).rscWorker).toBeNull();
  }, 15_000);
});
