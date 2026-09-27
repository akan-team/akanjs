import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Logger, type LoggerSinkEntry } from "akanjs/common";
import { jwtSign } from "./jwt";
import { generateJwtSecret, resolveJwt, resolveJwtSecret } from "./secret";

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
    for (const authorization of [
      `Bearer ${token}`,
      `bearer ${token}`,
      `BEARER ${token}`,
      `Bearer  ${token}`,
      `Bearer ${token} trailing`,
    ])
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
    for (const authorization of [undefined, token, `Basic ${token}`, `Bearer\t${token}`, ` Bearer ${token}`, "Bearer "])
      expect(await resolveJwt(secret, authorization, anonymous)).toBe(anonymous);
  });
});
