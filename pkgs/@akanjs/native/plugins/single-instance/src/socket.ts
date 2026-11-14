// The instance lock. macOS and Linux: an flock(2) on a lock file per app and user decides who runs;
// the holder keeps it open until it exits (the kernel releases it even after a crash), removes a
// stale socket and binds it; the socket only carries the second launch's message. Windows: a named
// pipe, which is both (node:net listens on pipes only, and a pipe disappears with its server); a
// launch that finds the name taken sends only to a pipe its own account owns, and runs otherwise.
//
// Differences from tauri-plugins-workspace/plugins/single-instance/src/platform_impl/macos.rs:
// - the files live in the per-user temporary folder ($TMPDIR on macOS, $XDG_RUNTIME_DIR on
//   Linux, both 0700) instead of /tmp, so two users of one Mac do not see each other's app; a
//   folder others can enter (/tmp when neither is set) gets a 0700 akan-native-<uid> folder inside
// - the lock, not the socket, decides: two launches that both found a stale socket used to both
//   remove it and bind, and both run as the first instance (plugins-workspace #3542 / #3495)
// - a launch that sees the lock taken never runs: it hands over its message, or exits anyway
// - the running instance acknowledges, so the second launch only exits once it was heard

import { dlopen, FFIType, ptr } from "bun:ffi";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, constants, lstatSync, mkdirSync, openSync, rmSync } from "node:fs";
import { connect, createServer, type Server, type Socket } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { basename, dirname, join } from "node:path";
import type { SecondInstance } from "./index.ts";

const FORMAT = 1;
const ACK = "ok\n";
/** One message is a few KiB of arguments; anything larger is not from us. */
const MAX_MESSAGE = 256 * 1024;

// Only where the token cannot be read. An account without a profile (some service accounts) has no folder to read.
const profileFolder = (env: Record<string, string | undefined>) => {
  try {
    return userInfo().homedir;
  } catch {
    return env.USERPROFILE ?? env.USERNAME ?? "";
  }
};

//? Windows 8 and later: GetCurrentProcessToken() is this constant, a pseudo-handle that may query and is never closed.
const CURRENT_PROCESS_TOKEN = -4;
const TOKEN_USER = 1;

/** A binary SID as S-1-<authority>-<sub authorities>; null for bytes that are not one. */
export function sidText(sid: Uint8Array): string | null {
  const count = sid[1] ?? 16;
  if (sid[0] !== 1 || count > 15 || sid.length < 8 + 4 * count) return null;
  const view = new DataView(sid.buffer, sid.byteOffset, sid.byteLength);
  const authority = view.getUint16(2) * 2 ** 32 + view.getUint32(4);
  return ["S-1", authority, ...Array.from({ length: count }, (_, i) => view.getUint32(8 + 4 * i, true))].join("-");
}

const queryTokenUser = (info: Uint8Array) => {
  const { symbols } = dlopen("advapi32.dll", {
    GetTokenInformation: {
      args: [FFIType.i64, FFIType.i32, FFIType.ptr, FFIType.u32, FFIType.ptr],
      returns: FFIType.i32,
    },
  });
  return symbols.GetTokenInformation(CURRENT_PROCESS_TOKEN, TOKEN_USER, info, info.length, new Uint32Array(1)) !== 0;
};

/** The account the process token names, which no environment variable changes; null where it cannot be read. */
export function tokenSid(query: (info: Uint8Array) => boolean = queryTokenUser): string | null {
  try {
    //? Over its own ArrayBuffer: a small Uint8Array's bytes are copied elsewhere when its .buffer is first read.
    const info = new Uint8Array(new ArrayBuffer(256));
    if (!query(info)) return null;
    //? TOKEN_USER starts with a pointer to the SID, which the call wrote after it in the same buffer.
    const at = Number(new DataView(info.buffer).getBigUint64(0, true)) - ptr(info);
    return at >= 16 && at < info.length ? sidText(info.subarray(at)) : null;
  } catch {
    return null;
  }
}

/**
 * sun_path is 104 bytes on macOS, so the name is a short hash, not the app id. Windows pipe names
 * are one namespace for the whole PC, so the user is part of the hash there. The hash is no secret:
 * another account can work the name out and create the pipe first. The pipe's default security only
 * keeps others from writing to a pipe this account created, so a launch reads who owns the pipe
 * before it sends (claimPipe).
 */
