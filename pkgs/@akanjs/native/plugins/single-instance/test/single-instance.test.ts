import { dlopen, FFIType } from "bun:ffi";
import { afterEach, describe, expect, test } from "bun:test";
import { closeSync, existsSync, mkdtempSync, openSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import type { DesktopContext } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import { createDesktopSingleInstance } from "../src/desktop.ts";
import type { SecondInstance } from "../src/index.ts";
import { type Claim, claim, decodeMessage, encodeMessage, lockFile, socketPath } from "../src/socket.ts";

let dir = "";
const open: Claim[] = [];
afterEach(() => {
  for (const c of open.splice(0)) if (c.kind === "primary") c.close();
  //? Only a folder a test made: Bun on Windows reads rmSync("") as the working folder, this package.
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});
const tempSocket = () => {
  dir = mkdtempSync(join(tmpdir(), "akan-native-si-"));
  return join(dir, "s.sock");
};
const hello: SecondInstance = { args: ["--open", "a b.txt"], cwd: "/Users/me" };

describe("single-instance socket", () => {
  test("path: per-user folder, short hashed name, stable per app id", () => {
    const a = socketPath("com.akanjs.sample", { TMPDIR: "/var/folders/xy/abc/T/" });
    expect(a).toMatch(/^\/var\/folders\/xy\/abc\/T\/akan-native-[0-9a-f]{16}\.sock$/);
    expect(socketPath("com.akanjs.sample", { TMPDIR: "/var/folders/xy/abc/T/" })).toBe(a);
    expect(socketPath("com.akanjs.other", { TMPDIR: "/var/folders/xy/abc/T/" })).not.toBe(a);
    expect(socketPath("x", { XDG_RUNTIME_DIR: "/run/user/1000", TMPDIR: "/tmp" })).toStartWith(
      "/run/user/1000/akan-native-",
    );
    expect(Buffer.byteLength(a)).toBeLessThan(104);
    // Windows: a named pipe per user and app.
    const pipe = socketPath("com.akanjs.sample", { USERNAME: "kim", USERDOMAIN: "PC" }, "win32");
    expect(pipe).toMatch(/^\\\\\.\\pipe\\akan-native-[0-9a-f]{16}$/);
    expect(socketPath("com.akanjs.sample", { USERNAME: "lee", USERDOMAIN: "PC" }, "win32")).not.toBe(pipe);
  });

  test("messages: round trip; anything else is rejected", () => {
    expect(decodeMessage(encodeMessage(hello).trim())).toEqual(hello);
    for (const line of [
      "",
      "{",
      "null",
      '{"format":1,"args":"x","cwd":"/"}',
      '{"format":1,"args":[1],"cwd":"/"}',
      '{"format":2,"args":[],"cwd":"/"}',
    ]) {
      expect(decodeMessage(line)).toBeNull();
    }
  });

  test("the first claim listens (0600); the second hands over its message and gets an ack", async () => {
    const path = tempSocket();
    const got: SecondInstance[] = [];
    const first = await claim(path, { args: [], cwd: "/" }, (m) => got.push(m));
    open.push(first);
    expect(first.kind).toBe("primary");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const second = await claim(path, hello, () => {});
    expect(second.kind).toBe("forwarded");
    await Bun.sleep(10);
    expect(got).toEqual([hello]);
    // After the running instance quits, the next launch becomes primary again.
    (first as { close(): void }).close();
    open.length = 0;
    expect(existsSync(path)).toBe(false);
    const third = await claim(path, hello, () => {});
    open.push(third);
    expect(third.kind).toBe("primary");
  });

  test("a stale socket file (crashed instance) is replaced", async () => {
    const path = tempSocket();
    // A process that listens and then dies of SIGKILL leaves the socket file behind.
    const child = Bun.spawn([
      "bun",
      "-e",
      `require("node:net").createServer().listen(${JSON.stringify(path)}); setInterval(() => {}, 1000)`,
    ]);
    for (let i = 0; i < 100 && !existsSync(path); i++) await Bun.sleep(20);
    child.kill("SIGKILL");
    await child.exited;
    expect(existsSync(path)).toBe(true);
    const c = await claim(path, hello, () => {});
    open.push(c);
    expect(c.kind).toBe("primary");
  });

  test("a leftover regular file at the path is replaced", async () => {
    const path = tempSocket();
    writeFileSync(path, "");
    const c = await claim(path, hello, () => {});
    open.push(c);
    expect(c.kind).toBe("primary");
  });

  test("a running instance that never answers still counts (no second window)", async () => {
    const path = tempSocket();
    const held = lockFile(`${path.replace(/\.sock$/, "")}.lock`); // the running instance holds the lock…
    expect(held.kind).toBe("held");
    const mute = createServer(() => {}); // …and accepts, but never acknowledges
    await new Promise<void>((resolve) => mute.listen(path, resolve));
    const started = Date.now();
    expect((await claim(path, hello, () => {}, 100)).kind).toBe("forwarded");
    expect(Date.now() - started).toBeLessThan(1000);
    mute.close();
    if (held.kind === "held") closeSync(held.fd);
  });

  // A process the app starts with fork/exec must not inherit the lock and keep it after the app quits.
  test.skipIf(process.platform === "win32")(
    "the lock descriptor is close-on-exec, and a busy lock keeps no descriptor",
    () => {
      const libc = dlopen(process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6", {
        fcntl: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
      });
      const F_GETFD = 1;
      const FD_CLOEXEC = 1;
      const lock = join(dirname(tempSocket()), "s.lock");
      const held = lockFile(lock);
      if (held.kind !== "held") throw new Error(held.kind);
      expect(libc.symbols.fcntl(held.fd, F_GETFD) & FD_CLOEXEC).toBe(FD_CLOEXEC);
      // open(2) returns the lowest free number: after a busy attempt that closed its descriptor, the same one.
      const free = openSync(join(dir, "t"), "w");
      closeSync(free);
      expect(lockFile(lock).kind).toBe("busy");
      const after = openSync(join(dir, "t"), "w");
      closeSync(after);
      expect(after).toBe(free);
      closeSync(held.fd);
      libc.close();
    },
  );

  // Two launches that both found a stale socket used to both remove it, bind, and run (N3).
  test("the lock decides: launches at the same time end with one running instance", async () => {
    const path = tempSocket();
    const results = await Promise.all([0, 1, 2, 3].map(() => claim(path, hello, () => {}, 300)));
    open.push(...results);
    expect(results.filter((r) => r.kind === "primary")).toHaveLength(1);
    expect(results.filter((r) => r.kind === "forwarded")).toHaveLength(3);
  });

  test("desktop only", () => {
    const plugin = { spec: "single-instance", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "ios")).toEqual({});
    expect(pluginDecls([plugin], "macos")).toEqual({ "single-instance": { methods: [], events: ["secondInstance"] } });
  });
});

