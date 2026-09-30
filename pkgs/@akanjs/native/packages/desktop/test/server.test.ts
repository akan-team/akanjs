import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { grantFile } from "../src/grants.ts";
import { runtimeEnv } from "../src/main.ts";
import {
  BOOT_RESTART_DELAY,
  createDesktopServer,
  type DesktopServerOptions,
  jwtSecret,
  lastPort,
  MAX_FAILURES,
  pathWithFirst,
  READY_TIMEOUT,
  readServerManifest,
  restartDelay,
  type ServerProcess,
  type SpawnOptions,
  serverArgv,
  serverEnv,
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
    dataDir: join(root, "data", "server"),
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
      "--use-system-ca",
      `--config=${join("/app/Resources", "server.bunfig.toml")}`,
      join("/app/Resources", "server", "main.js"),
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
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(data, "runtime", "transpiler-cache"),
      PORT: "52345",
      AKAN_LISTEN_HOST: "127.0.0.1",
      AKAN_ALLOWED_HOSTS: "127.0.0.1:52345,localhost:52345",
      JWT_SECRET: readFileSync(join(data, "jwt.secret"), "utf8"),
      AKAN_SQLITE_DIR: join(data, "db"),
      AKAN_WORKSPACE_ROOT: data,
      AKAN_RUNTIME_DIR: join(data, "runtime"),
    });
  });

  test("hands the server the PATH the host runs with, where the app's own bin comes first (host.ts)", async () => {
    const bin = join("resources", "bin");
    const { server, children } = setup({ env: { PATH: `${bin}${delimiter}/usr/bin` } });
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    await started;
    expect(children[0]?.options.env?.PATH).toBe(`${bin}${delimiter}/usr/bin`);
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

  test("keeps one owner-only JWT secret per installation, narrowing a kept file that others could read", () => {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-secret-"));
    const secret = jwtSecret(dir);
    expect(secret.length).toBeGreaterThanOrEqual(43);
    expect(jwtSecret(dir)).toBe(secret);
    if (process.platform === "win32") return;
    expect(statSync(join(dir, "jwt.secret")).mode & 0o777).toBe(0o600);
    chmodSync(join(dir, "jwt.secret"), 0o644);
    expect(jwtSecret(dir)).toBe(secret);
    expect(statSync(join(dir, "jwt.secret")).mode & 0o777).toBe(0o600);
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

  test("backs off 1 s, 2 s, 4 s … up to 30 s between restarts once it was ready, and restarts a booting one soon", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((n) => restartDelay(n))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(restartDelay(4, false)).toBe(BOOT_RESTART_DELAY);
    expect(BOOT_RESTART_DELAY * MAX_FAILURES).toBeLessThan(READY_TIMEOUT / 2);
  });

  test("a server that crashes while it boots gives up before the window stops waiting for it", async () => {
    const { server, children, gaveUp } = setup({ restartDelay: undefined, readyTimeout: READY_TIMEOUT });
    const at = performance.now();
    const started = server.start();
    for (let n = 1; n <= MAX_FAILURES; n++) {
      for (let i = 0; i < 200 && children.length < n; i++) await Bun.sleep(10);
      children[n - 1]?.exit(1);
    }
    expect(await started).toEqual({ url: "http://127.0.0.1:52345", ready: false });
    expect(performance.now() - at).toBeLessThan(READY_TIMEOUT / 2);
    expect(gaveUp).toHaveLength(1);
  });

  test("stop asks over IPC, then SIGKILL when the server outlasts the grace; no restart after it", async () => {
    const { server, children } = setup();
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    await started;
    await server.stop();
    expect(children[0]?.sent).toEqual([{ type: "shutdown", signal: "SIGTERM" }]);
    expect(children[0]?.killed).toEqual(["SIGKILL"]);
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

  test("a PATH in server.json still has the app's own bin first, and a relaunch does not add it twice", async () => {
    const bin = join("resources", "bin");
    const { server, children } = setup({
      binDir: bin,
      manifest: { entry: "main.js", env: { PATH: "/opt/tools" } },
    });
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    await started;
    expect(children[0]?.options.env.PATH).toBe(`${bin}${delimiter}/opt/tools`);
    expect(pathWithFirst(bin, `${bin}${delimiter}/usr/bin`)).toBe(`${bin}${delimiter}/usr/bin`);
    expect(pathWithFirst("C:\\App\\bin", "c:\\app\\BIN;C:\\Windows", "win32")).toBe("c:\\app\\BIN;C:\\Windows");
    expect(pathWithFirst(bin, undefined)).toBe(bin);
  });

  test("on Windows reads the system variables whatever the case of their names, PATH included", () => {
    const env = serverEnv(
      { entry: "main.js", env: {} },
      {
        port: 1,
        secret: "s",
        dataDir: "C:\\data",
        env: { Path: "C:\\WINDOWS\\system32;C:\\WINDOWS", windir: "C:\\WINDOWS", SystemRoot: "C:\\WINDOWS" },
        binDir: "C:\\App\\resources\\bin",
        platform: "win32",
      },
    );
    expect(env.PATH).toBe("C:\\App\\resources\\bin;C:\\WINDOWS\\system32;C:\\WINDOWS");
    expect(env.WINDIR).toBe("C:\\WINDOWS");
    expect(Object.keys(env).filter((key) => key.toUpperCase() === "PATH")).toEqual(["PATH"]);
  });

  test("passes the proxy, CA and desktop session variables, one of each name on Windows", () => {
    const env = {
      PATH: "/usr/bin",
      HTTPS_PROXY: "http://proxy:3128",
      https_proxy: "http://proxy:3128",
      NODE_EXTRA_CA_CERTS: "/ca.pem",
      SSL_CERT_FILE: "/certs.pem",
      NODE_USE_SYSTEM_CA: "1",
      NO_PROXY: "localhost",
      XAUTHORITY: "/run/user/1000/gdm/Xauthority",
      PULSE_COOKIE: "/home/me/.config/pulse/cookie",
      XDG_DATA_DIRS: "/usr/share",
    };
    const manifest = { entry: "main.js", env: {} };
    const posix = serverEnv(manifest, { port: 1, secret: "s", dataDir: "/d", env, platform: "linux" });
    expect(posix).toMatchObject({
      HTTPS_PROXY: "http://proxy:3128",
      https_proxy: "http://proxy:3128",
      NODE_EXTRA_CA_CERTS: "/ca.pem",
      SSL_CERT_FILE: "/certs.pem",
      NODE_USE_SYSTEM_CA: "1",
      NO_PROXY: "localhost",
      XAUTHORITY: "/run/user/1000/gdm/Xauthority",
      PULSE_COOKIE: "/home/me/.config/pulse/cookie",
      XDG_DATA_DIRS: "/usr/share",
    });
    const windows = serverEnv(manifest, { port: 1, secret: "s", dataDir: "/d", env, platform: "win32" });
    expect(Object.keys(windows).filter((key) => key.toUpperCase() === "HTTPS_PROXY")).toEqual(["HTTPS_PROXY"]);
    const own = serverEnv(
      { entry: "main.js", env: { Temp: "C:\\app-temp" } },
      { port: 1, secret: "s", dataDir: "/d", env: { TEMP: "C:\\Temp" }, platform: "win32" },
    );
    expect(Object.entries(own).filter(([key]) => key.toUpperCase() === "TEMP")).toEqual([["Temp", "C:\\app-temp"]]);
  });

  test("tries the last session's port first, and keeps the one it was ready on", async () => {
    const asked: (number | undefined)[] = [];
    const first = setup({
      freePort: async (preferred) => {
        asked.push(preferred);
        return 52345;
      },
    });
    const started = first.server.start();
    await until(() => first.children.length === 1);
    first.children[0]?.ready();
    await started;
    const dataDir = join(first.root, "data", "server");
    expect(lastPort(dataDir)).toBe(52345);
    const again = createDesktopServer({
      resources: first.resources,
      dataDir,
      manifest: { entry: "main.js", env: {} },
      spawn: fakeSpawn().spawn,
      freePort: async (preferred) => {
        asked.push(preferred);
        return preferred ?? 1;
      },
      readyTimeout: 20,
    });
    expect((await again.start()).url).toBe("http://127.0.0.1:52345");
    expect(asked).toEqual([undefined, 52345]);
  });

  test("a server that exits before its first ready starts again on its port if free, else a fresh one, until the page has its URL", async () => {
    const ports = [52345, 52346, 52347];
    const asked: (number | undefined)[] = [];
    const { server, children } = setup({
      freePort: async (preferred) => {
        asked.push(preferred);
        return ports.shift() ?? 1;
      },
      readyTimeout: 1000,
    });
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.exit(1);
    await until(() => children.length === 2);
    expect(asked).toEqual([undefined, 52345]);
    expect(children[1]?.options.env.PORT).toBe("52346");
    children[1]?.ready();
    expect(await started).toEqual({ url: "http://127.0.0.1:52346", ready: true });
    children[1]?.exit(1);
    await until(() => children.length === 3);
    expect(children[2]?.options.env.PORT).toBe("52346");
  });

  test("hands the URL at once when the server gave up, without waiting out readyTimeout", async () => {
    const { server, children, gaveUp } = setup({ readyTimeout: 60_000 });
    const started = server.start();
    for (let n = 1; n <= 5; n++) {
      await until(() => children.length === n);
      children[n - 1]?.exit(1);
    }
    const at = performance.now();
    expect(await started).toEqual({ url: "http://127.0.0.1:52345", ready: false });
    expect(performance.now() - at).toBeLessThan(1000);
    expect(gaveUp).toHaveLength(1);
    expect(await server.ready).toBe(false);
  });

  test("a server that cannot start still gets a loopback URL for the page, and the user hears why", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-server-"));
    writeFileSync(join(root, "not-a-folder"), "");
    const gaveUp: string[] = [];
    const server = createDesktopServer({
      resources: join(root, "Resources"),
      dataDir: join(root, "not-a-folder", "server"),
      manifest: { entry: "main.js", env: {} },
      spawn: fakeSpawn().spawn,
      freePort: async () => 52345,
      onGiveUp: (message) => void gaveUp.push(message),
    });
    expect(await server.start()).toEqual({ url: "http://127.0.0.1:52345", ready: false });
    expect(gaveUp[0]).toContain("cannot start");
  });

  test("a start that throws is one failure, not the end of the plugin host", async () => {
    let calls = 0;
    const { spawn, children } = fakeSpawn();
    const { server, gaveUp } = setup({
      spawn: (argv, options) => {
        if (++calls <= 2) throw new Error("posix_spawn: ENOENT");
        return spawn(argv, options);
      },
      readyTimeout: 1000,
    });
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    expect(await started).toEqual({ url: "http://127.0.0.1:52345", ready: true });
    expect(gaveUp).toEqual([]);
  });

  test("a grant answer to a server that already exited is dropped", async () => {
    const { server, children } = setup();
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    await started;
    const child = children[0];
    if (!child) throw new Error("no child");
    child.send = () => {
      throw new Error("Subprocess.send() cannot be used after the process has exited.");
    };
    expect(() => child.options.onMessage({ type: "file.resolve", id: "a", grant: "x" })).not.toThrow();
  });

  test("server.json names the entry and its env; an app without one carries no server", () => {
    const resources = mkdtempSync(join(tmpdir(), "akan-native-manifest-"));
    expect(readServerManifest(resources)).toBeNull();
    writeFileSync(join(resources, "server.json"), JSON.stringify({ entry: "main.js", env: { A: "1", B: 2 } }));
    expect(readServerManifest(resources)).toEqual({ entry: "main.js", env: { A: "1" } });
    writeFileSync(join(resources, "server.json"), JSON.stringify({ env: {} }));
    expect(() => readServerManifest(resources)).toThrow("entry");
  });
});

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe.skipIf(process.platform === "win32")("a real server process (macOS, Linux)", () => {
  const realServer = (mode: "clean" | "stuck" | "crash", stopGrace = 300) => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-real-server-"));
    const resources = join(root, "Resources");
    mkdirSync(join(resources, "server"), { recursive: true });
    writeFileSync(join(resources, "server.bunfig.toml"), "");
    writeFileSync(
      join(resources, "server", "main.js"),
      `const deaf = process.env.MODE === "crash";
const tool = Bun.spawn(deaf ? ["/bin/sh", "-c", "trap '' TERM; sleep 300"] : ["sleep", "300"], { stdio: ["ignore", "ignore", "ignore"] });
require("node:fs").writeFileSync(process.env.TOOL_PID, String(tool.pid) + " " + process.pid);
if (deaf) setTimeout(() => process.exit(1), 200);
process.on("SIGTERM", () => {});
process.on("message", (m) => {
  if (m?.type !== "shutdown") return;
  if (process.env.MODE === "stuck") for (;;) {}
  process.exit(0);
});
process.send({ type: "ready" });
`,
    );
    const pids = join(root, "pids");
    const server = createDesktopServer({
      resources,
      dataDir: join(root, "data"),
      manifest: { entry: "main.js", env: { TOOL_PID: pids, MODE: mode } },
      execPath: process.execPath,
      stopGrace,
    });
    return {
      server,
      pids: () => readFileSync(pids, "utf8").split(" ").map(Number) as [number, number],
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
  };
  const gone = async (pid: number) => {
    for (let i = 0; i < 100 && alive(pid); i++) await Bun.sleep(20);
    return !alive(pid);
  };

  test("stop ends what the server started, after a clean shutdown too", async () => {
    const { server, pids, cleanup } = realServer("clean");
    try {
      expect((await server.start()).ready).toBe(true);
      const [tool, main] = pids();
      expect(alive(tool)).toBe(true);
      await server.stop();
      expect(await gone(main)).toBe(true);
      expect(await gone(tool)).toBe(true);
    } finally {
      cleanup();
    }
  }, 15_000);

  test("a tool deaf to SIGTERM that a crashed server left is killed when the app quits before the grace ends", async () => {
    const { server, pids, cleanup } = realServer("crash", 30_000);
    try {
      expect((await server.start()).ready).toBe(true);
      const [tool, main] = pids();
      expect(await gone(main)).toBe(true);
      await Bun.sleep(200);
      expect(alive(tool)).toBe(true);
      await server.stop();
      expect(await gone(tool)).toBe(true);
    } finally {
      cleanup();
    }
  }, 15_000);

  test("a server stuck in its shutdown, deaf to SIGTERM, is killed after the grace, with its tools", async () => {
    const { server, pids, cleanup } = realServer("stuck");
    try {
      expect((await server.start()).ready).toBe(true);
      const [tool, main] = pids();
      await server.stop();
      expect(await gone(main)).toBe(true);
      expect(await gone(tool)).toBe(true);
    } finally {
      cleanup();
    }
  }, 15_000);
});

describe("where the carried server is", () => {
  test("starting, up, restarting after a crash, up again, gave up, and stopped as the app quits", async () => {
    const states: string[] = [];
    const { server, children } = setup({ onState: (state) => void states.push(state), readyTimeout: 1000 });
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.ready();
    await started;
    expect(server.state).toBe("up");
    children[0]?.exit(1);
    await until(() => children.length === 2);
    children[1]?.ready();
    for (let n = 2; n <= 6; n++) {
      await until(() => children.length === n);
      children[n - 1]?.exit(1);
    }
    await until(() => server.state === "gaveUp");
    await server.stop();
    expect(states).toEqual(["up", "restarting", "up", "restarting", "gaveUp", "stopped"]);
  });

  test("a server that fails before it is ready leaves its reason in server-output.log", async () => {
    const { server, children, root } = setup({ readyTimeout: 1000 });
    const started = server.start();
    await until(() => children.length === 1);
    children[0]?.options.onLine("booting", "stdout");
    children[0]?.options.onLine("Error: no env file for production", "stderr");
    children[0]?.ready();
    await started;
    children[0]?.options.onLine("a request log line", "stdout");
    children[0]?.exit(1);
    await until(() => children.length === 2);
    const log = readFileSync(join(root, "data", "server", "runtime", "logs", "server-output.log"), "utf8");
    expect(log).toContain("booting");
    expect(log).toContain("Error: no env file for production");
    expect(log).toContain("exited with 1");
    expect(log).not.toContain("a request log line");
  });

  test("the last session's port is not reused while another program answers on it", async () => {
    const other = Bun.listen({ hostname: "0.0.0.0", port: 0, socket: { data() {} } });
    try {
      const root = mkdtempSync(join(tmpdir(), "akan-native-server-"));
      const dataDir = join(root, "data", "server");
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(join(dataDir, "port"), String(other.port));
      const { spawn, children } = fakeSpawn();
      const server = createDesktopServer({
        resources: join(root, "Resources"),
        dataDir,
        manifest: { entry: "main.js", env: {} },
        spawn,
        readyTimeout: 20,
      });
      await server.start();
      expect(children[0]?.options.env.PORT).not.toBe(String(other.port));
      await server.stop();
    } finally {
      other.stop(true);
    }
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
