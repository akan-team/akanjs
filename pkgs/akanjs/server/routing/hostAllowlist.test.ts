import { afterEach, describe, expect, test } from "bun:test";
import { getEnv } from "akanjs/base";
import { AppHosts } from "akanjs/common";
import { HostAllowlist } from "./hostAllowlist";

process.env.AKAN_PUBLIC_APP_NAME ??= "alpha";
process.env.AKAN_PUBLIC_REPO_NAME ??= "akanjs";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "akanjs.com";

const withHost = (host: string | null, headers: Record<string, string> = {}) =>
  new Request("http://127.0.0.1:52345/api/user/me", { headers: host === null ? headers : { host, ...headers } });

afterEach(() => {
  AppHosts.reset();
});

describe("HostAllowlist", () => {
  test("a deployed server with AKAN_ALLOWED_HOSTS unset or blank checks nothing", () => {
    expect(HostAllowlist.fromEnv({})).toBeNull();
    expect(HostAllowlist.fromEnv({ AKAN_ALLOWED_HOSTS: " , " })).toBeNull();
    expect(HostAllowlist.fromEnv({ AKAN_PUBLIC_ENV: "main", AKAN_PUBLIC_OPERATION_MODE: "cloud" })).toBeNull();
    expect(HostAllowlist.fromEnv({ AKAN_PUBLIC_ENV: "local", AKAN_PUBLIC_OPERATION_MODE: "cloud" })).toBeNull();
  });

  test("a dev server answers loopback names, IP literals and the app's own hosts, whatever the port", () => {
    AppHosts.declare(["shop.example.com"]);
    const { appName, environment, serveDomain } = getEnv();
    for (const env of [
      { AKAN_COMMAND_TYPE: "start" },
      { AKAN_PUBLIC_ENV: "local", AKAN_PUBLIC_OPERATION_MODE: "local" },
    ]) {
      const allowlist = HostAllowlist.fromEnv(env);
      for (const host of [
        "localhost:8282",
        "LocalHost:8282",
        "admin.localhost:8282",
        "127.0.0.1:8282",
        "[::1]:8282",
        "192.168.0.12:8282",
        "shop.example.com",
        "shop.example.com:8282",
        `${appName}-${environment}.${serveDomain}:8282`,
      ])
        expect([host, allowlist?.allows(withHost(host))]).toEqual([host, true]);
      for (const host of [
        "evil.test:8282",
        "localhost.evil.test:8282",
        "evil.test@localhost:8282",
        "shop.example.com.evil.test",
      ])
        expect([host, allowlist?.allows(withHost(host))]).toEqual([host, false]);
      expect(allowlist?.allows(withHost(null))).toBe(false);
      expect(allowlist?.allows(withHost("evil.test:8282", { "x-forwarded-host": "localhost:8282" }))).toBe(false);
    }
  });

  test("a dev server's refusal names AKAN_ALLOWED_HOSTS", async () => {
    const refusal = HostAllowlist.fromEnv({ AKAN_COMMAND_TYPE: "start" })?.refuse();
    expect(refusal?.status).toBe(403);
    expect(await refusal?.text()).toContain("AKAN_ALLOWED_HOSTS");
  });

  test("admits only a listed host and port, whatever their case, and wins over a dev server's default", () => {
    for (const env of [{}, { AKAN_COMMAND_TYPE: "start" }]) {
      const allowlist = HostAllowlist.fromEnv({ ...env, AKAN_ALLOWED_HOSTS: "127.0.0.1:52345, localhost:52345" });
      expect(allowlist?.allows(withHost("127.0.0.1:52345"))).toBe(true);
      expect(allowlist?.allows(withHost("LocalHost:52345"))).toBe(true);
      expect(allowlist?.allows(withHost("attacker.example:52345"))).toBe(false);
      expect(allowlist?.allows(withHost("127.0.0.1:1"))).toBe(false);
      expect(allowlist?.allows(withHost("192.168.0.12:52345"))).toBe(false);
      expect(allowlist?.allows(withHost(null))).toBe(false);
    }
  });

  test("a forwarded host header never stands in for the Host", () => {
    const allowlist = new HostAllowlist(["127.0.0.1:52345"]);
    expect(allowlist.allows(withHost("attacker.example:52345", { "x-forwarded-host": "127.0.0.1:52345" }))).toBe(false);
    expect(allowlist.refuse().status).toBe(403);
  });
});