describe("single-instance desktop plugin", () => {
  function fakeContext() {
    const ops: string[] = [];
    const exits: number[] = [];
    const quitHooks: (() => void | Promise<void>)[] = [];
    const links: string[][] = [];
    const ctx = {
      app: { id: "com.akanjs.test", name: "Test", version: "1.0.0" },
      openLinks: (args: readonly string[]) => void links.push([...args]),
      shell: async (op: string) => {
        ops.push(op);
        return {};
      },
      onNativeEvent: () => () => {},
      launch: { setWindow() {}, exit: (code = 0) => void exits.push(code) },
      onQuit: (fn: () => void | Promise<void>) => (quitHooks.push(fn), () => {}),
    } as unknown as DesktopContext;
    return { ctx, ops, exits, quitHooks, links };
  }

  test("second launch exits in the launch phase; the first focuses, buffers until a listener, then emits", async () => {
    const path = tempSocket();
    const first = fakeContext();
    const running = createDesktopSingleInstance({ path: () => path, args: () => [], cwd: () => "/" });
    await running.setup!(first.ctx);
    expect(first.exits).toEqual([]);

    const second = fakeContext();
    await createDesktopSingleInstance({ path: () => path, args: () => hello.args, cwd: () => hello.cwd }).setup!(
      second.ctx,
    );
    expect(second.exits).toEqual([0]);
    await Bun.sleep(20);
    expect(first.ops).toEqual(["window.show", "window.unminimize", "window.focus"]);
    expect(first.links).toEqual([hello.args]); // a deep link on Windows and Linux (D6) would be in there

    const seen: SecondInstance[] = [];
    const stop = running.events!.secondInstance!((m) => void seen.push(m), first.ctx);
    expect(seen).toEqual([hello]); // buffered before the page listened
    await createDesktopSingleInstance({ path: () => path, args: () => ["again"], cwd: () => "/tmp" }).setup!(
      fakeContext().ctx,
    );
    await Bun.sleep(20);
    expect(seen).toEqual([hello, { args: ["again"], cwd: "/tmp" }]);
    stop();

    await Promise.all(first.quitHooks.map((q) => q()));
    expect(existsSync(path)).toBe(false);
  });
});
