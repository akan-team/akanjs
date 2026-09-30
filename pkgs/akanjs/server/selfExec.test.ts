import { afterEach, describe, expect, test } from "bun:test";
import { SelfExec } from "./selfExec";

afterEach(() => {
  delete process.env.BUN_BE_BUN;
});

describe("SelfExec", () => {
  test("takes BUN_BE_BUN off the process env and hands it only to a spawn of this executable", () => {
    process.env.BUN_BE_BUN = "1";
    SelfExec.adopt();
    expect(process.env.BUN_BE_BUN).toBeUndefined();
    expect(SelfExec.env().BUN_BE_BUN).toBe("1");
    expect(SelfExec.env({ PATH: "/bin" })).toEqual({ PATH: "/bin", BUN_BE_BUN: "1" });
    expect(SelfExec.carried).toBe(true);

    SelfExec.adopt();
    expect(SelfExec.env().BUN_BE_BUN).toBe("1");
  });

  test("runs this executable again with the runtime flags it started with", () => {
    expect(SelfExec.command("/app/main.js", "ops", "snapshot")).toEqual([
      process.execPath,
      ...process.execArgv,
      "/app/main.js",
      "ops",
      "snapshot",
    ]);
  });
});
