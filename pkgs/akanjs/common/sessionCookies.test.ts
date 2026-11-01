import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { CookieJar } from "./cookieJar";
import { Logger, type LoggerSinkEntry } from "./Logger";

Object.assign(process.env, {
  AKAN_PUBLIC_APP_NAME: "alpha",
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "example.com",
  AKAN_PUBLIC_ENV: "debug",
  AKAN_PUBLIC_OPERATION_MODE: "cloud",
});

const { SessionCookies } = await import("./sessionCookies");

const records: LoggerSinkEntry[] = [];
const removeSink = Logger.addSink((entry) => void records.push(entry), { minLevel: "warn" });

afterEach(() => {
  records.length = 0;
});
afterAll(() => removeSink());

describe("SessionCookies", () => {
  test("watches the app's auth key and every name a library registers, once each", () => {
    SessionCookies.watch("ssoState");
    SessionCookies.watch(() => `refresh:${process.env.AKAN_PUBLIC_APP_NAME}`);
    SessionCookies.watch("ssoState");

    expect(SessionCookies.names()).toEqual(["__Host-jwt:alpha", "ssoState", "refresh:alpha"]);
  });

  test("finds only the watched names sent more than once", () => {
    const jar = CookieJar.parse(
      "__Host-jwt:alpha=a; theme=x; theme=y; ssoState=s; __Host-jwt:alpha=b; jwt:alpha=r; jwt:alpha=r; __Host-jwt:alpha=c",
    );

    expect(SessionCookies.duplicatesIn(jar)).toEqual([{ name: "__Host-jwt:alpha", count: 3 }]);
    expect(SessionCookies.duplicatesIn(CookieJar.parse("__Host-jwt:alpha=a; ssoState=s"))).toEqual([]);
  });

  test("reports a duplicate by name, count and host, never by value", () => {
    const secretValue = "header.payload-that-must-not-leak.signature";
    const jar = CookieJar.parse(`__Host-jwt:alpha=${secretValue}; __Host-jwt:alpha=other-${secretValue}`);

    SessionCookies.report(SessionCookies.duplicatesIn(jar), "app.example.com");

    expect(records).toHaveLength(1);
    expect(records[0]?.record.attrs).toEqual({ name: "__Host-jwt:alpha", count: 2, host: "app.example.com" });
    expect(JSON.stringify(records[0])).not.toContain("payload-that-must-not-leak");
  });

  test("cuts a long host down before it reaches the log", () => {
    const host = `${"a.".repeat(500)}example.com`;

    SessionCookies.report([{ name: "__Host-jwt:alpha", count: 2 }], host);

    expect(records[0]?.record.attrs?.host).toBe(host.slice(0, 100));
  });

  test("sweeps the duplicated names under the request host and its parent domains", () => {
    expect(SessionCookies.sweepOf([{ name: "ssoState", count: 2 }], "app.example.com", "/")).toEqual([
      "ssoState=; Domain=app.example.com; Path=/; Max-Age=0; Secure; SameSite=Lax",
      "ssoState=; Domain=app.example.com; Path=/; Max-Age=0; Secure; SameSite=Lax; Partitioned",
      "ssoState=; Domain=example.com; Path=/; Max-Age=0; Secure; SameSite=Lax",
      "ssoState=; Domain=example.com; Path=/; Max-Age=0; Secure; SameSite=Lax; Partitioned",
    ]);
    expect(SessionCookies.sweepOf([{ name: "__Host-jwt:alpha", count: 2 }], "app.example.com", "/")).toEqual([]);
    expect(SessionCookies.sweepOf([], "app.example.com", "/")).toEqual([]);
  });
});
