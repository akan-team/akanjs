import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as base from "akanjs/base";
import { legacyAuthTokenKey } from "./authCookie";
import { CookieJar } from "./cookieJar";

Object.assign(process.env, {
  AKAN_PUBLIC_APP_NAME: "alpha",
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
  AKAN_PUBLIC_ENV: "debug",
  AKAN_PUBLIC_OPERATION_MODE: "cloud",
});

const { authTokenKey, isOwnAuthToken, readAuthToken, readSessionToken, retiredAuthTokenKeys } = await import(
  "./authToken"
);

const makeJwt = (payload: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

const ownJwt = makeJwt({ appName: "alpha", environment: "debug", userId: "u1" });
const neighbourJwt = makeJwt({ appName: "beta", environment: "debug", userId: "u2" });
const otherEnvJwt = makeJwt({ appName: "alpha", environment: "main", userId: "u3" });

const jarOf = (entries: Record<string, string>) => (key: string) => entries[key];
const key = "__Host-jwt:alpha";

const runLocal = () => {
  const env = base.getEnv();
  return spyOn(base, "getEnv").mockReturnValue({ ...env, operationMode: "local" });
};

afterEach(() => {
  (base.getEnv as unknown as { mockRestore?: () => void }).mockRestore?.();
});

describe("authTokenKey", () => {
  test("scopes the key to this app and holds it to this host outside local", () => {
    expect(base.getEnv().operationMode).toBe("cloud");
    expect(authTokenKey()).toBe(key);
    expect(legacyAuthTokenKey).toBe("jwt");
  });

  test("drops `__Host-` on a local server, which plain http cannot give the Secure it needs", () => {
    runLocal();
    expect(authTokenKey()).toBe("jwt:alpha");
  });
});

describe("retiredAuthTokenKeys", () => {
  test("names every earlier spelling of the session cookie, never the current one", () => {
    expect(retiredAuthTokenKeys()).toEqual(["jwt", "jwt:alpha"]);
    runLocal();
    expect(retiredAuthTokenKeys()).toEqual(["jwt"]);
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

describe("readSessionToken", () => {
  test("reads nothing from a jar without the scoped key", () => {
    expect(readSessionToken(CookieJar.parse(""))).toEqual({});
    expect(readSessionToken(CookieJar.parse("theme=dark; __Host-jwt:beta=x"))).toEqual({});
  });

  test("reads the one scoped cookie", () => {
    expect(readSessionToken(CookieJar.parse(`theme=dark; ${key}=${ownJwt}`))).toEqual({ token: ownJwt });
  });

  test("reads no token from a duplicated scoped cookie, in either order", () => {
    const duplicate = { name: key, count: 2 };
    expect(readSessionToken(CookieJar.parse(`${key}=${ownJwt}; ${key}=${neighbourJwt}`))).toEqual({ duplicate });
    expect(readSessionToken(CookieJar.parse(`${key}=${neighbourJwt}; ${key}=${ownJwt}`))).toEqual({ duplicate });
    expect(readSessionToken(CookieJar.parse(`${key}=a; ${key}=a; ${key}=a`))).toEqual({
      duplicate: { name: key, count: 3 },
    });
  });

  test("never reads a retired key, alone or beside the current one", () => {
    expect(readSessionToken(CookieJar.parse(`jwt=${ownJwt}`))).toEqual({});
    expect(readSessionToken(CookieJar.parse(`jwt:alpha=${ownJwt}`))).toEqual({});
    expect(readSessionToken(CookieJar.parse(`jwt=${neighbourJwt}; jwt:alpha=x; ${key}=${ownJwt}`))).toEqual({
      token: ownJwt,
    });
  });
});

describe("readAuthToken", () => {
  test("reads the scoped key", () => {
    expect(readAuthToken(jarOf({ [key]: ownJwt, jwt: neighbourJwt }))).toBe(ownJwt);
  });

  test("no longer falls back to the pre-scoping key", () => {
    expect(readAuthToken(jarOf({ jwt: ownJwt }))).toBeUndefined();
    expect(readAuthToken(jarOf({ "jwt:alpha": ownJwt }))).toBeUndefined();
  });

  test("never reads a neighbour's scoped key", () => {
    expect(readAuthToken(jarOf({ "__Host-jwt:beta": neighbourJwt }))).toBeUndefined();
  });
});
