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
      ...SelfExec.runtimeFlags(),
      "/app/main.js",
      "ops",
      "snapshot",
    ]);
    expect(SelfExec.runtimeFlags(["--no-env-file", "--use-system-ca"])).toEqual(["--no-env-file", "--use-system-ca"]);
  });

  test("leaves out the code a `bun -e` or `bun -p` process was started with", () => {
    const code = 'import("/app/server.ts")';
    expect(SelfExec.runtimeFlags(["-e", code])).toEqual([]);
    expect(SelfExec.runtimeFlags(["--no-env-file", "--eval", code, "--smol"])).toEqual(["--no-env-file", "--smol"]);
    expect(SelfExec.runtimeFlags(["--no-env-file", `--eval=${code}`])).toEqual(["--no-env-file"]);
    expect(SelfExec.runtimeFlags(["-p", "-e", "--smol"])).toEqual(["--smol"]);
    expect(SelfExec.runtimeFlags([`--print=${code}`, "--smol"])).toEqual(["--smol"]);
  });
});
