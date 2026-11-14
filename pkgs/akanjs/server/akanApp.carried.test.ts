import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AkanError } from "akanjs/base";
import { AkanApp } from "./akanApp";

let dir = "";

afterEach(() => {
  delete process.env.BUN_BE_BUN;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = "";
});

test("a desktop app's server that asks for replicas is refused before it starts a gateway", async () => {
  dir = mkdtempSync(join(tmpdir(), "akan-carried-"));
  process.env.BUN_BE_BUN = "1";
  const app = new AkanApp(join(dir, "server.ts"), { replica: 2, runtimeDir: dir });
  const failure = await app.start().catch((error: unknown) => error);
  expect(AkanError.is(failure, "invalidConfig")).toBe(true);
  expect((failure as Error).message).toStartWith("A desktop app's server runs in one process");
});
