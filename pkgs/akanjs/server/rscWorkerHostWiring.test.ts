import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Logger, type LogRecord } from "akanjs/common";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";

const workerSource = `import fs from "node:fs";
const dir = process.env.AKAN_TEST_RSC_DIR ?? "";
const mark = (kind) => {
  try {
    fs.writeFileSync(dir + "/" + kind + "/" + process.pid, "");
  } catch {}
};
process.on("disconnect", () => process.exit(0));
process.on("exit", () => mark("exited"));
process.on("SIGTERM", () => {
  mark("killed");
  process.exit(0);
});
mark("spawned");
process.on("message", (message) => {
  if (message.type === "init") {
    if (fs.existsSync(dir + "/hold")) return;
    if (process.env.AKAN_TEST_RSC_SAY) console.log(process.env.AKAN_TEST_RSC_SAY);
    process.send?.({ type: "ready" });
    return;
  }
  if (message.type === "render") {
    const url = new URL(message.url);
    if (url.pathname === "/metrics") {
      process.send?.({ type: "not-found", requestId: message.requestId });
      const renders = Number(url.searchParams.get("renders"));
      process.send?.({ type: "metrics", metrics: { rssBytes: 4242, rscRenderCount: renders } });
      return;
    }
    process.send?.({ type: "meta", requestId: message.requestId });
    const chunks = Number(url.searchParams.get("chunks") ?? "1");
    for (let i = 0; i < chunks; i += 1)
      process.send?.({ type: "chunk", requestId: message.requestId, data: new Uint8Array([i % 256]) });
    return;
  }
  process.send?.({ type: "log.records", records: [{ message: JSON.stringify(message) }] });
});
process.send?.({ type: "hello" });
`;

const env = {
  AKAN_RSC_WORKER_PATH: undefined as string | undefined,
  AKAN_TEST_RSC_DIR: undefined as string | undefined,
  AKAN_RSC_HOST_MAX_PENDING_CHUNKS: undefined as string | undefined,
  AKAN_RSC_WORKER_MAX_RENDER_COUNT: undefined as string | undefined,
  AKAN_TEST_RSC_SAY: undefined as string | undefined,
};
type EnvKey = keyof typeof env;
const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]])) as typeof env;
const savedFormat = Logger.format;
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  for (const key of Object.keys(env) as EnvKey[]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  Logger.format = savedFormat;
});

const until = async (condition: () => boolean, what: string) => {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(20);
  }
};

const startWorker = async (overrides: Partial<Record<EnvKey, string>> = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akan-rsc-wiring-"));
  for (const kind of ["spawned", "exited", "killed"]) fs.mkdirSync(path.join(dir, kind));
  fs.writeFileSync(path.join(dir, "worker.ts"), workerSource);
  process.env.AKAN_RSC_WORKER_PATH = path.join(dir, "worker.ts");
  process.env.AKAN_TEST_RSC_DIR = dir;
  for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
  const rsc = new RscWorker({
    pagesBundlePath: path.join(dir, "pages.js"),
    pagesBundleBuildId: 1,
  } as unknown as BaseBuildArtifact);
  const records: LogRecord[] = [];
  rsc.onLogRecords = (next) => records.push(...next);
  cleanups.push(async () => {
    rsc.kill();
    const exited = () =>
      fs.readdirSync(path.join(dir, "spawned")).every((pid) => fs.existsSync(path.join(dir, "exited", pid)));
    await until(exited, "the stub workers' exit").finally(() => fs.rmSync(dir, { recursive: true, force: true }));
  });
  await rsc.ready;
  const echoed = () =>
    records.flatMap((record) => (record.message.startsWith("{") ? [JSON.parse(record.message)] : []));
  return { rsc, dir, records, echoed };
};

