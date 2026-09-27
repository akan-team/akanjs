// The instance lock. macOS and Linux: an flock(2) on a lock file per app and user decides who runs;
// the holder keeps it open until it exits (the kernel releases it even after a crash), removes a
// stale socket and binds it; the socket only carries the second launch's message. Windows: a named
// pipe, which is both (node:net listens on pipes only, and a pipe disappears with its server).
//
// Differences from tauri-plugins-workspace/plugins/single-instance/src/platform_impl/macos.rs:
// - the files live in the per-user temporary folder ($TMPDIR on macOS, $XDG_RUNTIME_DIR on
//   Linux, both 0700) instead of /tmp, so two users of one Mac do not see each other's app
// - the lock, not the socket, decides: two launches that both found a stale socket used to both
//   remove it and bind, and both run as the first instance (plugins-workspace #3542 / #3495)
// - a launch that sees the lock taken never runs: it hands over its message, or exits anyway
// - the running instance acknowledges, so the second launch only exits once it was heard

import { dlopen, FFIType } from "bun:ffi";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, constants, openSync, rmSync } from "node:fs";
import { connect, createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SecondInstance } from "./index.ts";

const FORMAT = 1;
const ACK = "ok\n";
/** One message is a few KiB of arguments; anything larger is not from us. */
const MAX_MESSAGE = 256 * 1024;

/**
 * sun_path is 104 bytes on macOS, so the name is a short hash, not the app id. Windows pipe names
 * are one namespace for the whole PC, so the user is part of the hash there; other users cannot
 * write to a pipe they did not create (its default security), so they cannot pose as it either.
 */
export function socketPath(
  appId: string,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") {
    const hash = createHash("sha256")
      .update(`${env.USERDOMAIN ?? ""}\\${env.USERNAME ?? ""}\0${appId}`)
      .digest("hex")
      .slice(0, 16);
    return `\\\\.\\pipe\\akan-native-${hash}`;
  }
  const dir = env.XDG_RUNTIME_DIR || env.TMPDIR || tmpdir();
  const hash = createHash("sha256").update(appId).digest("hex").slice(0, 16);
  return join(dir, `akan-native-${hash}.sock`);
}

/** A named pipe disappears with its server: there is no file to protect or clean up. */
const isPipe = (path: string) => path.startsWith("\\\\.\\pipe\\");

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
  if (!isPipe(path)) return claimLocked(path, message, onMessage, timeoutMs);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const server = await listen(path, onMessage);
      try {
        if (!isPipe(path)) chmodSync(path, 0o600); // the folder is private already; /tmp fallbacks are not
      } catch {}
      return {
        kind: "primary",
        close() {
          server.close();
          if (!isPipe(path)) rmSync(path, { force: true });
        },
      };
    } catch (error) {
      if (errno(error) !== "EADDRINUSE") return { kind: "failed", error: error as Error };
    }
    try {
      const heard = await send(path, message, timeoutMs);
      if (!heard) console.warn("[akan-native] single-instance: the running instance did not answer; exiting anyway");
      return { kind: "forwarded" };
    } catch (error) {
      const code = errno(error);
      // ECONNREFUSED: a stale socket file from a crashed instance. ENOTSOCK: some other file
      // took our private name. ENOENT: the running instance just quit.
      if ((code === "ECONNREFUSED" || code === "ENOTSOCK") && !isPipe(path)) rmSync(path, { force: true });
      else if (code !== "ENOENT") return { kind: "failed", error: error as Error };
    }
  }
  return { kind: "failed", error: new Error(`could not claim ${path}`) };
}

/** macOS and Linux: whoever holds the lock file runs; the socket only carries messages. */
async function claimLocked(
  path: string,
  message: SecondInstance,
  onMessage: (m: SecondInstance) => void,
  timeoutMs: number,
): Promise<Claim> {
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
