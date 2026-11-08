import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RotatingLogWriter } from "./rotatingLogWriter";

const akanApp = { appName: "akan", environment: "local", operationMode: "local" };

describe("RotatingLogWriter", () => {
  let tmp = "";
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "akan-logs-"));
  });
  afterEach(() => rm(tmp, { recursive: true, force: true }));

  test("rotates by size and sanitizes filename parts", async () => {
    const writer = new RotatingLogWriter({
      logDir: tmp,
      appName: "my/app",
      environment: "local env",
      operationMode: "local",
      maxSizeBytes: 10,
      now: () => new Date(2026, 4, 25, 10),
    });

    writer.write("gateway", "12345\n");
    writer.write("gateway", "67890\n");
    await writer.close();

    expect((await readdir(tmp)).sort()).toEqual([
      "my_app-local_env-local-2026-05-25-gateway-0001.log",
      "my_app-local_env-local-2026-05-25-gateway-0002.log",
    ]);
  });

  test("rotates by local date", async () => {
    let now = new Date(2026, 4, 25, 23);
    const writer = new RotatingLogWriter({ logDir: tmp, ...akanApp, maxSizeBytes: 1024, now: () => now });

    writer.write("0-federation", "before\n");
    now = new Date(2026, 4, 26, 0);
    writer.write("0-federation", "after\n");
    await writer.close();

    expect((await readdir(tmp)).sort()).toEqual([
      "akan-local-local-2026-05-25-0-federation-0001.log",
      "akan-local-local-2026-05-26-0-federation-0001.log",
    ]);
  });

  test("continues with the next sequence on restart", async () => {
    const options = { logDir: tmp, ...akanApp, maxSizeBytes: 1024, now: () => new Date(2026, 4, 25, 10) };

    const first = new RotatingLogWriter(options);
    first.write("gateway", "first\n");
    await first.close();

    const second = new RotatingLogWriter(options);
    second.write("gateway", "second\n");
    await second.close();

    expect((await readdir(tmp)).sort()).toEqual([
      "akan-local-local-2026-05-25-gateway-0001.log",
      "akan-local-local-2026-05-25-gateway-0002.log",
    ]);
  });

  test.skipIf(process.platform === "win32")("creates each log file readable by its owner only", async () => {
    const now = () => new Date(2026, 4, 25, 10);
    const writer = new RotatingLogWriter({ logDir: tmp, ...akanApp, maxSizeBytes: 1024, now });
    writer.write("gateway", "private\n");
    await writer.close();
    const shared = new RotatingLogWriter({ logDir: tmp, ...akanApp, maxSizeBytes: 1024, fileMode: 0o640, now });
    shared.write("0-federation", "shared\n");
    await shared.close();
    const modeOf = async (name: string) => (await stat(join(tmp, name))).mode & 0o777;
    expect(await modeOf("akan-local-local-2026-05-25-gateway-0001.log")).toBe(0o600);
    expect(await modeOf("akan-local-local-2026-05-25-0-federation-0001.log")).toBe(0o640);
  });

  test("keeps retention per process key", async () => {
    const writer = new RotatingLogWriter({
      logDir: tmp,
      ...akanApp,
      maxSizeBytes: 5,
      maxFiles: 2,
      now: () => new Date(2026, 4, 25, 10),
    });

    writer.write("gateway", "11111\n");
    writer.write("gateway", "22222\n");
    writer.write("gateway", "33333\n");
    writer.write("0-federation", "child\n");
    await writer.close();

    expect((await readdir(tmp)).sort()).toEqual([
      "akan-local-local-2026-05-25-0-federation-0001.log",
      "akan-local-local-2026-05-25-gateway-0002.log",
      "akan-local-local-2026-05-25-gateway-0003.log",
    ]);
  });
});
