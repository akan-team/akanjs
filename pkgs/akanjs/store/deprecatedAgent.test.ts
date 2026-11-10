import "../test/registerDom";
import { beforeAll, describe, expect, test } from "bun:test";
import * as agent from "./agent";
import { setTestEnv } from "./store.fixture";

//? The barrel builds the base store at import, which reads the public env.
let store: typeof import("./index");
beforeAll(async () => {
  setTestEnv("deprecated-agent");
  store = await import("./index");
});

describe("akanjs/store/agent", () => {
  test("akanjs/store still re-exports each agent runtime value, as the same binding, for one minor", () => {
    const runtime = Object.entries(agent);
    expect(runtime.length).toBeGreaterThan(10);
    const reexported = store as unknown as Record<string, unknown>;
    expect(runtime.filter(([name, value]) => reexported[name] !== value).map(([name]) => name)).toEqual([]);
  });

  test("the tool authoring API stays in akanjs/store, outside the agent runtime", () => {
    expect(store.ToolReturn).toBeDefined();
    expect(store.AgentAbort).toBeDefined();
    expect(store.AgentProgress).toBeDefined();
    expect(Object.keys(agent)).not.toContain("ToolReturn");
  });
});
