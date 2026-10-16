import { afterEach, describe, expect, test } from "bun:test";
import { TrustedProxy } from "./TrustedProxy";

const headers = (entries: Record<string, string>) => new Headers(entries);

describe("TrustedProxy.clientAddress", () => {
  afterEach(() => TrustedProxy.reset());

  test("believes a forwarded address only from a private peer", () => {
    expect(TrustedProxy.clientAddress(headers({ "x-real-ip": "203.0.113.9" }), "127.0.0.1")).toBe("203.0.113.9");
    expect(TrustedProxy.clientAddress(headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.2" }), "10.0.0.2")).toBe(
      "203.0.113.9",
    );
    expect(TrustedProxy.clientAddress(headers({ "x-real-ip": "203.0.113.9" }), "198.51.100.7")).toBe("198.51.100.7");
  });

  test("reads an addressless socket as a local hop and an absent resolver as an unknown one", () => {
    expect(TrustedProxy.clientAddress(headers({ "x-real-ip": "203.0.113.9" }), null)).toBe("203.0.113.9");
    expect(TrustedProxy.clientAddress(headers({}), null)).toBeNull();
    expect(TrustedProxy.clientAddress(headers({ "x-real-ip": "203.0.113.9" }), undefined)).toBeNull();
  });

  test("unwraps a mapped IPv4 peer", () => {
    expect(TrustedProxy.clientAddress(headers({}), "::ffff:198.51.100.7")).toBe("198.51.100.7");
  });

  test("judges a peer again once the proxy list changes", () => {
    expect(TrustedProxy.isTrusted("203.0.113.5")).toBe(false);
    TrustedProxy.configure("203.0.113.0/24");
    expect(TrustedProxy.isTrusted("203.0.113.5")).toBe(true);
    TrustedProxy.configure("");
    expect(TrustedProxy.isTrusted("203.0.113.5")).toBe(false);
  });
});

describe("TrustedProxy.isPrivateAddress", () => {
  test("names every range an outbound fetch must not be pointed at", () => {
    for (const address of [
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "127.0.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "fd12::1",
      "fe80::1",
      "ff02::1",
      "::ffff:10.0.0.1",
      "not-an-address",
    ])
      expect(TrustedProxy.isPrivateAddress(address)).toBe(true);
    for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700::6810:84e5", "::ffff:93.184.216.34"])
      expect(TrustedProxy.isPrivateAddress(address)).toBe(false);
  });

  test("judges the address alone, never the configured proxy list", () => {
    TrustedProxy.configure("203.0.113.0/24");
    expect(TrustedProxy.isTrusted("203.0.113.9")).toBe(true);
    expect(TrustedProxy.isPrivateAddress("203.0.113.9")).toBe(false);
  });
});
