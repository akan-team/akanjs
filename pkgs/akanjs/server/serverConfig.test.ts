import { afterEach, describe, expect, test } from "bun:test";
import { ServerConfig } from "./serverConfig";

const saved = { child: process.env.AKAN_CHILD_SOCKET, command: process.env.AKAN_COMMAND_TYPE };

afterEach(() => {
  for (const [key, value] of [
    ["AKAN_CHILD_SOCKET", saved.child],
    ["AKAN_COMMAND_TYPE", saved.command],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("the export flush budget at shutdown", () => {
  test("a gateway child gets what is left of the gateway's wait after the log close, never more than the cap", () => {
    process.env.AKAN_CHILD_SOCKET = "/tmp/akan-test.sock";
    process.env.AKAN_COMMAND_TYPE = "start";
    const now = Date.now();

    expect(ServerConfig.exportFlushBudgetMs(now, 1_500)).toBe(1_500);
    expect(ServerConfig.exportFlushBudgetMs(now - 3_000, 1_500)).toBeLessThanOrEqual(750);
    expect(ServerConfig.exportFlushBudgetMs(now - 3_000, 1_500)).toBeGreaterThan(700);
    expect(ServerConfig.exportFlushBudgetMs(now - 5_000, 1_500)).toBe(0);
  });

  test("a solo server, which no gateway waits on, keeps the cap", () => {
    delete process.env.AKAN_CHILD_SOCKET;
    process.env.AKAN_COMMAND_TYPE = "start";

    expect(ServerConfig.exportFlushBudgetMs(Date.now() - 3_000, 1_500)).toBe(1_500);
  });
});
