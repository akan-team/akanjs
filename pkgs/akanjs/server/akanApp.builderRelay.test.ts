import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AkanApp } from "./akanApp";
import type { BuilderMessage, BuilderRequest, BuilderResponse } from "./artifact";

type CsrRequest = Extract<BuilderRequest, { type: "build-csr" }>;

const realSend = process.send;
const roots: string[] = [];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async <T>(fn: () => Promise<T | null> | T | null, message: string, timeoutMs = 8_000): Promise<T> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await wait(25);
  }
  throw new Error(message);
};

afterEach(async () => {
  process.send = realSend;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("a replica respawned at its index gets only its own builder answer, never its predecessor's", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "akan-app-builder-relay-"));
  roots.push(root);
  const serverPath = path.join(root, "server.ts");
  const bootsPath = path.join(root, "boots.txt");
  const answersPath = path.join(root, "answers.jsonl");
  await Bun.write(
    serverPath,
    `
      import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
      const bootsPath = ${JSON.stringify(bootsPath)};
      const answersPath = ${JSON.stringify(answersPath)};
      export const server = {
        async start() {
          const boot = (existsSync(bootsPath) ? Number(readFileSync(bootsPath, "utf8")) : 0) + 1;
          writeFileSync(bootsPath, String(boot));
          const http = Bun.serve({ unix: process.env.AKAN_CHILD_SOCKET, fetch: () => new Response("ok") });
          process.on("message", (message) => {
            if (message?.type === "health.ping")
              process.send?.({ type: "health.pong", nonce: message.nonce, sentAt: message.sentAt, pid: process.pid });
            if (message?.type === "build-csr-res")
              appendFileSync(answersPath, JSON.stringify({ boot, id: message.id, error: message.error }) + "\\n");
            if (message?.type === "build-status" && boot === 1) process.exit(1);
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
          process.send?.({ type: "build-csr", id: 1, reason: "boot-" + boot });
        },
      };
    `,
  );
  const forwarded: CsrRequest[] = [];
  process.send = ((message: BuilderMessage) => {
    if (message.type === "build-csr") forwarded.push(message);
    return true;
  }) as typeof process.send;
  const app = new AkanApp(serverPath, {
    replica: 1,
    runtimeDir: path.join(root, "runtime"),
    port: 0,
  });
  const verbose = spyOn(app.logger, "verbose");
  const running = app.start();
  try {
    await waitFor(() => (forwarded.length >= 1 ? forwarded : null), "the replica never asked the builder");
    //? Exiting from the send's own callback loses that send on Bun under load, so the crash waits for the host.
    process.emit(
      "message" as never,
      {
        type: "build-status",
        data: { generation: 1, phase: "pages", ok: true, files: [], message: "" },
      } as never,
    );
    const [stale, own] = await waitFor(
      () => (forwarded.length >= 2 ? forwarded : null),
      "the crashed replica was never respawned to ask again",
    );
    expect([stale.reason, own.reason]).toEqual(["boot-1", "boot-2"]);
    const answer = (request: CsrRequest): BuilderResponse => ({
      type: "build-csr-res",
      id: request.id,
      ok: false,
      error: `answer to ${request.reason}`,
    });
    process.emit("message" as never, answer(stale) as never);
    process.emit("message" as never, answer(own) as never);

    const answers = await waitFor(async () => {
      const lines = (await readFile(answersPath, "utf8").catch(() => "")).trim().split("\n").filter(Boolean);
      return lines.some((line) => line.includes("answer to boot-2")) ? lines.map((line) => JSON.parse(line)) : null;
    }, "the respawned replica never got its own answer");
    expect(answers).toEqual([{ boot: 2, id: 1, error: "answer to boot-2" }]);
    expect(verbose.mock.calls.map(([message]) => message)).toContain(`No child found for build-csr-res id=${stale.id}`);
  } finally {
    await app.stop();
    await Promise.race([running, wait(1_000)]);
  }
}, 20_000);