export function socketPath(
  appId: string,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  account = platform === "win32" ? (tokenSid() ?? profileFolder(env)) : "",
): string {
  if (platform === "win32") {
    //? The user is the token's account, never an environment variable: USERDOMAIN reads WORKGROUP in an SSH or
    //? service-started session and the PC's name on the desktop, and Bun's userInfo().homedir is USERPROFILE when set,
    //? so launches that differed in either missed each other's pipe and both ran.
    const hash = createHash("sha256").update(`${account.toLowerCase()}\0${appId}`).digest("hex").slice(0, 16);
    return `\\\\.\\pipe\\akan-native-${hash}`;
  }
  const dir = env.XDG_RUNTIME_DIR || env.TMPDIR || tmpdir();
  const hash = createHash("sha256").update(appId).digest("hex").slice(0, 16);
  return join(dir, `akan-native-${hash}.sock`);
}

/** A named pipe disappears with its server: there is no file to protect or clean up. */
const isPipe = (path: string) => path.startsWith("\\\\.\\pipe\\");

const GENERIC_READ = 0x80000000;
const OPEN_EXISTING = 3;
//? Alone it is SECURITY_ANONYMOUS: a pipe's server may otherwise act as whoever connects, and this one is unknown yet.
const SECURITY_SQOS_PRESENT = 0x00100000;
const OWNER_SECURITY_INFORMATION = 1;
const SE_SELF_RELATIVE = 0x8000;
const INVALID_HANDLE_VALUE = -1n;
//? An elevated launch's pipe is owned by this group, and Windows lets no account outside it name it as an owner.
const ADMINISTRATORS = "S-1-5-32-544";

export interface PipeCalls {
  open(name: Uint8Array): bigint;
  security(handle: bigint, descriptor: Uint8Array): boolean;
  close(handle: bigint): void;
}

export interface HeldPipe {
  owner: string | null;
  close(): void;
}

let win32: PipeCalls | null = null;

const win32PipeCalls = (): PipeCalls => {
  if (win32) return win32;
  const kernel = dlopen("kernel32.dll", {
    CreateFileW: {
      args: [FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.i64],
      returns: FFIType.i64,
    },
    CloseHandle: { args: [FFIType.i64], returns: FFIType.i32 },
  }).symbols;
  const advapi = dlopen("advapi32.dll", {
    GetKernelObjectSecurity: {
      args: [FFIType.i64, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr],
      returns: FFIType.i32,
    },
  }).symbols;
  win32 = {
    //? Read access is what a pipe's default security gives every account, and it covers reading the owner.
    open: (name) => kernel.CreateFileW(name, GENERIC_READ, 0, null, OPEN_EXISTING, SECURITY_SQOS_PRESENT, 0),
    security: (handle, descriptor) =>
      advapi.GetKernelObjectSecurity(
        handle,
        OWNER_SECURITY_INFORMATION,
        descriptor,
        descriptor.length,
        new Uint32Array(1),
      ) !== 0,
    close: (handle) => void kernel.CloseHandle(handle),
  };
  return win32;
};

//? The owner is what another account cannot fake: Windows lets an account name only itself as an object's owner.
//? Until close the name keeps meaning this pipe: a pipe lives until its last handle closes, the client's included.
export function heldPipe(path: string, calls?: PipeCalls): HeldPipe | null {
  try {
    const pipe = calls ?? win32PipeCalls();
    const handle = pipe.open(Buffer.from(`${path}\0`, "utf16le"));
    if (handle === INVALID_HANDLE_VALUE) return null;
    const descriptor = new Uint8Array(new ArrayBuffer(256));
    let owner: string | null = null;
    if (pipe.security(handle, descriptor)) {
      //? SECURITY_DESCRIPTOR_RELATIVE: revision, a zero byte, control (u16), then the owner SID's offset in the buffer.
      const view = new DataView(descriptor.buffer);
      const at = view.getUint32(4, true);
      if (view.getUint16(2, true) & SE_SELF_RELATIVE && at >= 20) owner = sidText(descriptor.subarray(at));
    }
    return { owner, close: () => pipe.close(handle) };
  } catch {
    return null;
  }
}

