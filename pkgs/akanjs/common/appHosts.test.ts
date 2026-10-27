import { afterEach, describe, expect, test } from "bun:test";
import { getEnv } from "akanjs/base";
import { AppHosts } from "./appHosts";

process.env.AKAN_PUBLIC_APP_NAME ??= "alpha";
process.env.AKAN_PUBLIC_REPO_NAME ??= "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "akanjs.com";

afterEach(() => {
  AppHosts.reset();
  delete process.env.AKAN_ALLOWED_HOSTS;
});

describe("AppHosts", () => {
  test("allows a declared host by name, whatever its port, case or trailing dot", () => {
    AppHosts.declare(["app.example.com", "Office.Example.com:8443", "not a host/"]);

    expect(AppHosts.allows("app.example.com")).toBe(true);
    expect(AppHosts.allows("APP.example.com:443")).toBe(true);
    expect(AppHosts.allows("app.example.com.")).toBe(true);
    expect(AppHosts.allows("office.example.com")).toBe(true);
    expect(AppHosts.allows("example.com")).toBe(false);
    expect(AppHosts.allows("app.example.com.evil.test")).toBe(false);
  });

  test("allows the platform default host, AKAN_ALLOWED_HOSTS and what the caller adds", () => {
    const { appName, environment, serveDomain } = getEnv();
    process.env.AKAN_ALLOWED_HOSTS = "desk.example.com:4300, ";

    expect(AppHosts.allows(`${appName}-${environment}.${serveDomain}`)).toBe(true);
    expect(AppHosts.allows("desk.example.com")).toBe(true);
    expect(AppHosts.allows("login.example.com", ["login.example.com"])).toBe(true);
    expect(AppHosts.allows("login.example.com")).toBe(false);
  });

  test("reads a name only from a bare host[:port]", () => {
    expect(AppHosts.nameOf("[::1]:8080")).toBe("[::1]");
    expect(AppHosts.nameOf(" App.Example.com:80 ")).toBe("app.example.com");
    for (const host of ["", "evil.test@app.example.com", "app.example.com/path", "app.example.com?q", "a b.com"])
      expect(AppHosts.nameOf(host)).toBeNull();
    expect(AppHosts.allows("evil.test@app.example.com", ["app.example.com"])).toBe(false);
  });

  test("reset forgets every declaration", () => {
    AppHosts.declare(["app.example.com"]);
    AppHosts.reset();

    expect(AppHosts.allows("app.example.com")).toBe(false);
  });
});
