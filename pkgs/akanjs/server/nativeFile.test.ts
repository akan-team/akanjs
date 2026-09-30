import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { grantFile } from "../../@akanjs/native/packages/desktop/src/grants.ts";
import { createDesktopServer } from "../../@akanjs/native/packages/desktop/src/server.ts";
import type { AkanIpcMessage } from "../service/ipcTypes";
import { NativeFile } from "./nativeFile";

const home = mkdtempSync(path.join(tmpdir(), "akan-native-file-"));
const realSend = process.send;
const realMode = NativeFile.operationMode;
beforeAll(() => {
  process.env.AKAN_NATIVE_DEV_GRANT_KEY = path.join(home, "dev-file-grant.key");
});
afterEach(() => {
  process.send = realSend;
  NativeFile.operationMode = realMode;
});
afterAll(() => {
  delete process.env.AKAN_NATIVE_DEV_GRANT_KEY;
  rmSync(home, { recursive: true, force: true });
});

/** Plays the desktop shell: answers each file.resolve from `granted`, as packages/desktop/src/server.ts does. */
const shell = (granted: Record<string, { path: string; mode: "read" | "write" | "folder" }>) => {
  const asked: string[] = [];
  process.send = ((message: AkanIpcMessage) => {
    if (message.type !== "file.resolve") return true;
    asked.push(message.grant);
    const found = granted[message.grant];
    queueMicrotask(() =>
      process.emit(
        "message" as never,
        (found
          ? { type: "file.resolved", id: message.id, ...found }
          : { type: "file.resolved", id: message.id, error: "no file was granted under this id" }) as never,
      ),
    );
    return true;
  }) as typeof process.send;
  return asked;
};

describe("NativeFile", () => {
  test("asks the desktop app for the path behind a grant, for the use it was granted", async () => {
    const asked = shell({ g1: { path: "/Users/me/Movies/trip.mov", mode: "read" } });
    expect(await NativeFile.resolve("g1", "read")).toBe("/Users/me/Movies/trip.mov");
    expect(asked).toEqual(["g1"]);
    await expect(NativeFile.resolve("g1", "write")).rejects.toThrow("granted to read, not to write");
    await expect(NativeFile.resolve("forged", "read")).rejects.toThrow("no file was granted under this id");
  });

  test("keeps a caller inside a folder grant", async () => {
    shell({ f1: { path: "/Users/me/Footage", mode: "folder" } });
    expect(await NativeFile.resolveIn("f1", "day1/a.mp4")).toBe(path.resolve("/Users/me/Footage", "day1/a.mp4"));
    await expect(NativeFile.resolveIn("f1", "../../.ssh/id_ed25519")).rejects.toThrow("outside the folder");
  });

  test("a name that starts with two dots is inside, and a link in the folder cannot reach out of it", async () => {
    const granted = path.join(home, "granted");
    const outside = path.join(home, "outside");
    mkdirSync(path.join(granted, "..cache"), { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(outside, "secret.txt"), "secret");
    symlinkSync(outside, path.join(granted, "link"), "junction");
    symlinkSync(path.join(home, "nowhere"), path.join(granted, "dangling"), "junction");
    symlinkSync(path.join(granted, "..cache"), path.join(granted, "inner"), "junction");
    shell({ f2: { path: granted, mode: "folder" } });

    expect(await NativeFile.resolveIn("f2", "..cache/x")).toBe(path.join(granted, "..cache", "x"));
    expect(await NativeFile.resolveIn("f2", "inner/x")).toBe(path.join(granted, "inner", "x"));
    await expect(NativeFile.resolveIn("f2", "link/secret.txt")).rejects.toThrow("outside the folder");
    await expect(NativeFile.resolveIn("f2", "link/new/file.txt")).rejects.toThrow("outside the folder");
    await expect(NativeFile.resolveIn("f2", "dangling")).rejects.toThrow("a link to nothing");
  });

  test("resolves nothing outside a desktop app", async () => {
    process.send = undefined;
    await expect(NativeFile.resolve("g1", "read")).rejects.toThrow("only inside the desktop app that gave it");
  });

  test("the carried server gets the path from the real shell over its IPC channel", async () => {
    const resources = path.join(home, "Resources");
    mkdirSync(path.join(resources, "server"), { recursive: true });
    writeFileSync(path.join(resources, "server.bunfig.toml"), "");
    writeFileSync(
      path.join(resources, "server", "main.js"),
      `import { NativeFile } from ${JSON.stringify(path.join(import.meta.dir, "nativeFile.ts"))};
for (const grant of process.env.TEST_GRANTS.split(",")) {
  await NativeFile.resolve(grant, "read").then((file) => console.info("resolved", file), (error) => console.info("refused", error.message));
}
process.send({ type: "ready", pid: process.pid });`,
    );
    const lines: string[] = [];
    const realInfo = console.info;
    console.info = (...args: unknown[]) => void lines.push(args.join(" "));
    const grant = grantFile("/Users/me/Movies/trip.mov", "read");
    const server = createDesktopServer({
      resources,
      dataDir: path.join(home, "data", "server"),
      manifest: { entry: "main.js", env: { TEST_GRANTS: `${grant},forged` } },
      freePort: async () => 1,
    });
    try {
      expect((await server.start()).ready).toBe(true);
    } finally {
      console.info = realInfo;
      await server.stop();
    }
    expect(lines).toContain("[server] resolved /Users/me/Movies/trip.mov");
    expect(lines).toContain("[server] refused no file was granted under this id");
  }, 20_000);

  test("a dev build's grant resolves on akan start only, and only with this computer's signature", async () => {
    const grant = grantFile("/Users/me/Movies/trip.mov", "read", { dev: true });
    NativeFile.operationMode = () => "local";
    expect(await NativeFile.resolve(grant, "read")).toBe("/Users/me/Movies/trip.mov");
    const [head, mode, encoded] = grant.split(":");
    const elsewhere = `${head}:${mode}:${Buffer.from("/etc/passwd").toString("base64url")}:${grant.split(":")[3]}`;
    await expect(NativeFile.resolve(elsewhere, "read")).rejects.toThrow("not signed by this computer's dev build");
    await expect(NativeFile.resolve(`${head}:write:${encoded}:${grant.split(":")[3]}`, "write")).rejects.toThrow(
      "not signed",
    );
    NativeFile.operationMode = () => "edge";
    await expect(NativeFile.resolve(grant, "read")).rejects.toThrow("only on akan start");
  });
});
