import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AkanIpcMessage } from "akanjs/service";
import { AkanApp, type AkanAppOptions } from "./akanApp";
import type { BuilderMessage } from "./artifact";
import { LogControlSocket } from "./logging/logControlSocket";

type ChildMessage = AkanIpcMessage | BuilderMessage;

interface FakeChild {
  sent: ChildMessage[];
  say: (message: ChildMessage) => void;
}

interface ChildSpawnOptions {
  ipc: (message: unknown) => void;
}

const processEvents = ["message", "disconnect", "SIGINT", "SIGTERM"];
const processEmitter = process as NodeJS.EventEmitter;

const roots: string[] = [];
const gateways: { app: AkanApp; running: Promise<void> }[] = [];
const restores: (() => void)[] = [];
let listenersBefore = new Map<string, unknown[]>();
let hostInbox: unknown[] = [];
let exitCodes: (number | undefined)[] = [];

beforeEach(() => {
  listenersBefore = new Map(processEvents.map((event) => [event, processEmitter.listeners(event)]));
  hostInbox = [];
  exitCodes = [];
  const exit = spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitCodes.push(code);
  }) as unknown as typeof process.exit);
  const send = process.send;
  process.send = (message: unknown) => {
    hostInbox.push(message);
    return true;
  };
  const timers: Timer[] = [];
  const setTimer = globalThis.setTimeout;
  const scheduled = spyOn(globalThis, "setTimeout").mockImplementation(((
    run: () => void,
    ms?: number,
    ...args: unknown[]
  ) => {
    const timer = setTimer(run, ms, ...args);
    timers.push(timer);
    return timer;
  }) as unknown as typeof setTimeout);
  restores.push(
    () => exit.mockRestore(),
    () => {
      process.send = send;
    },
    //? A host disconnect arms a real `process.exit(1)` that outlives its test and would end the runner mid-file.
    () => {
      scheduled.mockRestore();
      for (const timer of timers) clearTimeout(timer);
    },
  );
});

//? A signal's stop calls `process.exit` when it ends, so the stub stays until every running gateway has returned.
afterEach(async () => {
  try {
    for (const { app, running } of gateways.splice(0)) {
      await app.stop();
      await running.catch(() => undefined);
    }
  } finally {
    for (const restore of restores.splice(0)) restore();
    for (const event of processEvents) {
      const before = listenersBefore.get(event) ?? [];
      for (const listener of processEmitter.listeners(event))
        if (!before.includes(listener)) processEmitter.removeListener(event, listener as (...args: unknown[]) => void);
    }
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  }
});

const fakeChildren = (count: number) => {
  const children: FakeChild[] = [];
  const allSpawned = Promise.withResolvers<FakeChild[]>();
  const spawn = Bun.spawn;
  const spawned = spyOn(Bun, "spawn").mockImplementation(((cmd: string[], options: ChildSpawnOptions) => {
    if (cmd[0] !== "bun" || cmd[1] !== "-e") return spawn(cmd, options as Parameters<typeof Bun.spawn>[1]);
    const exit = Promise.withResolvers<number>();
    const output = () =>
      new ReadableStream<Uint8Array>({ start: (controller) => void exit.promise.then(() => controller.close()) });
    const child: FakeChild = { sent: [], say: (message) => options.ipc(message) };
    const proc = {
      pid: 4_000_000 + children.length,
      killed: false,
      exited: exit.promise,
      stdout: output(),
      stderr: output(),
      send: (message: ChildMessage) => {
        child.sent.push(message);
        if (message.type === "shutdown") exit.resolve(0);
      },
      kill: () => {
        proc.killed = true;
        exit.resolve(137);
      },
    };
    children.push(child);
    if (children.length === count) allSpawned.resolve(children);
    return proc;
  }) as unknown as typeof Bun.spawn);
  restores.push(() => spawned.mockRestore());
  return allSpawned.promise;
};

//? `start()` registers its process handlers in the same tick as the last spawn, so they exist once every child has.
const startGateway = async (options: AkanAppOptions & { replica: number | string }) => {
  const root = await mkdtemp(path.join(tmpdir(), "akan-app-process-"));
  roots.push(root);
  const runtimeDir = path.join(root, "runtime");
  const total = String(options.replica)
    .split(",")
    .reduce((sum, count) => sum + Number(count || 0), 0);
  const spawned = fakeChildren(total);
  const app = new AkanApp(path.join(root, "server.ts"), { runtimeDir, port: 0, ...options });
  const running = app.start();
  gateways.push({ app, running });
  const children = await Promise.race([spawned, running.then(() => [] as FakeChild[])]);
  expect(children).toHaveLength(total);
  return { app, running, children, runtimeDir };
};

