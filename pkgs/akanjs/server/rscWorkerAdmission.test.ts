import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type LogRecord, logSeverity } from "akanjs/common";
import { RscRenderRefusal } from "./rscRenderRefusal";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";

interface Harness {
  rsc: RscWorker;
  raise: (name: string) => void;
  raised: (name: string) => Promise<void>;
  render: (route: string, signal?: AbortSignal) => ReturnType<RscWorker["renderWithMeta"]>;
  body: (route: string, signal?: AbortSignal) => Promise<string>;
  started: (name: string) => number;
  sample: (family: string, labels?: Record<string, string>) => number;
  settled: (inFlight: number, depth: number) => Promise<void>;
  logged: LogRecord[];
}

const until = async (check: () => boolean, what: string) => {
  const deadline = Date.now() + 10_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await Bun.sleep(5);
  }
};

const withAdmissionWorker = async (env: Record<string, string>, run: (harness: Harness) => Promise<void>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akan-admission-"));
  const vars: Record<string, string> = {
    AKAN_RSC_WORKER_PATH: path.join(import.meta.dir, "rscWorker.tsx"),
    AKAN_PUBLIC_APP_NAME: "admission",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
    AKAN_MEMORY_LOG_INTERVAL_MS: "10",
    AKAN_TEST_ADMISSION_DIR: dir,
    ...env,
  };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const segmentOutlet = "pkgs/akanjs/server/rscSegmentOutlet.tsx";
  const rsc = new RscWorker({
    pagesBundlePath: path.join(import.meta.dir, "rscWorkerAdmission.fixture.tsx"),
    pagesBundleBuildId: 1,
    rscRuntimeClientManifest: {
      [`${segmentOutlet}#AkanSegmentOutlet`]: { id: segmentOutlet, chunks: [], name: "AkanSegmentOutlet" },
    },
  } as unknown as BaseBuildArtifact);
  const sample: Harness["sample"] = (family, labels = {}) => {
    const samples = rsc.metricFamilies().find(({ name }) => name === family)?.samples ?? [];
    const found = samples.find((each) => Object.entries(labels).every(([key, value]) => each.labels[key] === value));
    if (!found) return 0;
    return "value" in found ? found.value : found.count;
  };
  const render: Harness["render"] = (route, signal) =>
    rsc.renderWithMeta(new Request(`http://localhost/en/${route}`), { signal });
  const logged: LogRecord[] = [];
  rsc.onLogRecords = (records) => logged.push(...records);
  try {
    await rsc.ready;
    rsc.setLogLevel(logSeverity.info);
    await run({
      rsc,
      logged,
      raise: (name) => fs.writeFileSync(path.join(dir, name), ""),
      raised: (name) => until(() => fs.existsSync(path.join(dir, name)), `the worker to raise ${name}`),
      render,
      body: async (route, signal) => {
        const result = await render(route, signal);
        if (result.type !== "stream") throw new Error(`expected a rendered page, got ${result.type}`);
        return await new Response(result.stream).text();
      },
      started: (name) => sample("akan_test_admission_renders_total", { name }),
      sample,
      settled: (inFlight, depth) =>
        until(
          () => sample("akan_rsc_renders_in_flight") === inFlight && sample("akan_rsc_render_queue_depth") === depth,
          `${inFlight} in flight and ${depth} waiting`,
        ),
    });
  } finally {
    rsc.kill();
    fs.rmSync(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const oneSlot = { AKAN_RSC_WORKER_MAX_CONCURRENCY: "1" };

describe("RscWorker render admission", () => {
  test("starts no more renders than the cap, and the waiting ones in the order they were asked", async () => {
    await withAdmissionWorker(oneSlot, async ({ raise, body, started, sample, settled }) => {
      const order: string[] = [];
      const first = body("held/first");
      await settled(1, 0);
      const waiting = ["second", "third", "fourth"].map((name) =>
        body(`quick/${name}`).then((text) => order.push(text)),
      );
      await settled(1, 3);
      expect(["first", "second", "third", "fourth"].map(started)).toEqual([1, 0, 0, 0]);

      raise("release-first");
      expect(await first).toContain("held first");
      await Promise.all(waiting);
      expect(order.map((text) => text.match(/quick \w+/)?.[0])).toEqual([
        "quick second",
        "quick third",
        "quick fourth",
      ]);
      await settled(0, 0);
      expect(sample("akan_rsc_render_queue_wait_seconds")).toBe(4);
    });
  }, 30_000);

  test("a page that waited for a slot says for how long on its request line, and one that did not says nothing", async () => {
    await withAdmissionWorker({ ...oneSlot, AKAN_LOG_CANONICAL: "1" }, async ({ raise, body, settled, logged }) => {
      const held = body("held/holder");
      await settled(1, 0);
      const waiting = body("quick/waiter");
      await settled(1, 1);
      await Bun.sleep(40);
      raise("release-holder");
      await Promise.all([held, waiting]);

      const lineOf = (route: string) =>
        logged.find((record) => record.name === "Signal" && record.message.includes(route));
      await until(() => !!lineOf("/held/") && !!lineOf("/quick/"), "both request lines");
      expect(Number(lineOf("/quick/")?.attrs?.queueMs)).toBeGreaterThanOrEqual(40);
      expect(lineOf("/held/")?.attrs).not.toHaveProperty("queueMs");
    });
  }, 30_000);

  test("replays a stored page while every slot is taken", async () => {
    const cached = { ...oneSlot, AKAN_RSC_RESULT_CACHE: "1", AKAN_RSC_RESULT_CACHE_PATHS: "/en/quick/stored" };
    await withAdmissionWorker(cached, async ({ raise, render, body, started, settled }) => {
      expect(await body("quick/stored")).toContain("quick stored");
      const held = body("held/holder");
      await settled(1, 0);
      const waiting = body("quick/waiter");
      await settled(1, 1);

      const replayed = await render("quick/stored");
      if (replayed.type !== "stream") throw new Error(`expected a stored page, got ${replayed.type}`);
      expect(replayed.trace?.cache).toBe("hit");
      expect(await new Response(replayed.stream).text()).toContain("quick stored");
      expect([started("stored"), started("waiter")]).toEqual([1, 0]);

      raise("release-holder");
      await Promise.all([held, waiting]);
      await settled(0, 0);
    });
  }, 30_000);

  test("a render cancelled while it waits leaves the queue at once and never starts", async () => {
    await withAdmissionWorker(oneSlot, async ({ raise, body, started, settled }) => {
      const held = body("held/holder");
      await settled(1, 0);
      const abort = new AbortController();
      const cancelled = body("quick/cancelled", abort.signal).catch((error: unknown) => error);
      const next = body("quick/next");
      await settled(1, 2);

      abort.abort();
      expect(await cancelled).toMatchObject({ name: "AbortError" });
      await settled(1, 1);
      raise("release-holder");
      await held;
      expect(await next).toContain("quick next");
      await settled(0, 0);
      expect(started("cancelled")).toBe(0);
    });
  }, 30_000);

  test("a waiting render cancelled in the same burst as the one holding the slot never starts either", async () => {
    await withAdmissionWorker(oneSlot, async ({ raise, raised, body, started, settled }) => {
      const holder = new AbortController();
      const waiter = new AbortController();
      const spinning = body("spinning/holder", holder.signal).catch((error: unknown) => error);
      await settled(1, 0);
      const cancelled = body("quick/cancelled", waiter.signal).catch((error: unknown) => error);
      const next = body("quick/next");
      await settled(1, 2);

      raise("spin-holder");
      await raised("spinning-holder");
      holder.abort();
      waiter.abort();
      await Promise.all([spinning, cancelled]);
      raise("go-holder");
      expect(await next).toContain("quick next");
      await settled(0, 0);
      expect(started("cancelled")).toBe(0);
    });
  }, 30_000);

  test("a render cancelled mid-stream gives its slot to the next one", async () => {
    await withAdmissionWorker(oneSlot, async ({ render, body, settled }) => {
      const stuck = await render("stuck/streaming");
      if (stuck.type !== "stream") throw new Error(`expected a stream, got ${stuck.type}`);
      const reader = stuck.stream.getReader();
      expect((await reader.read()).done).toBe(false);
      const next = body("quick/next");
      await settled(1, 1);

      await reader.cancel();
      expect(await next).toContain("quick next");
      await settled(0, 0);
    });
  }, 30_000);

  test("a render cancelled while its page still waits on data gives its slot up though the page never settles", async () => {
    await withAdmissionWorker(oneSlot, async ({ body, settled }) => {
      const abort = new AbortController();
      const held = body("held/never", abort.signal).catch((error: unknown) => error);
      await settled(1, 0);
      const next = body("quick/next");
      await settled(1, 1);

      abort.abort();
      expect(await held).toMatchObject({ name: "AbortError" });
      expect(await next).toContain("quick next");
      await settled(0, 0);
    });
  }, 30_000);

  test("a render that throws gives its slot to the next one", async () => {
    await withAdmissionWorker(oneSlot, async ({ render, body, started, settled }) => {
      const failing = render("failing/thrower").then(
        async (result) => (result.type === "stream" ? await new Response(result.stream).text() : result.type),
        (error: unknown) => error,
      );
      await settled(1, 0);
      const next = body("quick/next");
      await failing;
      expect(await next).toContain("quick next");
      await settled(0, 0);
      expect(started("thrower")).toBe(1);
    });
  }, 30_000);

  test("the error page of a render that failed before it took a slot waits for one too", async () => {
    await withAdmissionWorker(oneSlot, async ({ raise, render, body, settled }) => {
      const held = body("held/holder");
      await settled(1, 0);
      const broken = render("broken/module").then(
        async (result) => (result.type === "stream" ? await new Response(result.stream).text() : result.type),
        (error: unknown) => error,
      );
      await settled(1, 1);

      raise("release-holder");
      await held;
      await broken;
      await settled(0, 0);
    });
  }, 30_000);

  test("a page whose reader stops reading does not keep its slot", async () => {
    await withAdmissionWorker(oneSlot, async ({ render, body, settled }) => {
      const unread = await render("long/unread");
      if (unread.type !== "stream") throw new Error(`expected a stream, got ${unread.type}`);
      expect(await body("quick/next")).toContain("quick next");
      await settled(0, 0);
      unread.cancel();
    });
  }, 30_000);

  test("a worker that dies mid-render comes back with every slot free", async () => {
    await withAdmissionWorker(oneSlot, async ({ rsc, body, settled }) => {
      const held = body("held/lost").catch((error: unknown) => error);
      await settled(1, 0);
      const waiting = body("quick/waiting").catch((error: unknown) => error);
      await settled(1, 1);

      process.kill(Number(rsc.getMetrics().rscWorkerPid), "SIGKILL");
      expect(await held).toMatchObject({ code: "rscWorkerStopped" });
      expect(await waiting).toMatchObject({ code: "rscWorkerStopped" });
      expect(await body("quick/after")).toContain("quick after");
      await settled(0, 0);
    });
  }, 30_000);

  test("refuses a render past the depth limit before it starts, as a 503 the host can answer", async () => {
    await withAdmissionWorker({ ...oneSlot, AKAN_RSC_WORKER_MAX_QUEUE: "1" }, async (harness) => {
      const { raise, body, started, sample, settled } = harness;
      const held = body("held/holder");
      await settled(1, 0);
      const waiting = body("quick/waiter");
      await settled(1, 1);

      const refused = await body("quick/refused").catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(RscRenderRefusal);
      expect(refused).toMatchObject({ code: "renderQueueFull", statusCode: 503 });
      expect(started("refused")).toBe(0);

      raise("release-holder");
      await Promise.all([held, waiting]);
      await settled(0, 0);
      await until(
        () => sample("akan_rsc_render_refusals_total", { reason: "queue-full" }) === 1,
        "the refusal to be counted",
      );
      expect(await body("quick/after")).toContain("quick after");
    });
  }, 30_000);

  test("refuses a render that waited as long as the idle timeout, without starting it", async () => {
    const env = { ...oneSlot, AKAN_IDLE_TIMEOUT: "1", AKAN_RSC_WORKER_MAX_QUEUE: "8" };
    await withAdmissionWorker(env, async ({ raise, body, started, sample, settled }) => {
      const held = body("held/holder");
      await settled(1, 0);
      const second = body("held/second");
      await settled(1, 1);
      await Bun.sleep(300);
      const startedAt = performance.now();
      const refused = await body("quick/late").catch((error: unknown) => error);
      expect(refused).toMatchObject({ code: "renderQueueTimeout", statusCode: 503 });
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(900);
      expect(started("late")).toBe(0);

      raise("release-holder");
      raise("release-second");
      await Promise.all([held, second]);
      await settled(0, 0);
      await until(
        () => sample("akan_rsc_render_refusals_total", { reason: "wait-timeout" }) === 1,
        "the refusal to be counted",
      );
    });
  }, 30_000);

  test("takes the slot back from a page that held it as long as the idle timeout, and lets that page finish", async () => {
    await withAdmissionWorker({ ...oneSlot, AKAN_IDLE_TIMEOUT: "1" }, async ({ raise, body, sample, settled }) => {
      const stuck = body("held/stuck");
      await settled(1, 0);
      await Bun.sleep(300);
      const startedAt = performance.now();
      expect(await body("quick/next")).toContain("quick next");
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(500);
      await until(
        () =>
          sample("akan_rsc_render_refusals_total", { reason: "hold-timeout" }) === 1 &&
          sample("akan_rsc_renders_abandoned") === 1,
        "the slot taken back to be counted",
      );
      await settled(0, 0);

      raise("release-stuck");
      expect(await stuck).toContain("held stuck");
      await until(() => sample("akan_rsc_renders_abandoned") === 0, "the page that kept running to end");
    });
  }, 30_000);

  test("renders a page once for every request that waited for it, the rest replaying what the first stored", async () => {
    const cached = { ...oneSlot, AKAN_RSC_RESULT_CACHE: "1", AKAN_RSC_RESULT_CACHE_PATHS: "/en/quick/shared" };
    await withAdmissionWorker(cached, async ({ raise, render, body, started, settled }) => {
      const held = body("held/holder");
      await settled(1, 0);
      const waiting = [1, 2, 3, 4].map(async () => {
        const result = await render("quick/shared");
        if (result.type !== "stream") throw new Error(`expected a page, got ${result.type}`);
        return { cache: result.trace?.cache, text: await new Response(result.stream).text() };
      });
      await settled(1, 4);

      raise("release-holder");
      await held;
      const answers = await Promise.all(waiting);
      expect(answers.map(({ cache }) => cache)).toEqual(["miss", "hit", "hit", "hit"]);
      for (const { text } of answers) expect(text).toContain("quick shared");
      await until(() => started("shared") > 0, "the render to be reported");
      await Bun.sleep(100);
      expect(started("shared")).toBe(1);
      await settled(0, 0);
    });
  }, 30_000);

  test("counts pages their clients gave up on as abandoned while their code runs on, not as holding a slot", async () => {
    await withAdmissionWorker({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "2" }, async ({ raise, body, sample, settled }) => {
      const aborts = [new AbortController(), new AbortController()];
      const given = ["first", "second"].map((name, index) =>
        body(`held/${name}`, aborts[index]?.signal).catch((error: unknown) => error),
      );
      await settled(2, 0);
      for (const abort of aborts) abort.abort();
      await Promise.all(given);
      await settled(0, 0);
      await until(() => sample("akan_rsc_renders_abandoned") === 2, "both abandoned pages to be counted");
      expect(await body("quick/next")).toContain("quick next");

      raise("release-first");
      await until(() => sample("akan_rsc_renders_abandoned") === 1, "the first abandoned page to end");
      raise("release-second");
      await until(() => sample("akan_rsc_renders_abandoned") === 0, "the second abandoned page to end");
    });
  }, 30_000);

  test("with the cap off every render starts as it arrives", async () => {
    await withAdmissionWorker({ AKAN_RSC_WORKER_MAX_CONCURRENCY: "0" }, async ({ raise, body, settled }) => {
      const held = body("held/holder");
      await settled(1, 0);
      expect(await body("quick/beside")).toContain("quick beside");
      raise("release-holder");
      await held;
      await settled(0, 0);
    });
  }, 30_000);
});
