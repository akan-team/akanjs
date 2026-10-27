import { describe, expect, test } from "bun:test";
import { CookieSweep } from "./cookieSweep";

describe("CookieSweep.domains", () => {
  test("lists the request host, then every strict parent with at least two labels", () => {
    expect(CookieSweep.domains("app.example.com")).toEqual(["app.example.com", "example.com"]);
    expect(CookieSweep.domains("a.b.example.com:8443")).toEqual(["a.b.example.com", "b.example.com", "example.com"]);
    expect(CookieSweep.domains("App.Example.COM.")).toEqual(["app.example.com", "example.com"]);
    expect(CookieSweep.domains("example.com")).toEqual(["example.com"]);
    expect(CookieSweep.domains("app.localhost")).toEqual(["app.localhost"]);
    expect(CookieSweep.parentDomains("app.example.com")).toEqual(["example.com"]);
    expect(CookieSweep.parentDomains("example.com")).toEqual([]);
  });

  test("keeps the four parents nearest the root, the registrable domain among them", () => {
    expect(CookieSweep.domains("a.b.c.d.e.example.com")).toEqual([
      "a.b.c.d.e.example.com",
      "c.d.e.example.com",
      "d.e.example.com",
      "e.example.com",
      "example.com",
    ]);
  });

  test("has nothing for a single label or an IP literal", () => {
    for (const host of ["localhost", "localhost:3000", "127.0.0.1", "10.0.0.5:8080", "[::1]:8080", "::1", "fe80::1"])
      expect(CookieSweep.domains(host)).toEqual([]);
  });

  test("has nothing for a host it cannot read as a hostname, or one longer than DNS allows", () => {
    const label = (length: number) => "a".repeat(length);
    for (const host of [
      "",
      "app..example.com",
      "app.example.com; Domain=evil.test",
      "app_example.com",
      `${label(64)}.example.com`,
      `${Array.from({ length: 5 }, () => label(63)).join(".")}.com`,
      `${"a.".repeat(1000)}example.com`,
    ])
      expect(CookieSweep.domains(host)).toEqual([]);
    expect(CookieSweep.domains(`${label(63)}.example.com`)).toHaveLength(2);
  });
});

describe("CookieSweep.pathPrefixes", () => {
  test("lists both spellings of every directory a cookie path could match", () => {
    expect(CookieSweep.pathPrefixes("/api/user/refresh")).toEqual([
      "/",
      "/api",
      "/api/",
      "/api/user",
      "/api/user/",
      "/api/user/refresh",
    ]);
    expect(CookieSweep.pathPrefixes("/")).toEqual(["/"]);
    expect(CookieSweep.pathPrefixes("/docs/")).toEqual(["/", "/docs", "/docs/"]);
  });

  test("stops at a character a Path attribute cannot carry", () => {
    expect(CookieSweep.pathPrefixes("/api/a;b/c")).toEqual(["/", "/api", "/api/"]);
    expect(CookieSweep.pathPrefixes("/a,b")).toEqual(["/"]);
    expect(CookieSweep.pathPrefixes("")).toEqual(["/"]);
  });

  test("caps the depth and the length it sweeps", () => {
    const deep = `/${Array.from({ length: 20 }, (_, idx) => `d${idx}`).join("/")}`;
    const prefixes = CookieSweep.pathPrefixes(deep);

    expect(prefixes).toEqual([
      "/",
      "/d0",
      "/d0/",
      "/d0/d1",
      "/d0/d1/",
      "/d0/d1/d2",
      "/d0/d1/d2/",
      "/d0/d1/d2/d3",
      "/d0/d1/d2/d3/",
    ]);
    expect(CookieSweep.pathPrefixes(`/${"x".repeat(200)}/y`)).toEqual(["/"]);
    expect(CookieSweep.pathPrefixes(`/a/${"x".repeat(200)}`)).toEqual(["/", "/a", "/a/"]);
  });
});

describe("CookieSweep.setCookies", () => {
  test("expires each name under the request host and every parent, plain and partitioned", () => {
    const cookies = CookieSweep.setCookies({ names: ["jwt:alpha"], host: "app.example.com", path: "/api/me" });

    expect(cookies).toHaveLength(2 * 4 * 2);
    expect(cookies.slice(0, 2)).toEqual([
      "jwt:alpha=; Domain=app.example.com; Path=/; Max-Age=0; Secure; SameSite=Lax",
      "jwt:alpha=; Domain=app.example.com; Path=/; Max-Age=0; Secure; SameSite=Lax; Partitioned",
    ]);
    expect(cookies).toContain("jwt:alpha=; Domain=example.com; Path=/api/; Max-Age=0; Secure; SameSite=Lax");
    expect(cookies).toContain(
      "jwt:alpha=; Domain=example.com; Path=/api/me; Max-Age=0; Secure; SameSite=Lax; Partitioned",
    );
    expect(cookies.every((cookie) => cookie.includes("; Domain="))).toBe(true);
  });

  test("expires a registrable host's own Domain copy, and nothing for a host no Domain attribute can name", () => {
    expect(CookieSweep.setCookies({ names: ["jwt:alpha"], host: "example.com", path: "/" })).toEqual([
      "jwt:alpha=; Domain=example.com; Path=/; Max-Age=0; Secure; SameSite=Lax",
      "jwt:alpha=; Domain=example.com; Path=/; Max-Age=0; Secure; SameSite=Lax; Partitioned",
    ]);
    for (const host of ["localhost:4200", "127.0.0.1", "[::1]"])
      expect(CookieSweep.setCookies({ names: ["jwt:alpha"], host, path: "/" })).toEqual([]);
  });

  test("expires no `__Host-` name, which a browser holds only host-only at the root and refuses a Domain for", () => {
    expect(
      CookieSweep.setCookies({ names: ["__Host-jwt:alpha", "jwt:alpha"], host: "app.example.com", path: "/" }),
    ).toEqual(CookieSweep.setCookies({ names: ["jwt:alpha"], host: "app.example.com", path: "/" }));
  });

  test("stays bounded whatever host and path a caller sends", () => {
    const host = `${Array.from({ length: 4 }, (_, idx) => String(idx).repeat(59)).join(".")}.example.com`;
    const cookies = CookieSweep.setCookies({
      names: ["jwt:alpha"],
      host,
      path: `/${Array.from({ length: 30 }, () => "p".repeat(40)).join("/")}`,
    });

    expect(cookies.length).toBeLessThanOrEqual(5 * 9 * 2);
    expect(cookies.reduce((bytes, cookie) => bytes + cookie.length, 0)).toBeLessThan(40_000);
  });
});
