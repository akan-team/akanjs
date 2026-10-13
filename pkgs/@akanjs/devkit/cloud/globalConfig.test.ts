import { describe, expect, test } from "bun:test";
import { GlobalConfig } from "./globalConfig";

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
});
