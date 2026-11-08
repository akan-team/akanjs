import { describe, expect, test } from "bun:test";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../testHelpers";
import { GlobalConfig } from "./globalConfig";

const tempHome = tempDirs("akan-global-config-");
//* A child process, so `~/.akan` resolves under the temp HOME and never the person's own.
const writeConfigUnder = async (home: string) => {
  const proc = Bun.spawn(
    [
      "bun",
      "-e",
      `await (await import(${JSON.stringify(path.join(import.meta.dir, "globalConfig.ts"))})).GlobalConfig.setTestTargets({});`,
    ],
    { env: { ...process.env, HOME: home, USERPROFILE: home }, stdout: "pipe", stderr: "pipe" },
  );
  expect(await proc.exited).toBe(0);
};
const modeOf = async (target: string) => (await stat(target)).mode & 0o777;

const workspace = (cloudHost: string | null) => ({ getConfig: async () => ({ cloudHost }) });

describe("GlobalConfig", () => {
  test("hostFor spells --host the way the workspace's cloud.host is spelled, so one login serves both", async () => {
    for (const given of ["https://cloud.example.com/", "https://Cloud.Example.com:443", "https://cloud.example.com//"])
      expect(await GlobalConfig.hostFor(workspace(null), given)).toBe("https://cloud.example.com");
    expect(await GlobalConfig.hostFor(workspace("https://cloud.example.com"), "https://cloud.example.com/")).toBe(
      await GlobalConfig.hostFor(workspace("https://cloud.example.com"), null),
    );
    expect(await GlobalConfig.hostFor(workspace(null), "https://example.com/cloud/")).toBe("https://example.com/cloud");
    expect(await GlobalConfig.hostFor(workspace(null), "http://localhost:8283/")).toBe("http://localhost:8283");
    expect(await GlobalConfig.hostFor(workspace(null))).toBe(GlobalConfig.akanCloudHost);
  });

  test.skipIf(process.platform === "win32")(
    "keeps ~/.akan to its owner: a new one is made 0700 and a looser one it owns is tightened",
    async () => {
      const fresh = await tempHome();
      await writeConfigUnder(fresh);
      expect(await modeOf(path.join(fresh, ".akan"))).toBe(0o700);
      expect(await modeOf(path.join(fresh, ".akan", "config.json"))).toBe(0o600);

      const loose = await tempHome();
      await mkdir(path.join(loose, ".akan"), { mode: 0o755 });
      await writeConfigUnder(loose);
      expect(await modeOf(path.join(loose, ".akan"))).toBe(0o700);
    },
    20_000,
  );
});
