import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Logger } from "akanjs/common";
import { AppWorker } from "./appWorker";
import { AppWorkerError } from "./appWorkerError";
import { AppWorkerPath } from "./appWorkerPath";

const roots: string[] = [];
const workers: AppWorker<never>[] = [];
const declared = process.env[AppWorkerPath.envKey];

afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.stop()));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (declared === undefined) delete process.env[AppWorkerPath.envKey];
  else process.env[AppWorkerPath.envKey] = declared;
});

const makeRoot = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "akan-app-worker-"));
  roots.push(root);
  return root;
};

const declare = (name: string, source: string) => {
  const file = path.join(makeRoot(), `${name}.ts`);
  writeFileSync(file, source);
  process.env[AppWorkerPath.envKey] = JSON.stringify({ [name]: file });
  return file;
};

const recorder = () => {
  const lines: string[] = [];
  const logger = {
    info: (line: string) => lines.push(`info ${line}`),
    warn: (line: string) => lines.push(`warn ${line}`),
    error: (line: string) => lines.push(`error ${line}`),
  } as unknown as Logger;
  return { lines, logger };
};

const until = async (done: () => boolean) => {
  for (let tries = 0; tries < 400 && !done(); tries++) await Bun.sleep(10);
  expect(done()).toBe(true);
};

const track = <Message>(worker: AppWorker<Message>) => {
  workers.push(worker as AppWorker<never>);
  return worker;
};

describe("AppWorker.pathOf", () => {
  test("finds the built file beside the server before the source a config declared", () => {
    const appDir = makeRoot();
    const env = { [AppWorkerPath.envKey]: JSON.stringify({ vision: "/repo/apps/face/srvkit/visionWorker.ts" }) };

    expect(AppWorker.pathOf("vision", { appDir, env })).toBe("/repo/apps/face/srvkit/visionWorker.ts");
    mkdirSync(path.join(appDir, "workers"));
    writeFileSync(path.join(appDir, "workers/vision.js"), "");
    expect(AppWorker.pathOf("vision", { appDir, env })).toBe(path.join(appDir, "workers/vision.js"));
  });

  test("refuses a name no config declared, and one that could leave the workers folder", () => {
    const lookup = { appDir: makeRoot(), env: {} };
    const refusal = (name: string) => {
      try {
        AppWorker.pathOf(name, lookup);
      } catch (error) {
        return error;
      }
    };

    expect(refusal("vision")).toBeInstanceOf(AppWorkerError);
    expect((refusal("vision") as AppWorkerError).code).toBe("workerNotDeclared");
    expect((refusal("vision") as AppWorkerError).message).toContain('workers: { vision: "<entry file>" }');
    expect((refusal("../main") as AppWorkerError).code).toBe("workerNotDeclared");
  });
});

describe("AppWorker.spawn", () => {
  test("relays the worker's output to the logger and its messages to the server", async () => {
    declare(
      "echo",
      'console.log("ready");console.error("careful");process.send?.({ kind: "hello" });process.on("message", (message) => process.send?.({ kind: "echo", message }));setInterval(() => {}, 1000);',
    );
    const { lines, logger } = recorder();
    const heard: unknown[] = [];
    const worker = track(AppWorker.spawn("echo", { logger, onMessage: (message) => heard.push(message) }));

    await until(() => heard.length === 1 && lines.length === 2);
    worker.send("ping");
    await until(() => heard.length === 2);

    expect(new Set(lines)).toEqual(new Set(["info ready", "warn careful"]));
    expect(heard).toEqual([{ kind: "hello" }, { kind: "echo", message: "ping" }]);
    expect(worker.pid).toBeNumber();
    await worker.stop();
    expect(worker.pid).toBeNull();
  });

  test("starts a worker that exited with an error again, and leaves one that finished down", async () => {
    const marker = path.join(makeRoot(), "ran");
    declare(
      "flaky",
      `import { existsSync, writeFileSync } from "node:fs";if (!existsSync(${JSON.stringify(marker)})) { writeFileSync(${JSON.stringify(marker)}, "");process.exit(3); }`,
    );
    const { lines, logger } = recorder();
    const exits: (number | null)[] = [];
    let starts = 0;
    track(
      AppWorker.spawn("flaky", {
        logger,
        restart: { minMs: 10, maxMs: 20 },
        onStart: () => starts++,
        onExit: (exitCode) => exits.push(exitCode),
      }),
    );

    await until(() => exits.length === 2);
    await Bun.sleep(60);

    expect(existsSync(marker)).toBe(true);
    expect(exits).toEqual([3, 0]);
    expect(starts).toBe(2);
    expect(lines).toEqual(["warn exited 3; restarting in 10ms"]);
  });

  test("hands the worker the env it was given, never the server's own", async () => {
    declare("env", 'console.log([process.env.AKAN_TEST_SECRET ?? "none", process.env.FRAMES ?? "none"].join(" "));');
    process.env.AKAN_TEST_SECRET = "server-only";
    const kept = recorder();
    const inherited = recorder();
    try {
      track(AppWorker.spawn("env", { logger: kept.logger, env: { FRAMES: "/tmp/frames" } }));
      track(AppWorker.spawn("env", { logger: inherited.logger, inheritEnv: true }));
      await until(() => kept.lines.length === 1 && inherited.lines.length === 1);
    } finally {
      delete process.env.AKAN_TEST_SECRET;
    }

    expect(kept.lines).toEqual(["info none /tmp/frames"]);
    expect(inherited.lines).toEqual(["info server-only none"]);
  });

  test("a worker opened without onMessage takes none", async () => {
    declare("mute", "setInterval(() => {}, 1000);");
    const worker = track(AppWorker.spawn("mute", { logger: recorder().logger }));

    await until(() => worker.pid !== null);

    expect(() => worker.send("ping")).toThrow("pass onMessage to open its IPC channel");
  });
});
