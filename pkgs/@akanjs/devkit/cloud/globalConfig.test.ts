import { describe, expect, test } from "bun:test";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import dayjs from "dayjs";
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
  test("needRefreshToken asks for a refresh in a token's last hour, or in the second half of a shorter life", () => {
    const token = (issuedAgoMin: number | null, expiresInMin: number) => ({
      jwt: "jwt",
      refreshToken: "refresh",
      expiresAt: dayjs().add(expiresInMin, "minute"),
      issuedAt: issuedAgoMin === null ? null : dayjs().subtract(issuedAgoMin, "minute"),
    });
    const week = 7 * 24 * 60;
    expect(GlobalConfig.needRefreshToken(token(0, 60))).toBe(false);
    expect(GlobalConfig.needRefreshToken(token(25, 35))).toBe(false);
    expect(GlobalConfig.needRefreshToken(token(35, 25))).toBe(true);
    expect(GlobalConfig.needRefreshToken(token(0, 10))).toBe(false);
    expect(GlobalConfig.needRefreshToken(token(week - 61, 61))).toBe(false);
    expect(GlobalConfig.needRefreshToken(token(week - 59, 59))).toBe(true);
    expect(GlobalConfig.needRefreshToken(token(null, 61))).toBe(false);
    expect(GlobalConfig.needRefreshToken(token(null, 59))).toBe(true);
    expect(GlobalConfig.isExpired(token(59, 1))).toBe(false);
    expect(GlobalConfig.isExpired(token(61, -1))).toBe(true);
  });

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