describe("RscWorker collaborator wiring", () => {
  test("a render its reader cancels sends the worker a cancel for that request", async () => {
    const { rsc, echoed } = await startWorker();
    const result = await rsc.renderWithMeta(new Request("http://localhost/x"));
    if (result.type !== "stream") throw new Error(`expected a stream, got ${result.type}`);
    await result.stream.cancel();

    await until(() => echoed().some((message) => message.type === "cancel"), "the cancel");
    expect(echoed().filter((message) => message.type === "cancel")).toHaveLength(1);
    expect(rsc.getMetrics().rscPendingRenderCount).toBe(0);
  }, 20_000);

  test("a render past the host's chunk cap counts in the overflow metric and cancels the worker's render", async () => {
    const { rsc, echoed } = await startWorker({ AKAN_RSC_HOST_MAX_PENDING_CHUNKS: "2" });
    const result = await rsc.renderWithMeta(new Request("http://localhost/x?chunks=8"));
    expect(result.type).toBe("stream");

    await until(() => rsc.getMetrics().rscHostPendingChunkOverflowCount === 1, "the overflow count");
    await until(() => echoed().some((message) => message.type === "cancel"), "the cancel");
  }, 20_000);

  test("a cache invalidation reaches the worker", async () => {
    const { rsc, echoed } = await startWorker();
    rsc.invalidateRouteResultCache({ reason: "test", tags: ["post"] });

    await until(() => echoed().some((message) => message.type === "invalidate-cache"), "the invalidation");
    expect(echoed().find((message) => message.type === "invalidate-cache")).toEqual({
      type: "invalidate-cache",
      reason: "test",
      tags: ["post"],
    });
  }, 20_000);

  test("the worker's metrics show under rscWorker* names, and a render count at its cap recycles the worker", async () => {
    const { rsc } = await startWorker({ AKAN_RSC_WORKER_MAX_RENDER_COUNT: "5" });
    const firstPid = rsc.getMetrics().rscWorkerPid;
    expect((await rsc.renderWithMeta(new Request("http://localhost/metrics?renders=4"))).type).toBe("not-found");
    await until(() => rsc.getMetrics().rscRenderCount === 4, "the metrics sample");
    expect(rsc.getMetrics()).toMatchObject({ rscWorkerRssBytes: 4242, rscWorkerRecycleCount: 0 });

    expect((await rsc.renderWithMeta(new Request("http://localhost/metrics?renders=5"))).type).toBe("not-found");
    await until(() => rsc.getMetrics().rscWorkerRecycleCount === 1, "the recycle");
    expect(rsc.getMetrics().rscWorkerLastRecycleReason).toBe("renderCount>5");
    await until(() => rsc.status === "ready" && rsc.getMetrics().rscWorkerPid !== firstPid, "the replacement");
  }, 20_000);

  test("kill() during a rolling recycle also stops the worker being replaced", async () => {
    const { rsc, dir } = await startWorker();
    const oldPid = rsc.getMetrics().rscWorkerPid;
    fs.writeFileSync(path.join(dir, "hold"), "");
    expect(rsc.restartWhenIdle("test")).toBe(true);
    await until(() => rsc.getMetrics().rscWorkerPid !== oldPid, "the replacement");
    rsc.kill();

    await until(() => fs.existsSync(path.join(dir, "killed", String(oldPid))), "the replaced worker's kill");
  }, 20_000);

  test("a worker's stdout reaches onLogRecords under ndjson", async () => {
    Logger.format = "ndjson";
    const { records } = await startWorker({ AKAN_TEST_RSC_SAY: "worker booted" });

    await until(() => records.some((record) => record.message === "worker booted"), "the worker's stdout line");
    expect(records.find((record) => record.message === "worker booted")).toMatchObject({
      stream: "stdout",
      role: "rsc-worker",
    });
  }, 20_000);

  test("an artifact that fails to read throws before any worker is spawned", () => {
    const spawn = spyOn(Bun, "spawn").mockImplementation(() => {
      throw new Error("spawned a worker");
    });
    try {
      expect(() => new RscWorker(null as unknown as BaseBuildArtifact)).toThrow(TypeError);
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      spawn.mockRestore();
    }
  });
});
