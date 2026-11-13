import { dlopen, FFIType, ptr } from "bun:ffi";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import type { DesktopContext } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import { createDesktopSingleInstance } from "../src/desktop.ts";
import type { SecondInstance } from "../src/index.ts";
import {
  type Claim,
  claim,
  claimPipe,
  decodeMessage,
  encodeMessage,
  heldPipe,
  lockFile,
  type PipeCalls,
  privateFolder,
  sidText,
  socketPath,
  tokenSid,
} from "../src/socket.ts";

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
const mine = "S-1-5-21-1004336348-1177238915-682003330-1001";
const theirs = "S-1-5-21-1004336348-1177238915-682003330-1002";
const asMine = () => mine;
const ignored = () => {};
const holding = (owner: string | null) => {
  const count = { opened: 0, closed: 0 };
  const hold = () => {
    count.opened++;
    return { owner, close: () => void count.closed++ };
  };
  return { count, hold };
};
const listening = async (path: string) => {
  const seen = { connections: 0, received: "" };
  const server = createServer((socket) => {
    seen.connections++;
    socket.on("data", (chunk) => (seen.received += chunk));
  });
  await new Promise<void>((resolve) => server.listen(path, resolve));
  return { seen, server };
};

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
    const pipe = socketPath("com.akanjs.sample", {}, "win32", "C:\\Users\\kim");
    expect(pipe).toMatch(/^\\\\\.\\pipe\\akan-native-[0-9a-f]{16}$/);
    expect(socketPath("com.akanjs.sample", {}, "win32", "C:\\Users\\lee")).not.toBe(pipe);
    expect(socketPath("com.akanjs.other", {}, "win32", "C:\\Users\\kim")).not.toBe(pipe);
    // An SSH or service-started session names another USERDOMAIN than the desktop: the same user still meets one pipe.
    expect(
      socketPath("com.akanjs.sample", { USERDOMAIN: "WORKGROUP", USERNAME: "kim" }, "win32", "C:\\Users\\Kim"),
    ).toBe(pipe);
  });

  test("Windows: the pipe is the token's account, read as its SID, so no environment variable moves it", () => {
    // S-1-5-21-1004336348-1177238915-682003330-512: revision, 5 sub-authorities, big-endian authority 5, then LE.
    const sid = Buffer.alloc(28);
    sid.writeUInt8(1, 0);
    sid.writeUInt8(5, 1);
    sid.writeUIntBE(5, 2, 6);
    for (const [i, sub] of [21, 1004336348, 1177238915, 682003330, 512].entries()) sid.writeUInt32LE(sub, 8 + 4 * i);
    expect(sidText(sid)).toBe("S-1-5-21-1004336348-1177238915-682003330-512");
    expect(sidText(sid.subarray(0, 20))).toBeNull();
    expect(sidText(Buffer.from([2, 0, 0, 0, 0, 0, 0, 5]))).toBeNull();
    expect(sidText(new Uint8Array())).toBeNull();
    const account = "S-1-5-21-1004336348-1177238915-682003330-1001";
    expect(socketPath("com.akanjs.sample", { USERPROFILE: "D:\\elsewhere" }, "win32", account)).toBe(
      socketPath("com.akanjs.sample", { USERPROFILE: "C:\\Users\\kim" }, "win32", account),
    );
    if (process.platform === "win32") expect(tokenSid()).toMatch(/^S-1-\d+(-\d+)+$/);
    else expect(tokenSid()).toBeNull();
  });

  test("Windows: the SID is read where TOKEN_USER's pointer says, in the buffer the call wrote", () => {
    // As GetTokenInformation does: the buffer's address taken first, then the bytes written there, nothing read back.
    const written = (info: Uint8Array) => {
      const address = BigInt(ptr(info));
      info.set(new Uint8Array(new BigUint64Array([address + 24n]).buffer));
      info.set([1, 1, 0, 0, 0, 0, 0, 5, 18, 0, 0, 0], 24);
      return true;
    };
    expect(tokenSid(written)).toBe("S-1-5-18");
    expect(tokenSid(() => false)).toBeNull();
  });

  test("Windows: a held pipe's owner is read from the security descriptor the call wrote", () => {
    const system = [1, 1, 0, 0, 0, 0, 0, 5, 18, 0, 0, 0];
    const calls = (handle: bigint, descriptor: number[] | null) => {
      const made: { name: string; handles: bigint[]; closed: bigint[] } = { name: "", handles: [], closed: [] };
      const pipe: PipeCalls = {
        open: (name) => {
          made.name = Buffer.from(name).toString("utf16le");
          return handle;
        },
        security: (opened, into) => {
          made.handles.push(opened);
          if (descriptor) into.set(descriptor);
          return descriptor !== null;
        },
        close: (opened) => void made.closed.push(opened),
      };
      return { made, pipe };
    };
    const owned = calls(0x1a4n, [1, 0, 0, 0x80, 20, 0, 0, 0, ...new Array(12).fill(0), ...system]);
    const held = heldPipe("\\\\.\\pipe\\akan-native-0123456789abcdef", owned.pipe);
    expect(held?.owner).toBe("S-1-5-18");
    expect(owned.made).toEqual({ name: "\\\\.\\pipe\\akan-native-0123456789abcdef\0", handles: [0x1a4n], closed: [] });
    held?.close();
    expect(owned.made.closed).toEqual([0x1a4n]);

    const unopened = calls(-1n, null);
    expect(heldPipe("\\\\.\\pipe\\x", unopened.pipe)).toBeNull();
    expect(unopened.made).toMatchObject({ handles: [], closed: [] });

    for (const descriptor of [
      null,
      [1, 0, 0, 0x80, 0, 0, 0, 0, ...new Array(12).fill(0), ...system],
      [1, 0, 0, 0, 20, 0, 0, 0, ...new Array(12).fill(0), ...system],
      [1, 0, 0, 0x80, 0xff, 0xff, 0, 0],
      [1, 0, 0, 0x80, 20, 0, 0, 0, ...new Array(12).fill(0), 2, 1, 0, 0, 0, 0, 0, 5, 18, 0, 0, 0],
    ]) {
      const unread = calls(7n, descriptor);
      expect(heldPipe("\\\\.\\pipe\\x", unread.pipe)?.owner).toBeNull();
    }
    if (process.platform !== "win32") expect(heldPipe("\\\\.\\pipe\\x")).toBeNull();
  });

  test("Windows: a pipe another account created first gets no message, and the launch runs", async () => {
    const path = tempSocket();
    const { seen, server } = await listening(path);
    for (const owner of [theirs, "S-1-5-18", null]) {
      const { count, hold } = holding(owner);
      expect((await claimPipe(path, hello, ignored, 300, hold, asMine)).kind).toBe("failed");
      expect(count).toEqual({ opened: 1, closed: 1 });
    }
    const accountUnread = () => null;
    expect((await claimPipe(path, hello, ignored, 300, holding(mine).hold, accountUnread)).kind).toBe("failed");
    await Bun.sleep(20);
    expect(seen).toEqual({ connections: 0, received: "" });
    server.close();
  });

  test("Windows: a pipe this account or an elevated launch owns gets the message, held until it is sent", async () => {
    const path = tempSocket();
    const got: SecondInstance[] = [];
    const closedAtReceipt: number[] = [];
    let sending = holding(mine);
    const received = (m: SecondInstance) => {
      got.push(m);
      closedAtReceipt.push(sending.count.closed);
    };
    const first = await claimPipe(path, { args: [], cwd: "/" }, received, 300, sending.hold, asMine);
    open.push(first);
    expect(first.kind).toBe("primary");
    expect(sending.count.opened).toBe(0);
    for (const owner of [mine, "S-1-5-32-544"]) {
      sending = holding(owner);
      expect((await claimPipe(path, hello, ignored, 300, sending.hold, asMine)).kind).toBe("forwarded");
      expect(sending.count).toEqual({ opened: 1, closed: 1 });
    }
    expect(got).toEqual([hello, hello]);
    expect(closedAtReceipt).toEqual([0, 0]);
  });

  test("Windows: a taken name that cannot be opened gets no message and is not waited on forever", async () => {
    const path = tempSocket();
    const { seen, server } = await listening(path);
    let attempts = 0;
    const unopened = () => {
      attempts++;
      return null;
    };
    const started = Date.now();
    expect((await claimPipe(path, hello, ignored, 150, unopened, asMine)).kind).toBe("failed");
    expect(attempts).toBeGreaterThan(1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
    expect(seen).toEqual({ connections: 0, received: "" });
    const instanceQuitBeforeTheOpen = () => {
      server.close();
      return null;
    };
    const next = await claimPipe(path, hello, ignored, 1000, instanceQuitBeforeTheOpen, asMine);
    open.push(next);
    expect(next.kind).toBe("primary");
  });

  test.skipIf(process.platform !== "win32")("Windows: a real pipe is owned by the account that listens", async () => {
    const path = socketPath(`com.akanjs.test-${process.pid}`);
    const got: SecondInstance[] = [];
    const first = await claim(path, { args: [], cwd: "/" }, (m) => got.push(m));
    open.push(first);
    expect(first.kind).toBe("primary");
    const held = heldPipe(path);
    expect([tokenSid(), "S-1-5-32-544"]).toContain(held?.owner ?? "");
    held?.close();
    expect((await claim(path, hello, () => {})).kind).toBe("forwarded");
    await Bun.sleep(20);
    expect(got).toEqual([hello]);
    expect(heldPipe(socketPath(`com.akanjs.test-none-${process.pid}`))).toBeNull();
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

  test.skipIf(process.platform === "win32")(
    "a folder other users can enter holds the lock and socket in a 0700 folder of this user's",
    async () => {
      const path = tempSocket();
      chmodSync(dir, 0o1777);
      const uid = process.getuid?.() ?? -1;
      const own = join(dir, `akan-native-${uid}`);
      expect(privateFolder(dir)).toBe(own);
      expect(statSync(own).mode & 0o777).toBe(0o700);
      const first = await claim(path, hello, () => {});
      open.push(first);
      expect(first.kind).toBe("primary");
      expect(existsSync(path)).toBe(false);
      expect(existsSync(join(own, "s.sock"))).toBe(true);
      expect(existsSync(join(own, "s.lock"))).toBe(true);
      expect((await claim(path, hello, () => {})).kind).toBe("forwarded");
      expect(privateFolder(own)).toBe(own);
    },
  );

  test.skipIf(process.platform === "win32")("a lock folder another user could open or own is refused", async () => {
    tempSocket();
    chmodSync(dir, 0o755);
    const own = join(dir, `akan-native-${process.getuid?.() ?? -1}`);
    mkdirSync(own, { mode: 0o755 });
    chmodSync(own, 0o755);
    expect(privateFolder(dir)).toBeInstanceOf(Error);
    const c = await claim(join(dir, "s.sock"), hello, () => {});
    expect(c.kind).toBe("failed");
    expect(privateFolder(dir, (process.getuid?.() ?? 0) + 1)).toBeInstanceOf(Error);
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
      onQuit: (fn: () => void | Promise<void>) => {
        quitHooks.push(fn);
        return () => {};
      },
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
    const logged: string[] = [];
    const info = spyOn(console, "info").mockImplementation((line: string) => void logged.push(line));
    await createDesktopSingleInstance({ path: () => path, args: () => hello.args, cwd: () => hello.cwd }).setup!(
      second.ctx,
    );
    expect(second.exits).toEqual([0]);
    await Bun.sleep(20);
    info.mockRestore();
    // The running one says it was handed a launch, by argument count: a deep link can carry a code or a token.
    expect(logged).toContain("[akan-native] single-instance: a second launch handed over to this one (2 arguments)");
    expect(logged.join("\n")).not.toContain("a b.txt");
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
