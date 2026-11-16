import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OtlpExporter } from "./otlp/otlpExporter";
import { RscWorker } from "./rscWorkerHost";
import type { BaseBuildArtifact } from "./types";

const stubSource = `import fs from "node:fs";
const spawnsFile = process.env.AKAN_TEST_RSC_SPAWNS ?? "";
const spawn = (fs.existsSync(spawnsFile) ? Number(fs.readFileSync(spawnsFile, "utf8")) : 0) + 1;
fs.writeFileSync(spawnsFile, String(spawn));
fs.writeFileSync(spawnsFile + "." + spawn, String(process.pid));
const crashes = process.env.AKAN_TEST_RSC_CRASH === "1";
process.on("SIGTERM", () => undefined);
process.on("message", (message) => {
  if (message.type === "init") {
    if (crashes && spawn === 2) {
      process.send?.({ type: "error", requestId: "__init__", message: "pages bundle failed to import" });
      return;
    }
    process.send?.({ type: "ready" });
    if (crashes && spawn === 1) setTimeout(() => process.exit(1), 20);
    return;
  }
  if (message.type === "render") process.send?.({ type: "not-found", requestId: message.requestId });
});
process.send?.({ type: "hello" });
`;

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const eventually = async (done: () => boolean, ms = 8_000) => {
  const deadline = Date.now() + ms;
  while (!done() && Date.now() < deadline) await Bun.sleep(20);
  return done();
};

const withStub = async (
  env: Record<string, string>,
  run: (rsc: RscWorker, pidOf: (spawn: number) => number) => Promise<void>,
) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akan-rsc-stop-"));
  const spawnsFile = path.join(dir, "spawns");
  fs.writeFileSync(path.join(dir, "worker.ts"), stubSource);
  const vars = { AKAN_RSC_WORKER_PATH: path.join(dir, "worker.ts"), AKAN_TEST_RSC_SPAWNS: spawnsFile, ...env };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  const pidOf = (spawn: number) => Number(fs.readFileSync(`${spawnsFile}.${spawn}`, "utf8"));
  const rsc = new RscWorker({
    pagesBundlePath: path.join(dir, "pages.js"),
    pagesBundleBuildId: 1,
  } as BaseBuildArtifact);
  try {
    await rsc.ready;
    await run(rsc, pidOf);
  } finally {
    rsc.kill();
    for (const name of fs.readdirSync(dir).filter((file) => /^spawns\.\d+$/.test(file)))
      try {
        process.kill(Number(fs.readFileSync(path.join(dir, name), "utf8")), "SIGKILL");
      } catch {}
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

describe("a worker that never runs its SIGTERM handler", () => {
  test("is SIGKILLed once its flush window has passed when the host is disposed", async () => {
    await withStub({}, async (rsc, pidOf) => {
      const pid = pidOf(1);
      const stoppedAt = performance.now();
      rsc.kill();
      await Bun.sleep(500);

      expect(alive(pid)).toBe(true);
      expect(await eventually(() => !alive(pid))).toBe(true);
      expect(performance.now() - stoppedAt).toBeGreaterThanOrEqual(OtlpExporter.shutdownBudgetMs);
    });
  }, 20_000);

  test("is SIGKILLed after a rolling recycle has replaced it", async () => {
    await withStub({}, async (rsc, pidOf) => {
      const old = pidOf(1);
      expect(rsc.restartWhenIdle("test")).toBe(true);
      expect(await eventually(() => rsc.getMetrics().rscWorkerStatus === "ready")).toBe(true);
      expect(pidOf(2)).not.toBe(old);

      expect(await eventually(() => !alive(old))).toBe(true);
      expect(alive(pidOf(2))).toBe(true);
    });
  }, 20_000);

  test("is SIGKILLed when a crash's replacement fails its init, so the next replacement boots", async () => {
    await withStub({ AKAN_TEST_RSC_CRASH: "1" }, async (rsc, pidOf) => {
      expect(await eventually(() => fs.existsSync(`${process.env.AKAN_TEST_RSC_SPAWNS}.2`))).toBe(true);
      const failed = pidOf(2);

      expect(await eventually(() => !alive(failed))).toBe(true);
      expect(await eventually(() => rsc.getMetrics().rscWorkerStatus === "ready")).toBe(true);
      expect((await rsc.renderWithMeta(new Request("http://localhost/en"))).type).toBe("not-found");
    });
  }, 20_000);
});

describe("an exporting worker whose host goes away", () => {
  test("exits 0 once its last flush has had its bounded window, with a collector that never answers", async () => {
    const posts: string[] = [];
    const collector = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (req) => {
        posts.push(await req.text());
        return await new Promise<Response>(() => undefined);
      },
    });
    const hello = Promise.withResolvers<void>();
    const worker = Bun.spawn(["bun", "--conditions", "react-server", path.join(import.meta.dir, "rscWorker.tsx")], {
      ipc: (message: { type?: string }) => {
        if (message.type === "hello") hello.resolve();
      },
      stdio: ["ignore", "ignore", "ignore"],
      serialization: "advanced",
      env: {
        ...process.env,
        OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `http://127.0.0.1:${collector.port}/v1/logs`,
        OTEL_BLRP_SCHEDULE_DELAY: "60000",
      },
    });
    try {
      await hello.promise;
      const disconnectedAt = performance.now();
      worker.disconnect();
      const code = await Promise.race([worker.exited, Bun.sleep(8_000).then(() => "still running")]);
      const tookMs = performance.now() - disconnectedAt;

      expect(code).toBe(0);
      expect(tookMs).toBeGreaterThan(OtlpExporter.shutdownBudgetMs - 200);
      expect(tookMs).toBeLessThan(OtlpExporter.shutdownBudgetMs + 1_500);
      expect(posts.join("\n")).toContain("parent IPC channel closed");
    } finally {
      worker.kill("SIGKILL");
      collector.stop(true);
    }
  }, 20_000);
});
