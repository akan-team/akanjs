import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { ConformanceEnv } from "../test/conformance";

// Two processes of one app on shared storage — what multiple and cluster mode are for — each serving its own
// sockets. Ids are from `local/database-modes/03-single-instance-assumptions.md`.

interface Instance {
  port: number;
  stop: () => Promise<void>;
}

interface Received {
  type: string;
  roomId?: string;
  data?: { op?: string; id?: string };
}

const instanceEntry = path.join(import.meta.dir, "multiInstance.instance.ts");

const freePort = () => {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const { port } = probe;
  void probe.stop(true);
  return port as number;
};

const startInstance = async (logPath: string, env: Record<string, string>): Promise<Instance> => {
  const port = freePort();
  const child = Bun.spawn(["bun", instanceEntry], {
    cwd: path.join(import.meta.dir, ".."),
    env: { ...ConformanceEnv.isolatedProcessEnv(), ...env, PORT: String(port) },
    // A pipe nobody drains fills up and stops the child mid-boot; a file does not.
    stdout: Bun.file(logPath),
    stderr: Bun.file(logPath),
  });
  const deadline = Date.now() + 45_000;
  while (
    !(
      await Bun.file(logPath)
        .text()
        .catch(() => "")
    ).includes("ready")
  ) {
    if (Date.now() > deadline || child.exitCode !== null)
      throw new Error(`instance on ${port} did not start:\n${(await Bun.file(logPath).text()).slice(-2000)}`);
    await Bun.sleep(100);
  }
  return {
    port,
    stop: async () => {
      child.kill();
      await child.exited;
    },
  };
};

const call = async (instance: Instance, route: string, body: object) => {
  const response = await fetch(`http://localhost:${instance.port}/api/crossItem/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${route} answered ${response.status}: ${await response.text()}`);
  return (await response.json()) as { id: string };
};

const subscribe = async (instance: Instance, key: string, args: unknown[]) => {
  const socket = new WebSocket(`ws://localhost:${instance.port}/api/ws`);
  const received: Received[] = [];
  socket.addEventListener("message", (event) => received.push(JSON.parse(String(event.data)) as Received));
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });
  socket.send(JSON.stringify({ key, data: args, subscribe: true }));
  const next = async (type: string, timeoutMs = 5_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = received.findIndex((message) => message.type === type);
      if (found >= 0) return received.splice(found, 1)[0];
      await Bun.sleep(20);
    }
    return null;
  };
  await next("sub");
  return { next, close: () => socket.close() };
};

const modes = [
  ...(ConformanceEnv.has("multi-instance", "redis") ? (["multiple"] as const) : []),
  ...(ConformanceEnv.has("multi-instance", "redis") && ConformanceEnv.has("multi-instance", "postgres")
    ? (["cluster"] as const)
    : []),
];

for (const mode of modes)
  describe(`two instances of one app (${mode})`, () => {
    const instances: Instance[] = [];
    const cleanups: (() => Promise<void>)[] = [];

    beforeAll(async () => {
      const { dir, remove } = await ConformanceEnv.tempDir("akan-multi-instance");
      cleanups.push(remove);
      const storage: Record<string, unknown> = {
        workspaceRoot: dir,
        solid: { filePath: path.join(dir, "solid.db") },
        database: { sqlite: { filePath: path.join(dir, "shared.db"), journalMode: "WAL", busyTimeoutMs: 5000 } },
      };
      if (mode === "cluster") {
        const { url, drop } = await ConformanceEnv.postgresSchema("akan_multi");
        cleanups.push(drop);
        storage.database = { postgres: { url } };
      }
      // A repository name of its own keeps these instances' Redis channel and keys apart from any other run's.
      const repoName = ConformanceEnv.uniqueName("multi").toLowerCase();
      const env = {
        AKAN_TEST_INSTANCE_ENV: JSON.stringify(storage),
        AKAN_PUBLIC_APP_NAME: "crossTest",
        AKAN_PUBLIC_REPO_NAME: repoName,
        AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
        AKAN_PUBLIC_ENV: "testing",
        AKAN_PUBLIC_OPERATION_MODE: "local",
        AKAN_DATABASE_MODE: mode,
        REDIS_URI: ConformanceEnv.url("redis") as string,
        SERVER_MODE: "all",
        NODE_ENV: "test",
      };
      // One after the other: the second finds the schema the first created, as a scaled-out deployment does.
      for (const name of ["a", "b"]) instances.push(await startInstance(path.join(dir, `${name}.log`), env));
      cleanups.push(async () => {
        const { Redis } = await import("ioredis");
        const redis = new Redis(ConformanceEnv.url("redis") as string);
        const keys = await redis.keys(`${repoName}:*`);
        if (keys.length) await redis.del(...keys);
        redis.disconnect();
      });
    }, 120_000);

    afterAll(async () => {
      for (const instance of instances.splice(0)) await instance.stop();
      for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    });

    test("[L-1] a write on one instance reaches a live list held on another", async () => {
      const [holder, writer] = instances;
      const list = await subscribe(holder, "crossItemLiveInCategory", ["news"]);
      try {
        const created = await call(writer, "createCrossItem", { data: { title: "Scoop", category: "news", score: 1 } });
        expect(await list.next("pub")).toMatchObject({
          roomId: "crossItemLiveInCategory-news",
          data: { op: "enter", id: created.id },
        });
        await call(writer, `updateCrossItem/${created.id}`, {
          data: { title: "Scoop", category: "sports", score: 1 },
        });
        expect(await list.next("pub")).toMatchObject({ data: { op: "leave", id: created.id } });
      } finally {
        list.close();
      }
    });
  });
