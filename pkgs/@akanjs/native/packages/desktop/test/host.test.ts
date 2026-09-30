// The plugin host around a scripted native library: ffi.ts is replaced, the wake callback is real.
// Not on Windows: a cold start's deep link registers its scheme in the user's registry there.

import { CFunction, type Pointer } from "bun:ffi";
import { afterAll, describe, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "akan-native-host-"));
const resources = join(root, "resources");
mkdirSync(join(resources, "app"), { recursive: true });
writeFileSync(
  join(resources, "boot.json"),
  JSON.stringify({ app: { id: "dev.test.host", name: "Host Test", version: "1.0.0" } }),
);
writeFileSync(join(resources, "shell.json"), JSON.stringify({ deepLinks: ["akantest"] }));
writeFileSync(join(resources, "server.json"), JSON.stringify({ env: {} }));

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const shellOps: Record<string, unknown>[] = [];
const frames: Uint8Array[] = [];
let wakePtr: Pointer | null = null;

const symbols = {
  akan_native_external_open_allowed: () => 1,
  akan_native_emit: () => {},
  akan_native_shell: (_id: bigint, json: Uint8Array) =>
    void shellOps.push(JSON.parse(decoder.decode(json.subarray(0, -1))) as Record<string, unknown>),
  akan_native_set_wake: (ptr: Pointer | null) => {
    wakePtr = ptr;
  },
  akan_native_poll: (buffer: Uint8Array, length: number) => {
    const frame = frames.shift();
    if (!frame) return 0;
    if (frame.length > length) {
      frames.unshift(frame);
      return frame.length;
    }
    buffer.set(frame);
    return frame.length;
  },
  akan_native_respond: () => {},
  akan_native_quit: () => {},
  akan_native_quit_cancel: () => {},
  akan_native_register_file: () => {},
  akan_native_unregister_file: () => 0,
};

mock.module("../src/ffi.ts", () => ({
  cstr: (text: string) => encoder.encode(`${text}\0`),
  FRAME_IPC: 1,
  FRAME_EVENT: 2,
  FRAME_HEADER: 13,
  resolvePaths: () => ({ lib: "", resources, appDir: join(resources, "app") }),
  openNative: () => ({ symbols }),
}));

const posted: Record<string, unknown>[] = [];
(globalThis as unknown as { postMessage: (message: Record<string, unknown>) => void }).postMessage = (message) =>
  void posted.push(message);

const eventFrame = (event: Record<string, unknown>) => {
  const body = encoder.encode(JSON.stringify(event));
  const frame = new Uint8Array(13 + body.length);
  frame[0] = 2;
  frame.set(body, 13);
  return frame;
};

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await Bun.sleep(10);
};

const home = { HOME: process.env.HOME, XDG_DATA_HOME: process.env.XDG_DATA_HOME };
afterAll(() => {
  for (const [key, value] of Object.entries(home)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("the plugin host", () => {
  test("a server alert raised before the shell runs waits for the shell's first frame, not for a deep link", async () => {
    // Linux: the cold start's deep link writes a desktop entry under the home folder.
    process.env.HOME = root;
    process.env.XDG_DATA_HOME = join(root, "share");
    const { startHost } = await import("../src/host.ts");
    const argv = process.argv;
    process.argv = [argv[0] ?? "bun", argv[1] ?? "test", "akantest://open/1"];
    try {
      startHost([]);
      await until(() => posted.length > 0);
    } finally {
      process.argv = argv;
    }
    expect(posted[0]).toMatchObject({ type: "ready", env: { PUBLIC_AKAN_SERVER_URL: "http://127.0.0.1:0" } });
    await Bun.sleep(50);
    expect(shellOps).toEqual([]);

    frames.push(eventFrame({ type: "window", event: "focused", value: true, window: 1 }));
    if (!wakePtr) throw new Error("the host set no wake callback");
    CFunction({ ptr: wakePtr, args: [], returns: "void" })();
    await until(() => shellOps.length > 0);
    expect(shellOps).toHaveLength(1);
    expect(shellOps[0]).toMatchObject({ op: "alert.show", tag: "akan-server", title: "Host Test" });
  });
});
