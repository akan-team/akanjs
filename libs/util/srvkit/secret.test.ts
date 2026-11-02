import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { resetEnvCache } from "akanjs/base";
import { Logger, type LoggerSinkEntry } from "akanjs/common";
import { jwtSign } from "./jwt";
import {
  assertJwtSecretConfigured,
  generateHost,
  generateHosts,
  generateJwtSecret,
  resolveJwt,
  resolveJwtSecret,
} from "./secret";

describe("assertJwtSecretConfigured", () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalAllow = process.env.AKAN_ALLOW_DERIVED_JWT_SECRET;

  afterEach(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    if (originalAllow === undefined) delete process.env.AKAN_ALLOW_DERIVED_JWT_SECRET;
    else process.env.AKAN_ALLOW_DERIVED_JWT_SECRET = originalAllow;
  });

  test("refuses a derived secret anywhere but a developer's machine", () => {
    delete process.env.JWT_SECRET;
    delete process.env.AKAN_ALLOW_DERIVED_JWT_SECRET;
    expect(() => assertJwtSecretConfigured({ operationMode: "cloud" })).toThrow("util.error.jwtSecretRequired");
    expect(() => assertJwtSecretConfigured({ operationMode: "local" })).not.toThrow();
  });

  test("accepts a secret from either channel, or an explicit acceptance of the risk", () => {
    delete process.env.AKAN_ALLOW_DERIVED_JWT_SECRET;
    process.env.JWT_SECRET = "from-env";
    expect(() => assertJwtSecretConfigured({ operationMode: "cloud" })).not.toThrow();
    delete process.env.JWT_SECRET;
    expect(() => assertJwtSecretConfigured({ operationMode: "cloud", configuredSecret: "from-config" })).not.toThrow();
    process.env.AKAN_ALLOW_DERIVED_JWT_SECRET = "1";
    expect(() => assertJwtSecretConfigured({ operationMode: "cloud" })).not.toThrow();
  });
});

describe("resolveJwtSecret", () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  test("prefers JWT_SECRET env over configured and generated secrets", () => {
    process.env.JWT_SECRET = "from-env";
    expect(resolveJwtSecret("akasys", "local", "from-config", "repo")).toBe("from-env");
  });

  test("uses configured secret when JWT_SECRET is unset", () => {
    delete process.env.JWT_SECRET;
    expect(resolveJwtSecret("akasys", "local", "from-config", "repo")).toBe("from-config");
  });

  test("falls back to generateJwtSecret with the same seed", () => {
    delete process.env.JWT_SECRET;
    expect(resolveJwtSecret("akasys", "local", undefined, "repo")).toBe(generateJwtSecret("akasys", "local", "repo"));
  });
});

describe("resolveJwt", () => {
  const secret = "resolve-jwt-test-secret";
  const publicEnv = {
    AKAN_PUBLIC_APP_NAME: "resolvejwt",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "localhost",
    AKAN_PUBLIC_ENV: "local",
    AKAN_PUBLIC_OPERATION_MODE: "local",
  };
  const originalEnv = Object.fromEntries(Object.keys(publicEnv).map((key) => [key, process.env[key]]));
  const anonymous = { appName: "resolvejwt", environment: "local" as const };
  let token = "";

  beforeAll(async () => {
    Object.assign(process.env, publicEnv);
    token = await jwtSign({ appName: "resolvejwt", environment: "local", tokenType: "access" }, secret);
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("reads a bearer credential whatever the scheme's case or the spaces before it, as /mcp does", async () => {
    for (const authorization of [`Bearer ${token}`, `bearer ${token}`, `BEARER ${token}`, `Bearer  ${token}`])
      expect(await resolveJwt(secret, authorization, anonymous)).toMatchObject({ tokenType: "access" });
  });

  test("never writes the credential into the log when it fails to verify", async () => {
    const entries: LoggerSinkEntry[] = [];
    const removeSink = Logger.addSink((entry) => void entries.push(entry));
    Logger.setLevel("verbose");
    try {
      const forged = `${token.slice(0, -4)}AAAA`;
      expect(await resolveJwt(secret, `Bearer ${forged}`, anonymous)).toBe(anonymous);
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) expect(entry.message).not.toContain(forged);
    } finally {
      removeSink();
      Logger.setLevel("info");
    }
  });

  test("stays anonymous for every header /mcp's bearer check reads no token from", async () => {
    for (const authorization of [
      undefined,
      token,
      `Basic ${token}`,
      `Bearer\t${token}`,
      ` Bearer ${token}`,
      "Bearer ",
      `Bearer ${token} trailing`,
      `Bearer ${token}\tx`,
    ])
      expect(await resolveJwt(secret, authorization, anonymous)).toBe(anonymous);
  });
});

describe("generateHosts", () => {
  const originalHostName = process.env.HOST_NAME;
  const publicKeys = [
    "AKAN_PUBLIC_APP_NAME",
    "AKAN_PUBLIC_REPO_NAME",
    "AKAN_PUBLIC_SERVE_DOMAIN",
    "AKAN_PUBLIC_ENV",
    "AKAN_PUBLIC_OPERATION_MODE",
  ] as const;
  const saved = Object.fromEntries(publicKeys.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    process.env.AKAN_PUBLIC_APP_NAME = "sceny";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "akamir.com";
    process.env.AKAN_PUBLIC_ENV = "main";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "cloud";
    delete process.env.HOST_NAME;
    resetEnvCache();
  });

  afterEach(() => {
    if (originalHostName === undefined) delete process.env.HOST_NAME;
    else process.env.HOST_NAME = originalHostName;
    for (const key of publicKeys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvCache();
  });

  test("keeps a string as one host and an array in order, with the first name canonical", () => {
    expect(generateHost({ hostname: "sceny.ai" })).toBe("sceny.ai");
    expect(generateHosts({ hostname: "sceny.ai" })).toEqual(["sceny.ai"]);
    expect(generateHosts({ hostname: [" sceny.ai ", "", "www.sceny.ai"] })).toEqual(["sceny.ai", "www.sceny.ai"]);
    expect(generateHost({ hostname: ["sceny.ai", "www.sceny.ai"] })).toBe("sceny.ai");
  });

  test("HOST_NAME replaces the declared list", () => {
    process.env.HOST_NAME = "from-env.example";
    expect(generateHosts({ hostname: ["sceny.ai", "www.sceny.ai"] })).toEqual(["from-env.example"]);
    expect(generateHost({ hostname: ["sceny.ai", "www.sceny.ai"] })).toBe("from-env.example");
  });

  test("an empty declaration falls back to the derived host", () => {
    expect(generateHosts({})).toEqual(["sceny-main.akamir.com"]);
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    resetEnvCache();
    expect(generateHosts({ hostname: null })).toEqual(["localhost"]);
    expect(generateHosts({ hostname: [] })).toEqual(["localhost"]);
  });
});
