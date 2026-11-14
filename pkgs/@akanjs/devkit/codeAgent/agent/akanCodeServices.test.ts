import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { AkanCodeServices } from "./AkanCodeServices";
import { akanCodePaths } from "./akanCodePaths";

const saved: Record<string, string | undefined> = {};
let home = "";

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "akan-code-services-test-"));
  for (const key of ["AKAN_CODE_HOME", "ANTHROPIC_API_KEY"]) saved[key] = process.env[key];
  process.env.AKAN_CODE_HOME = home;
  process.env.ANTHROPIC_API_KEY = "test-key-never-sent";
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const threadsOf = async (runtime: ModelRuntime) => {
  const model = runtime.getModels("anthropic")[0];
  if (!model) throw new Error("pi lists no anthropic model");
  expect(model.baseUrl).toContain("api.anthropic.com");
  const prepare = (runtime as unknown as { prepareRequest: (model: unknown, options: object) => Promise<unknown> })
    .prepareRequest;
  const prepared = (await prepare.call(runtime, model, {})) as { model: { compat?: Record<string, unknown> } };
  return prepared.model.compat?.supportsMessageThreads;
};

describe("AkanCodeServices holds the defaults akan code had on pi 1.3.0", () => {
  test("prompt caches are warmed only while a turn streams, never in the idle time between turns", () => {
    expect(AkanCodeServices.settings().getCacheWarmingMode()).toBe("streaming");
  });

  test("an Anthropic request carries the whole conversation instead of continuing a server-side thread", async () => {
    expect(await threadsOf(await AkanCodeServices.runtime(home))).toBe(false);
  });

  test("models.json can still turn Anthropic message threads on", async () => {
    mkdirSync(path.dirname(akanCodePaths.modelsFile()), { recursive: true });
    writeFileSync(
      akanCodePaths.modelsFile(),
      JSON.stringify({ providers: { anthropic: { compat: { supportsMessageThreads: true } } } }),
    );
    expect(await threadsOf(await AkanCodeServices.runtime(home))).toBe(true);
  });
});
