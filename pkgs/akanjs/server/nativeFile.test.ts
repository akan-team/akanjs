import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Logger, type LogRecord } from "akanjs/common";
import { grantFile } from "../../@akanjs/native/packages/desktop/src/grants.ts";
import { createDesktopServer } from "../../@akanjs/native/packages/desktop/src/server.ts";
import type { AkanIpcMessage } from "../service/ipcTypes";
import { NativeFile } from "./nativeFile";

const home = mkdtempSync(path.join(tmpdir(), "akan-native-file-"));
const realSend = process.send;
const realMode = NativeFile.operationMode;
const realTimeout = NativeFile.timeoutMs;
const warnings: LogRecord[] = [];
const removeSink = Logger.addSink(
  ({ record }) => {
    if (record.name === "NativeFile") warnings.push(record);
  },
  { minLevel: "warn" },
);
beforeAll(() => {
  process.env.AKAN_NATIVE_DEV_GRANT_KEY = path.join(home, "dev-file-grant.key");
});
afterEach(() => {
  process.send = realSend;
  NativeFile.operationMode = realMode;
  NativeFile.timeoutMs = realTimeout;
  warnings.length = 0;
});
afterAll(() => {
  removeSink();
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
    await expect(NativeFile.resolve("g1", "write")).rejects.toMatchObject({
      code: "fileGrantRefused",
      statusCode: 403,
    });
    await expect(NativeFile.resolve("forged", "read")).rejects.toMatchObject({ code: "fileGrantRefused" });
    expect(warnings.map((record) => record.message)).toContain(
      "File grant refused: The file was granted to read, not to write.",
    );
  });

  test("keeps a caller inside a folder grant", async () => {
    shell({ f1: { path: "/Users/me/Footage", mode: "folder" } });
    expect(await NativeFile.resolveIn("f1", "day1/a.mp4")).toBe(path.resolve("/Users/me/Footage", "day1/a.mp4"));
    await expect(NativeFile.resolveIn("f1", "../../.ssh/id_ed25519")).rejects.toThrow("outside the folder");
    await expect(NativeFile.resolveIn("f1", "../../.ssh/id_ed25519")).rejects.toMatchObject({
      code: "fileGrantRefused",
      statusCode: 403,
    });
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
    await expect(NativeFile.resolveIn("f2", "dangling")).rejects.toMatchObject({
      code: "fileGrantRefused",
      statusCode: 403,
    });
    expect(warnings.some((record) => record.message.includes("outside the folder the user granted"))).toBe(true);
  });

  test("refuses a path the folder cannot be followed through as it refuses one outside it, not as a crash", async () => {
    const granted = path.join(home, "plain");
    mkdirSync(granted, { recursive: true });
    writeFileSync(path.join(granted, "notes.txt"), "notes");
    shell({ f3: { path: granted, mode: "folder" } });

    const refusal = await NativeFile.resolveIn("f3", "notes.txt/x").catch((error: unknown) => error);
    expect(refusal).toMatchObject({ code: "fileGrantRefused", statusCode: 403 });
    expect((refusal as Error).cause).toMatchObject({ code: "ENOTDIR" });
  });

  test("answers 503 while the desktop app does not answer for a grant", async () => {
    process.send = (() => true) as typeof process.send;
    NativeFile.timeoutMs = 20;
    await expect(NativeFile.resolve("g1", "read")).rejects.toMatchObject({
      code: "fileGrantUnavailable",
      statusCode: 503,
    });
  });

  test("resolves nothing outside a desktop app", async () => {
    process.send = undefined;
    await expect(NativeFile.resolve("g1", "read")).rejects.toThrow("only inside the desktop app that gave it");
    await expect(NativeFile.resolve("g1", "read")).rejects.toMatchObject({
      code: "desktopAppRequired",
      statusCode: 500,
    });
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
    const refused = "[server] refused no file was granted under this id";
    try {
      expect((await server.start()).ready).toBe(true);
      //? "ready" comes over IPC and the lines over stdout, so the last line can land after it.
      const until = Date.now() + 5_000;
      while (!lines.includes(refused) && Date.now() < until) await Bun.sleep(10);
    } finally {
      console.info = realInfo;
      await server.stop();
    }
    expect(lines).toContain("[server] resolved /Users/me/Movies/trip.mov");
    expect(lines).toContain(refused);
  }, 20_000);

  test("a dev build's grant resolves on akan start only, and only with this computer's signature", async () => {
    const grant = grantFile("/Users/me/Movies/trip.mov", "read", { dev: true });
    NativeFile.operationMode = () => "local";
    expect(await NativeFile.resolve(grant, "read")).toBe("/Users/me/Movies/trip.mov");
    const [head, mode, encoded] = grant.split(":");
    const elsewhere = `${head}:${mode}:${Buffer.from("/etc/passwd").toString("base64url")}:${grant.split(":")[3]}`;
    await expect(NativeFile.resolve(elsewhere, "read")).rejects.toThrow("not signed by this computer's dev build");
    await expect(NativeFile.resolve(elsewhere, "read")).rejects.toMatchObject({ code: "fileGrantRefused" });
    await expect(NativeFile.resolve(`${head}:copy:${encoded}:x`, "read")).rejects.toMatchObject({
      code: "invalidFileGrant",
      statusCode: 400,
    });
    await expect(NativeFile.resolve(`${head}:write:${encoded}:${grant.split(":")[3]}`, "write")).rejects.toThrow(
      "not signed",
    );
    NativeFile.operationMode = () => "edge";
    await expect(NativeFile.resolve(grant, "read")).rejects.toThrow("only on akan start");
    await expect(NativeFile.resolve(grant, "read")).rejects.toMatchObject({
      code: "fileGrantRefused",
      statusCode: 403,
    });
    expect(warnings.some((record) => record.message.includes("not signed by this computer's dev build"))).toBe(true);
    expect(warnings.every((record) => !record.message.includes(grant.split(":")[3] ?? "-"))).toBe(true);
  });
});
