import { afterEach, describe, expect, test } from "bun:test";
import { resetEnvCache } from "akanjs/base";
import { RedisCache } from "./cache.adaptor";

const envKeys = [
  "REDIS_URI",
  "REDIS_HOST",
  "AKAN_PUBLIC_ENV",
  "AKAN_PUBLIC_OPERATION_MODE",
  "AKAN_PUBLIC_APP_NAME",
  "AKAN_PUBLIC_REPO_NAME",
  "AKAN_PUBLIC_SERVE_DOMAIN",
] as const;
const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

const useEnv = (env: Partial<Record<(typeof envKeys)[number], string>>) => {
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, {
    AKAN_PUBLIC_APP_NAME: "probe",
    AKAN_PUBLIC_REPO_NAME: "repo",
    AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
    ...env,
  });
  resetEnvCache();
};

describe("RedisCache.resolveUrl", () => {
  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    resetEnvCache();
  });

  test("[C-7] a deployed app without REDIS_URI refuses to boot instead of guessing a host", () => {
    useEnv({ AKAN_PUBLIC_ENV: "main", AKAN_PUBLIC_OPERATION_MODE: "cloud" });
    expect(() => RedisCache.resolveUrl()).toThrow("REDIS_URI");
  });

  test("REDIS_URI names the server wherever the app runs", () => {
    useEnv({
      AKAN_PUBLIC_ENV: "main",
      AKAN_PUBLIC_OPERATION_MODE: "cloud",
      REDIS_URI: "rediss://user:pw@cache:6380/2",
    });
    expect(RedisCache.resolveUrl()).toBe("rediss://user:pw@cache:6380/2");
  });

  test("local development falls back to localhost, and a tunnel names its own end", () => {
    useEnv({ AKAN_PUBLIC_ENV: "local" });
    expect(RedisCache.resolveUrl()).toBe("redis://localhost:6379");
    useEnv({ AKAN_PUBLIC_ENV: "debug", AKAN_PUBLIC_OPERATION_MODE: "local", REDIS_HOST: "localhost:40123" });
    expect(RedisCache.resolveUrl()).toBe("redis://localhost:40123");
  });
});
