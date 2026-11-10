import { afterEach, expect, mock, spyOn, test } from "bun:test";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const actualFs = { ...fsPromises };
let holdNextSocketRemoval: PromiseWithResolvers<void> | null = null;
const socketRemovalHeld = Promise.withResolvers<void>();
//? A respawn's only await is this `rm`; holding it is the one way to land a stop inside that window.
mock.module("node:fs/promises", () => ({
  ...actualFs,
  rm: async (target: string, options?: Parameters<typeof fsPromises.rm>[1]) => {
    const hold = holdNextSocketRemoval;
    if (hold && /akan-child-.*\.sock$/.test(path.basename(target))) {
      holdNextSocketRemoval = null;
      socketRemovalHeld.resolve();
      await hold.promise;
    }
    return await actualFs.rm(target, options);
  },
}));
const { AkanApp } = await import("./akanApp");

const roots: string[] = [];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => actualFs.rm(root, { recursive: true, force: true })));
});

test("a stop that lands while a crashed replica's socket is removed leaves the replica down", async () => {
  const root = await actualFs.mkdtemp(path.join(tmpdir(), "akan-app-respawn-"));
  roots.push(root);
  const serverPath = path.join(root, "server.ts");
  const counterPath = path.join(root, "boots.txt");
  await Bun.write(
    serverPath,
    `
      const counterPath = ${JSON.stringify(counterPath)};
      export const server = {
        async start() {
          const file = Bun.file(counterPath);
          const boot = (await file.exists() ? Number(await file.text()) : 0) + 1;
          await Bun.write(counterPath, String(boot));
          const http = Bun.serve({ unix: process.env.AKAN_CHILD_SOCKET, fetch: () => new Response("ok") });
          process.on("message", (message) => {
            if (message?.type === "health.ping")
              process.send?.({ type: "health.pong", nonce: message.nonce, sentAt: message.sentAt, pid: process.pid });
            if (message?.type === "shutdown") {
              http.stop(true);
              process.exit(0);
            }
          });
          process.send?.({
            type: "ready",
            pid: process.pid,
            replicaIdx: Number(process.env.AKAN_REPLICA_IDX ?? 0),
            role: process.env.SERVER_MODE ?? "all",
            upstream: { type: "unix", socketPath: process.env.AKAN_CHILD_SOCKET },
            healthPath: "/_akan/app/child-health",
          });
          if (boot === 1) setTimeout(() => process.exit(1), 50);
        },
      };
    `,
  );
  const hold = Promise.withResolvers<void>();
  holdNextSocketRemoval = hold;
  const spawn = Bun.spawn;
  const children: Bun.Subprocess[] = [];
  const spawned = spyOn(Bun, "spawn").mockImplementation(((...args: Parameters<typeof Bun.spawn>) => {
    const child = spawn(...args);
    children.push(child);
    return child;
  }) as typeof Bun.spawn);
  const app = new AkanApp(serverPath, {
    replica: 1,
    runtimeDir: path.join(root, "runtime"),
    port: 24_000 + Math.floor(Math.random() * 10_000),
  });
  const running = app.start();
  try {
    await Promise.race([
      socketRemovalHeld.promise,
      wait(5_000).then(() => {
        throw new Error("the crashed replica was never respawned");
      }),
    ]);
    const spawnsBeforeStop = children.length;
    await app.stop();
    hold.resolve();
    await wait(100);
    expect(children.length).toBe(spawnsBeforeStop);
  } finally {
    hold.resolve();
    await app.stop();
    await Promise.race([running, wait(1_000)]);
    spawned.mockRestore();
    for (const child of children) if (child.exitCode === null) child.kill("SIGKILL");
  }
});
