import { describe, expect, test } from "bun:test";
import { HostAllowlist } from "./hostAllowlist";

const withHost = (host: string | null, headers: Record<string, string> = {}) =>
  new Request("http://127.0.0.1:52345/api/user/me", { headers: host === null ? headers : { host, ...headers } });

describe("HostAllowlist", () => {
  test("an unset or blank AKAN_ALLOWED_HOSTS checks nothing", () => {
    expect(HostAllowlist.fromEnv({})).toBeNull();
    expect(HostAllowlist.fromEnv({ AKAN_ALLOWED_HOSTS: " , " })).toBeNull();
  });

  test("admits only a listed host and port, whatever their case", () => {
    const allowlist = HostAllowlist.fromEnv({ AKAN_ALLOWED_HOSTS: "127.0.0.1:52345, localhost:52345" });
    expect(allowlist?.allows(withHost("127.0.0.1:52345"))).toBe(true);
    expect(allowlist?.allows(withHost("LocalHost:52345"))).toBe(true);
    expect(allowlist?.allows(withHost("attacker.example:52345"))).toBe(false);
    expect(allowlist?.allows(withHost("127.0.0.1:1"))).toBe(false);
    expect(allowlist?.allows(withHost(null))).toBe(false);
  });

  test("a forwarded host header never stands in for the Host", () => {
    const allowlist = new HostAllowlist(["127.0.0.1:52345"]);
    expect(allowlist.allows(withHost("attacker.example:52345", { "x-forwarded-host": "127.0.0.1:52345" }))).toBe(false);
    expect(allowlist.refuse().status).toBe(403);
  });
});
