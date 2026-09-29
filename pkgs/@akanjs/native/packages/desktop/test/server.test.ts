import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { grantFile } from "../src/grants.ts";
import { runtimeEnv } from "../src/main.ts";
import {
  createDesktopServer,
  type DesktopServerOptions,
  jwtSecret,
  readServerManifest,
  restartDelay,
  type ServerProcess,
  type SpawnOptions,
  serverArgv,
} from "../src/server.ts";

interface FakeChild extends ServerProcess {
  argv: string[];
  options: SpawnOptions;
  sent: unknown[];
  killed: string[];
  ready(): void;
  exit(code: number): void;
}

function fakeSpawn() {
  const children: FakeChild[] = [];
  const spawn = (argv: string[], options: SpawnOptions): ServerProcess => {
    let exit = (_code: number) => {};
    const exited = new Promise<number | null>((resolve) => (exit = resolve));
    const child: FakeChild = {
      argv,
      options,
      sent: [],
      killed: [],
      exited,
      send: (message) => void child.sent.push(message),
      kill: (signal) => void child.killed.push(signal ?? "SIGTERM"),
      ready: () => options.onMessage({ type: "ready", pid: 1 }),
      exit,
    };
    children.push(child);
    return child;
  };
  return { children, spawn };
}

function setup(options: Partial<DesktopServerOptions> = {}) {
  const root = mkdtempSync(join(tmpdir(), "akan-native-server-"));
  const resources = join(root, "Resources");
  mkdirSync(join(resources, "server"), { recursive: true });
  const { children, spawn } = fakeSpawn();
  const gaveUp: string[] = [];
  const server = createDesktopServer({
    resources,
    appDataDir: join(root, "data"),
    manifest: { entry: "main.js", env: { AKAN_PUBLIC_APP_NAME: "demo", PORT: "1" } },
    execPath: "/Applications/Demo.app/Contents/MacOS/demo",
    env: { PATH: "/usr/bin", HOME: "/Users/me", AKAN_PUBLIC_ENV: "local", PORT: "8282" },
    spawn,
    freePort: async () => 52345,
    onGiveUp: (message) => void gaveUp.push(message),
    readyTimeout: 200,
    restartDelay: () => 5,
    stopGrace: 50,
    ...options,
  });
  return { root, resources, server, children, gaveUp };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++) await Bun.sleep(5);
};