export function encodeMessage(message: SecondInstance): string {
  return `${JSON.stringify({ format: FORMAT, args: message.args, cwd: message.cwd })}\n`;
}

export function decodeMessage(line: string): SecondInstance | null {
  try {
    const v = JSON.parse(line);
    if (
      v?.format !== FORMAT ||
      !Array.isArray(v.args) ||
      !v.args.every((a: unknown) => typeof a === "string") ||
      typeof v.cwd !== "string"
    ) {
      return null;
    }
    return { args: v.args, cwd: v.cwd };
  } catch {
    return null;
  }
}

export type Claim =
  | { kind: "primary"; close(): void }
  /** Another instance runs: it got the message (or did not answer in time; this launch exits either way). */
  | { kind: "forwarded" }
  /** The lock file cannot be made (e.g. the folder is not writable): run without the lock. */
  | { kind: "failed"; error: Error };

type Lock = { kind: "held"; fd: number } | { kind: "busy" } | { kind: "unavailable"; error: Error };

const LOCK_EX = 2;
const LOCK_NB = 4;
/** node:fs has no O_CLOEXEC constant, and Bun's open does not add it (checked with fcntl F_GETFD). */
const O_CLOEXEC = process.platform === "darwin" ? 0x1000000 : 0o2000000;
let libc: { symbols: { flock(fd: number, operation: number): number } } | null = null;

/**
 * flock(LOCK_EX | LOCK_NB) on `path`, opened with node:fs (open(2) is variadic, which bun:ffi
 * cannot call portably); flock itself comes from the C library. The descriptor stays open for the
 * process: closing it would release the lock. It is close-on-exec: a process the app starts with
 * fork/exec (native code, xdg-open, a relaunch) would otherwise keep the lock after the app quit,
 * and every later launch would hand its message to nobody and exit.
 */
export function lockFile(path: string): Lock {
  let fd: number;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | O_CLOEXEC, 0o600);
  } catch (error) {
    return { kind: "unavailable", error: error as Error };
  }
  try {
    libc ??= dlopen(process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6", {
      flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    });
  } catch (error) {
    closeSync(fd);
    return { kind: "unavailable", error: error as Error };
  }
  if (libc.symbols.flock(fd, LOCK_EX | LOCK_NB) === 0) return { kind: "held", fd };
  closeSync(fd);
  return { kind: "busy" };
}

const errno = (error: unknown) => (error as NodeJS.ErrnoException)?.code;

function listen(path: string, onMessage: (m: SecondInstance) => void): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => serve(socket, onMessage));
    server.once("error", reject);
    server.listen(path, () => {
      server.off("error", reject);
      server.on("error", (error) => console.error("[akan-native] single-instance:", error));
      resolve(server);
    });
  });
}

function serve(socket: Socket, onMessage: (m: SecondInstance) => void): void {
  let buffered = "";
  socket.setEncoding("utf8");
  socket.setTimeout(2000, () => socket.destroy());
  socket.on("error", () => {});
  socket.on("data", (chunk: string) => {
    buffered += chunk;
    if (buffered.length > MAX_MESSAGE) return void socket.destroy();
    const nl = buffered.indexOf("\n");
    if (nl < 0) return;
    const message = decodeMessage(buffered.slice(0, nl));
    socket.end(message ? ACK : "");
    if (message) onMessage(message);
  });
}

/** Sends the message; resolves true once the running instance acknowledged it. */
function send(path: string, message: SecondInstance, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    let reply = "";
    let connected = false;
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.setEncoding("utf8");
    socket.once("connect", () => {
      connected = true;
      socket.write(encodeMessage(message));
    });
    socket.on("data", (chunk: string) => (reply += chunk));
    socket.once("close", () => {
      clearTimeout(timer);
      resolve(reply === ACK);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      socket.destroy();
      if (connected) resolve(false);
      else reject(error);
    });
  });
}

/**
 * Becomes the running instance, or hands `message` to the one that is.
 * A running instance that does not acknowledge within `timeoutMs` (hung) still counts:
 * starting a second window next to it is what the plugin exists to prevent.
 */
export async function claim(
  path: string,
  message: SecondInstance,
  onMessage: (m: SecondInstance) => void,
  timeoutMs = 1500,
): Promise<Claim> {
  return isPipe(path)
    ? claimPipe(path, message, onMessage, timeoutMs)
    : claimLocked(path, message, onMessage, timeoutMs);
}

