import { afterEach, expect, spyOn, test } from "bun:test";
import { closeSync, openSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AkanApp } from "./akanApp";

const sentinel = "sentinel-7b1e44-value";
const secretEnvModule = path.join(import.meta.dir, "lifecycle/secretEnv.ts");
const roots: string[] = [];
const envKeys = ["AKAN_SECRET_ENV", "FIXTURE__TOKEN", "FIXTURE__SET"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const makeRoot = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "akan-app-secret-env-"));
  roots.push(root);
  return root;
};

const replica = (bootsPath: string, crashFirstBoot: boolean) => `
  import { SecretEnv } from ${JSON.stringify(secretEnvModule)};
  const bootsPath = ${JSON.stringify(bootsPath)};
  export const server = {
    async start() {
      const file = Bun.file(bootsPath);
      const boots = (await file.exists()) ? JSON.parse(await file.text()) : [];
      boots.push(SecretEnv.read("FIXTURE__TOKEN") ?? null);
      await Bun.write(bootsPath, JSON.stringify(boots));
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
      if (${crashFirstBoot} && boots.length === 1) setTimeout(() => process.exit(1), 50);
    },
  };
`;

const bootsOf = async (bootsPath: string): Promise<(string | null)[]> =>
  JSON.parse(await readFile(bootsPath, "utf8").catch(() => "[]")) as (string | null)[];

const waitForBoots = async (bootsPath: string, count: number) => {
  for (let tries = 0; tries < 200; tries++) {
    const boots = await bootsOf(bootsPath);
    if (boots.length >= count) return boots;
    await wait(50);
  }
  throw new Error(`the replica booted fewer than ${count} times`);
};

afterEach(async () => {
  for (const key of envKeys) delete process.env[key];
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("a gateway names the secret env values its deployment left unset before it spawns a replica", async () => {
  const root = await makeRoot();
  const serverPath = path.join(root, "server.ts");
  const bootsPath = path.join(root, "boots.json");
  await Bun.write(serverPath, replica(bootsPath, false));
  Object.assign(process.env, { AKAN_SECRET_ENV: "FIXTURE__TOKEN,FIXTURE__SET", FIXTURE__SET: sentinel });
  const events: string[] = [];
  const spawn = Bun.spawn;
  const spawned = spyOn(Bun, "spawn").mockImplementation(((...args: Parameters<typeof Bun.spawn>) => {
    events.push("spawn");
    return spawn(...args);
  }) as typeof Bun.spawn);
  const app = new AkanApp(serverPath, { replica: 1, runtimeDir: path.join(root, "runtime"), port: 0 });
  const warned = spyOn(app.logger, "warn").mockImplementation((message: string) => {
    events.push(message);
  });
  const running = app.start();
  try {
    expect(await waitForBoots(bootsPath, 1)).toEqual([null]);
    expect(events).toHaveLength(2);
    expect(events[0]).toStartWith(
      "1 secret env value this server declares is not set: FIXTURE__TOKEN. It runs without it, and akanjs 3.5.0 will refuse to boot.",
    );
    expect(events[1]).toBe("spawn");
    expect(events.join(" ")).not.toContain(sentinel);
  } finally {
    await app.stop();
    await Promise.race([running, wait(1_000)]);
    spawned.mockRestore();
    warned.mockRestore();
  }
}, 20_000);

test("a replica the gateway respawns reads the secret the gateway started with", async () => {
  const root = await makeRoot();
  const serverPath = path.join(root, "server.ts");
  const bootsPath = path.join(root, "boots.json");
  await Bun.write(serverPath, replica(bootsPath, true));
  Object.assign(process.env, { AKAN_SECRET_ENV: "FIXTURE__TOKEN", FIXTURE__TOKEN: sentinel });
  const app = new AkanApp(serverPath, { replica: 1, runtimeDir: path.join(root, "runtime"), port: 0 });
  const warned = spyOn(app.logger, "warn");
  const running = app.start();
  try {
    expect(await waitForBoots(bootsPath, 2)).toEqual([sentinel, sentinel]);
    expect(warned.mock.calls.filter(([message]) => message.includes("secret env"))).toEqual([]);
  } finally {
    await app.stop();
    await Promise.race([running, wait(1_000)]);
    warned.mockRestore();
  }
}, 20_000);

test("a server that runs in one process names what is unset before it loads the server", async () => {
  const root = await makeRoot();
  const serverPath = path.join(root, "server.ts");
  const mainPath = path.join(root, "main.ts");
  const outputPath = path.join(root, "output.log");
  await Bun.write(
    serverPath,
    'console.error("server module loaded");\nexport const server = { start: async () => undefined };\n',
  );
  await Bun.write(
    mainPath,
    `import { AkanApp } from ${JSON.stringify(path.join(import.meta.dir, "akanApp.ts"))};\nawait new AkanApp(${JSON.stringify(serverPath)}, { solo: true, runtimeDir: ${JSON.stringify(path.join(root, "runtime"))} }).start();\n`,
  );
  const output = openSync(outputPath, "a");
  try {
    const proc = Bun.spawn([process.execPath, mainPath], {
      cwd: root,
      env: { ...process.env, AKAN_SECRET_ENV: "FIXTURE__TOKEN,FIXTURE__SET", FIXTURE__SET: sentinel },
      stdout: output,
      stderr: output,
    });
    expect(await proc.exited).toBe(0);
  } finally {
    closeSync(output);
  }
  const text = await readFile(outputPath, "utf8");
  const warning = text.indexOf("1 secret env value this server declares is not set: FIXTURE__TOKEN.");
  expect(warning).toBeGreaterThanOrEqual(0);
  expect(text.indexOf("server module loaded")).toBeGreaterThan(warning);
  expect(text).not.toContain(sentinel);
}, 20_000);