describe("the server a desktop app carries", () => {
  test("runs the entry on this executable as Bun, with Bun's working-folder files and installs off", () => {
    expect(serverArgv("/app/demo", "/app/Resources", "main.js")).toEqual([
      "/app/demo",
      "--no-env-file",
      "--no-install",
      "--config=/app/Resources/server.bunfig.toml",
      "/app/Resources/server/main.js",
    ]);
  });

  test("hands the page a loopback URL once the server says ready, and runs it in its own data folder", async () => {
    const { root, server, children } = setup();
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    expect(await started).toEqual({ url: "http://127.0.0.1:52345", ready: true });
    expect(children[0]?.options.cwd).toBe(join(root, "data", "server"));
  });

  test("passes none of the shell's own variables, and the launcher's values win over server.json", async () => {
    const { root, server, children } = setup();
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    await started;
    const data = join(root, "data", "server");
    const env = children[0]?.options.env ?? {};
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/Users/me",
      AKAN_PUBLIC_APP_NAME: "demo",
      BUN_BE_BUN: "1",
      PORT: "52345",
      AKAN_LISTEN_HOST: "127.0.0.1",
      AKAN_ALLOWED_HOSTS: "127.0.0.1:52345,localhost:52345",
      JWT_SECRET: readFileSync(join(data, "jwt.secret"), "utf8"),
      AKAN_SQLITE_DIR: join(data, "db"),
      AKAN_WORKSPACE_ROOT: data,
      AKAN_RUNTIME_DIR: join(data, "runtime"),
    });
  });

  test("puts the carried bin folder first on the server's PATH, however the shell spelled PATH", async () => {
    const run = async (env: Record<string, string>) => {
      const { resources, server, children } = setup({ manifest: { entry: "main.js", env: {}, bin: "bin" }, env });
      const started = server.start();
      await until(() => children.length === 1);
      children[0]?.ready();
      await started;
      return { bin: join(resources, "server", "bin"), env: children[0]?.options.env ?? {} };
    };
    const posix = await run({ PATH: "/usr/bin:/bin" });
    expect(posix.env.PATH).toBe(`${posix.bin}${delimiter}/usr/bin:/bin`);
    const windows = await run({ Path: "C:\\Windows\\System32" });
    expect(windows.env.PATH).toBe(`${windows.bin}${delimiter}C:\\Windows\\System32`);
    expect(windows.env.Path).toBeUndefined();
    const bare = await run({});
    expect(bare.env.PATH).toBe(bare.bin);
  });

  test("tells the server the path behind a grant the file picker gave, and nothing for any other", async () => {
    const { server, children } = setup();
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    await started;
    const grant = grantFile("/Users/me/Movies/trip.mov", "read");
    children[0]?.options.onMessage({ type: "file.resolve", id: "a", grant });
    children[0]?.options.onMessage({ type: "file.resolve", id: "b", grant: "forged" });
    expect(children[0]?.sent).toEqual([
      { type: "file.resolved", id: "a", path: "/Users/me/Movies/trip.mov", mode: "read" },
      { type: "file.resolved", id: "b", error: "no file was granted under this id" },
    ]);
  });

  test("keeps one owner-only JWT secret per installation", () => {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-secret-"));
    const secret = jwtSecret(dir);
    expect(secret.length).toBeGreaterThanOrEqual(43);
    expect(jwtSecret(dir)).toBe(secret);
    if (process.platform !== "win32") expect(statSync(join(dir, "jwt.secret")).mode & 0o777).toBe(0o600);
  });

  test("opens the window without the server after readyTimeout, and the server keeps starting", async () => {
    const { server, children } = setup({ readyTimeout: 20 });
    expect(await server.start()).toEqual({ url: "http://127.0.0.1:52345", ready: false });
    expect(children).toHaveLength(1);
    expect(children[0]?.killed).toEqual([]);
  });

  test("restarts a crashed server on the same port and env, and gives up after five crashes in a row", async () => {
    const { server, children, gaveUp } = setup();
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    await started;
    for (let n = 1; n <= 5; n++) {
      children[n - 1]?.exit(1);
      await until(() => children.length === n + 1 || gaveUp.length > 0);
    }
    expect(children).toHaveLength(5);
    expect(new Set(children.map((child) => child.options.env.PORT))).toEqual(new Set(["52345"]));
    expect(gaveUp).toHaveLength(1);
    expect(gaveUp[0]).toContain("5 times in a row");
  });

  test("a run that stayed up for a minute was healthy, so its crash starts the count again", async () => {
    let clock = 0;
    const { server, children, gaveUp } = setup({ now: () => clock });
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    await started;
    for (let n = 1; n <= 4; n++) {
      children[n - 1]?.exit(1);
      await until(() => children.length === n + 1);
    }
    children[4]?.ready();
    clock += 60_000;
    children[4]?.exit(1);
    await until(() => children.length === 6);
    expect(gaveUp).toEqual([]);
  });

  test("backs off 1 s, 2 s, 4 s … up to 30 s between restarts", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(restartDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  test("stop asks over IPC, then SIGTERM when the server outlasts the grace; no restart after it", async () => {
    const { server, children } = setup();
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    await started;
    await server.stop();
    expect(children[0]?.sent).toEqual([{ type: "shutdown", signal: "SIGTERM" }]);
    expect(children[0]?.killed).toEqual(["SIGTERM"]);
    children[0]?.exit(0);
    await Bun.sleep(20);
    expect(children).toHaveLength(1);
  });

  test("stop does not signal a server that shut down in time", async () => {
    const { server, children } = setup();
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    await started;
    const child = children[0];
    if (!child) throw new Error("no child");
    child.send = (message) => {
      child.sent.push(message);
      child.exit(0);
    };
    await server.stop();
    expect(child.killed).toEqual([]);
  });

  test("server.json names the entry and its env; an app without one carries no server", () => {
    const resources = mkdtempSync(join(tmpdir(), "akan-native-manifest-"));
    expect(readServerManifest(resources)).toBeNull();
    writeFileSync(join(resources, "server.json"), JSON.stringify({ entry: "main.js", env: { A: "1", B: 2 } }));
    expect(readServerManifest(resources)).toEqual({ entry: "main.js", env: { A: "1" } });
    writeFileSync(join(resources, "server.json"), JSON.stringify({ env: {} }));
    expect(() => readServerManifest(resources)).toThrow("entry");
    writeFileSync(join(resources, "server.json"), JSON.stringify({ entry: "main.js", env: {}, bin: "bin" }));
    expect(readServerManifest(resources)).toEqual({ entry: "main.js", env: {}, bin: "bin" });
    writeFileSync(join(resources, "server.json"), JSON.stringify({ entry: "main.js", env: {}, bin: "../bin" }));
    expect(() => readServerManifest(resources)).toThrow("bin");
  });
});

describe("the page's runtime env", () => {
  test("the launch env outranks env.runtime.json, and AKAN_NATIVE_PUBLIC_* outranks both", () => {
    const file = { PUBLIC_A: "file", PUBLIC_AKAN_SERVER_URL: "http://file" };
    expect(runtimeEnv(file, { PUBLIC_AKAN_SERVER_URL: "http://127.0.0.1:52345" }, {})).toEqual({
      PUBLIC_A: "file",
      PUBLIC_AKAN_SERVER_URL: "http://127.0.0.1:52345",
    });
    expect(
      runtimeEnv(
        file,
        { PUBLIC_AKAN_SERVER_URL: "http://127.0.0.1:52345" },
        { AKAN_NATIVE_PUBLIC_AKAN_SERVER_URL: "http://127.0.0.1:9", OTHER: "x" },
      ),
    ).toEqual({ PUBLIC_A: "file", PUBLIC_AKAN_SERVER_URL: "http://127.0.0.1:9" });
  });
});