//? A pipe that is not this account's makes the launch run, not exit: exiting lets whoever took the name stop the app.
export async function claimPipe(
  path: string,
  message: SecondInstance,
  onMessage: (m: SecondInstance) => void,
  timeoutMs: number,
  hold: (path: string) => HeldPipe | null = heldPipe,
  account: () => string | null = tokenSid,
): Promise<Claim> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const server = await listen(path, onMessage);
      return { kind: "primary", close: () => void server.close() };
    } catch (error) {
      if (errno(error) !== "EADDRINUSE") return { kind: "failed", error: error as Error };
    }
    const held = hold(path);
    if (held) {
      try {
        if (held.owner === null || (held.owner !== account() && held.owner !== ADMINISTRATORS)) {
          const owner = held.owner ?? "an owner that cannot be read";
          return { kind: "failed", error: new Error(`${path} belongs to another account (${owner})`) };
        }
        const heard = await send(path, message, timeoutMs);
        if (!heard) console.warn("[akan-native] single-instance: the running instance did not answer; exiting anyway");
        return { kind: "forwarded" };
      } catch (error) {
        if (errno(error) !== "ENOENT") return { kind: "failed", error: error as Error };
      } finally {
        held.close();
      }
    }
    //? Not opened: the instance just quit (the next listen succeeds), or every instance of its pipe is taken for now.
    if (Date.now() >= deadline) {
      return { kind: "failed", error: new Error(`${path} is taken and cannot be opened to see whose it is`) };
    }
    await Bun.sleep(20);
  }
}

/** The lock and socket need a folder of this user's alone: another user's could block the app or read its arguments. */
export function privateFolder(dir: string, uid = process.getuid?.() ?? -1): string | Error {
  const owned = (at: string) => {
    const stat = lstatSync(at, { throwIfNoEntry: false });
    return !!stat && stat.isDirectory() && stat.uid === uid && (stat.mode & 0o077) === 0;
  };
  if (owned(dir)) return dir;
  const own = join(dir, `akan-native-${uid}`);
  try {
    mkdirSync(own, { mode: 0o700 });
  } catch (error) {
    if (errno(error) !== "EEXIST") return error as Error;
  }
  return owned(own) ? own : new Error(`${own} is not a folder of this user's alone`);
}

/** macOS and Linux: whoever holds the lock file runs; the socket only carries messages. */
async function claimLocked(
  requested: string,
  message: SecondInstance,
  onMessage: (m: SecondInstance) => void,
  timeoutMs: number,
): Promise<Claim> {
  const dir = privateFolder(dirname(requested));
  if (dir instanceof Error) return { kind: "failed", error: dir };
  const path = join(dir, basename(requested));
  const lock = lockFile(`${path.replace(/\.sock$/, "")}.lock`);
  if (lock.kind === "unavailable") return { kind: "failed", error: lock.error };
  if (lock.kind === "held") {
    rmSync(path, { force: true }); // a socket file left by a crashed instance
    try {
      const server = await listen(path, onMessage);
      try {
        chmodSync(path, 0o600); // the folder is private already; /tmp fallbacks are not
      } catch {}
      return {
        kind: "primary",
        close() {
          server.close();
          rmSync(path, { force: true });
          closeSync(lock.fd); // releases the lock
        },
      };
    } catch (error) {
      // The lock is ours: still the only instance, just unreachable for later launches.
      console.warn("[akan-native] single-instance: holding the lock, but cannot listen for other launches:", error);
      return { kind: "primary", close: () => closeSync(lock.fd) };
    }
  }
  // Another instance holds the lock. It may not listen yet (it just started): retry until the deadline.
  const deadline = Date.now() + Math.max(timeoutMs, 3000);
  while (Date.now() < deadline) {
    try {
      const heard = await send(path, message, timeoutMs);
      if (!heard) console.warn("[akan-native] single-instance: the running instance did not answer; exiting anyway");
      return { kind: "forwarded" };
    } catch {
      await Bun.sleep(100);
    }
  }
  console.warn("[akan-native] single-instance: another instance holds the lock but cannot be reached; exiting");
  return { kind: "forwarded" };
}