const settles = async (promise: Promise<unknown>, timeoutMs = 2_000) => {
  let timer: Timer | undefined;
  const timedOut = new Promise<"running">((resolve) => {
    timer = setTimeout(() => resolve("running"), timeoutMs);
  });
  const outcome = await Promise.race([promise.then(() => "stopped" as const), timedOut]);
  clearTimeout(timer);
  return outcome;
};

test.each(["SIGTERM", "SIGINT"] as const)("a %s shuts every replica down, then exits 0", async (signal) => {
  const { running, children } = await startGateway({ replica: 2 });

  process.emit(signal, signal);

  expect(await settles(running)).toBe("stopped");
  for (const child of children) expect(child.sent).toContainEqual({ type: "shutdown", signal });
  expect(exitCodes).toEqual([0]);
});

test("a second signal during the shutdown exits 1 at once", async () => {
  const { running } = await startGateway({ replica: 1 });

  process.emit("SIGTERM", "SIGTERM");
  process.emit("SIGTERM", "SIGTERM");

  expect(exitCodes).toEqual([1]);
  expect(await settles(running)).toBe("stopped");
  expect(exitCodes).toEqual([1, 0]);
});

test("a stop closes the log control socket, which `akan logs` would otherwise still reach", async () => {
  const { app, runtimeDir } = await startGateway({ replica: 1 });
  expect(await readdir(runtimeDir)).toContain(LogControlSocket.fileName);

  await app.stop();

  expect(await readdir(runtimeDir)).not.toContain(LogControlSocket.fileName);
});

test("a queued job wakes the batch replicas, and no traffic replica", async () => {
  const [federation, batch] = (await startGateway({ replica: "1,1,0" })).children;

  federation.say({ type: "queue.enqueued", queue: "mail", name: "send", jobId: "job-1" });

  expect(batch.sent).toEqual([{ type: "queue.wake", queue: "mail", name: "send" }]);
  expect(federation.sent).toEqual([]);
});

test("relays each replica's builder request to the host, and the answer back to the replica that asked", async () => {
  const [first, second] = (await startGateway({ replica: 2 })).children;

  first.say({ type: "build-graph", id: 1 });
  second.say({ type: "build-route", id: 1, routeId: "/", seeds: [], knownEntries: [] });

  const [toFirst, toSecond] = hostInbox as (BuilderMessage & { id: number })[];
  expect(toFirst).toEqual({ type: "build-graph", id: toFirst.id });
  expect(toSecond).toEqual({ type: "build-route", id: toSecond.id, routeId: "/", seeds: [], knownEntries: [] });
  expect(toFirst.id).not.toBe(toSecond.id);

  process.emit("message", { type: "build-route-res", id: toSecond.id, ok: false, error: "second" }, undefined);
  process.emit("message", { type: "build-graph-res", id: toFirst.id, ok: false, error: "first" }, undefined);

  expect(first.sent).toEqual([{ type: "build-graph-res", id: 1, ok: false, error: "first" }]);
  expect(second.sent).toEqual([{ type: "build-route-res", id: 1, ok: false, error: "second" }]);
});

test("hands every builder event from the host to the traffic replicas, and none to a batch replica", async () => {
  const [federation, batch] = (await startGateway({ replica: "1,1,0" })).children;
  const events = [
    { type: "builder-ready" },
    { type: "invalidate", kinds: ["code"], files: ["/app/lib/a.ts"] },
    { type: "css-updated", data: { generation: 1 } },
    { type: "pages-updated", data: { bundlePath: "/app/pages.js", buildId: 1 } },
    { type: "csr-updated", data: { generation: 1, mode: "registry", reload: false } },
    { type: "ssr-updated", data: { generation: 1, reload: false } },
    { type: "build-status", data: { generation: 1, phase: "pages", ok: true, files: [] } },
  ];

  for (const event of events) process.emit("message", event, undefined);

  expect(federation.sent).toEqual(events as ChildMessage[]);
  expect(batch.sent).toEqual([]);
});

test("shuts down once the host's IPC channel closes, so a killed dev host strands no replica", async () => {
  const { running, children } = await startGateway({ replica: 1 });

  process.emit("disconnect");

  expect(await settles(running)).toBe("stopped");
  expect(children[0].sent).toContainEqual({ type: "shutdown", signal: "ipc-disconnect" });
  expect(exitCodes).toEqual([0]);
});
