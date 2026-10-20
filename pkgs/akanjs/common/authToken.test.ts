import { describe, expect, test } from "bun:test";
import { legacyAuthTokenKey } from "./authCookie";

Object.assign(process.env, {
  AKAN_PUBLIC_APP_NAME: "alpha",
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
  AKAN_PUBLIC_ENV: "debug",
});

const { authTokenKey, isOwnAuthToken, readAuthToken } = await import("./authToken");

const makeJwt = (payload: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

const ownJwt = makeJwt({ appName: "alpha", environment: "debug", userId: "u1" });
const neighbourJwt = makeJwt({ appName: "beta", environment: "debug", userId: "u2" });
const otherEnvJwt = makeJwt({ appName: "alpha", environment: "main", userId: "u3" });

const jarOf = (entries: Record<string, string>) => (key: string) => entries[key];

describe("authTokenKey", () => {
  test("scopes the key to this app", () => {
    expect(authTokenKey()).toBe("jwt:alpha");
    expect(legacyAuthTokenKey).toBe("jwt");
  });
});

describe("isOwnAuthToken", () => {
  test("accepts only this app and environment", () => {
    expect(isOwnAuthToken(ownJwt)).toBe(true);
    expect(isOwnAuthToken(neighbourJwt)).toBe(false);
    expect(isOwnAuthToken(otherEnvJwt)).toBe(false);
  });

  test("treats an undecodable token as not ours instead of throwing", () => {
    expect(isOwnAuthToken("not-a-jwt")).toBe(false);
  });
});

describe("readAuthToken", () => {
  test("prefers the scoped key", () => {
    expect(readAuthToken(jarOf({ "jwt:alpha": ownJwt, jwt: neighbourJwt }))).toBe(ownJwt);
  });

  test("falls back to the pre-scoping key only when the token names this app", () => {
    expect(readAuthToken(jarOf({ jwt: ownJwt }))).toBe(ownJwt);
    expect(readAuthToken(jarOf({ jwt: neighbourJwt }))).toBeUndefined();
  });

  test("never reads a neighbour's scoped key", () => {
    expect(readAuthToken(jarOf({ "jwt:beta": neighbourJwt }))).toBeUndefined();
  });
});
