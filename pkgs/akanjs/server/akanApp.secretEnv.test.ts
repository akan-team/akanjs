import { afterEach, expect, spyOn, test } from "bun:test";
import { closeSync, openSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AkanError } from "../base/akanError";
import { AkanApp } from "./akanApp";

const sentinel = "sentinel-7b1e44-value";
const secretEnvModule = path.join(import.meta.dir, "lifecycle/secretEnv.ts");
const roots: string[] = [];
const envKeys = ["AKAN_ENV_NAMES", "FIXTURE__TOKEN", "FIXTURE__SET"];
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

test("a gateway whose deployment left a secret env value unset refuses before it spawns a replica or listens", async () => {
  const root = await makeRoot();
  const serverPath = path.join(root, "server.ts");
  const bootsPath = path.join(root, "boots.json");
  await Bun.write(serverPath, replica(bootsPath, false));
  Object.assign(process.env, { AKAN_ENV_NAMES: "FIXTURE__TOKEN,FIXTURE__SET", FIXTURE__SET: sentinel });
  const spawned = spyOn(Bun, "spawn");
  const served = spyOn(Bun, "serve");
  const app = new AkanApp(serverPath, { replica: 1, runtimeDir: path.join(root, "runtime"), port: 0 });
  try {
    const failure = await app.start().then(
      () => null,
      (error: unknown) => error,
    );
    expect(AkanError.is(failure, "secretEnvMissing")).toBe(true);
    expect((failure as AkanError).message).toStartWith(
      "1 secret env value this server reads from its process env is not set, so it does not start: FIXTURE__TOKEN.",
    );
    expect(`${(failure as AkanError).message}`).not.toContain(sentinel);
    expect(spawned).not.toHaveBeenCalled();
    expect(served).not.toHaveBeenCalled();
    expect(await bootsOf(bootsPath)).toEqual([]);
  } finally {
    await app.stop();
    spawned.mockRestore();
    served.mockRestore();
  }
}, 20_000);

test("a replica the gateway respawns reads the secret the gateway started with", async () => {
  const root = await makeRoot();
  const serverPath = path.join(root, "server.ts");
  const bootsPath = path.join(root, "boots.json");
  await Bun.write(serverPath, replica(bootsPath, true));
  Object.assign(process.env, { AKAN_ENV_NAMES: "FIXTURE__TOKEN", FIXTURE__TOKEN: sentinel });
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

test("a server that runs in one process exits non-zero before it loads the server, naming what is unset", async () => {
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
  const run = async (env: { [name: string]: string }) => {
    const proc = Bun.spawn([process.execPath, mainPath], {
      cwd: root,
      env: { ...process.env, AKAN_ENV_NAMES: "FIXTURE__TOKEN,FIXTURE__SET", FIXTURE__SET: sentinel, ...env },
      stdout: output,
      stderr: output,
    });
    return await proc.exited;
  };
  try {
    expect(await run({})).not.toBe(0);
    const refused = await readFile(outputPath, "utf8");
    expect(refused).toContain(
      "1 secret env value this server reads from its process env is not set, so it does not start: FIXTURE__TOKEN.",
    );
    expect(refused).not.toContain("server module loaded");
    expect(refused).not.toContain(sentinel);
    expect(await run({ FIXTURE__TOKEN: sentinel })).toBe(0);
  } finally {
    closeSync(output);
  }
  expect(await readFile(outputPath, "utf8")).toContain("server module loaded");
}, 20_000);

test("a server started on an env profile its build carries owes none of the secret env values, and one it lacks refuses", async () => {
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
  //? Unbundled, the variable stands in for the literal a build writes over the read of AKAN_BUILD_ENV_PROFILES.
  const run = async (env: { [name: string]: string }) => {
    const proc = Bun.spawn([process.execPath, mainPath], {
      cwd: root,
      env: { ...process.env, AKAN_ENV_NAMES: "FIXTURE__TOKEN", AKAN_BUILD_ENV_PROFILES: "edge", ...env },
      stdout: output,
      stderr: output,
    });
    return await proc.exited;
  };
  try {
    expect(await run({ AKAN_ENV_PROFILE: "desk" })).not.toBe(0);
    const refused = await readFile(outputPath, "utf8");
    expect(refused).toContain(
      "AKAN_ENV_PROFILE=desk names a server env profile this server was not built with (it carries edge)",
    );
    expect(refused).not.toContain("server module loaded");
    expect(await run({ AKAN_ENV_PROFILE: "edge" })).toBe(0);
    expect(await run({})).not.toBe(0);
  } finally {
    closeSync(output);
  }
  const logged = await readFile(outputPath, "utf8");
  expect(logged.match(/server module loaded/g)).toHaveLength(1);
  expect(logged).toContain("so it does not start: FIXTURE__TOKEN.");
}, 20_000);
