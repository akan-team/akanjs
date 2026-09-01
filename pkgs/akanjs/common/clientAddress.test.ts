import { describe, expect, test } from "bun:test";
import { clientAddressFromHeaders, clientPortFromHeaders, normalizeIpAddress } from "./clientAddress";

describe("normalizeIpAddress", () => {
  test("unwraps an IPv4-mapped address, which no udp4 socket accepts", () => {
    expect(normalizeIpAddress("::ffff:203.0.113.10")).toBe("203.0.113.10");
    expect(normalizeIpAddress("::FFFF:127.0.0.1")).toBe("127.0.0.1");
  });

  test("leaves a real IPv6 address alone", () => {
    expect(normalizeIpAddress("2001:db8::1")).toBe("2001:db8::1");
    expect(normalizeIpAddress("::1")).toBe("::1");
  });

  test("leaves a plain IPv4 address alone and trims it", () => {
    expect(normalizeIpAddress(" 203.0.113.10 ")).toBe("203.0.113.10");
  });
});

describe("clientAddressFromHeaders", () => {
  test("prefers x-real-ip, which is one hop's word for who the client is", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.10", "x-forwarded-for": "198.51.100.7, 10.0.0.5" });
    expect(clientAddressFromHeaders(headers)).toBe("203.0.113.10");
  });

  test("takes the first x-forwarded-for entry, since the chain appends left to right", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.5, 10.0.0.6" });
    expect(clientAddressFromHeaders(headers)).toBe("203.0.113.10");
  });

  test("normalizes whichever header it read", () => {
    expect(clientAddressFromHeaders(new Headers({ "x-real-ip": "::ffff:203.0.113.10" }))).toBe("203.0.113.10");
    expect(clientAddressFromHeaders(new Headers({ "x-forwarded-for": "::ffff:203.0.113.10, 10.0.0.5" }))).toBe(
      "203.0.113.10",
    );
  });

  test("returns null rather than a placeholder when nothing proxied the call", () => {
    expect(clientAddressFromHeaders(new Headers())).toBeNull();
    expect(clientAddressFromHeaders(new Headers({ "x-real-ip": "  " }))).toBeNull();
    expect(clientAddressFromHeaders(new Headers({ "x-forwarded-for": " , 10.0.0.5" }))).toBeNull();
  });
});

describe("clientPortFromHeaders", () => {
  test("reads a valid port and refuses anything outside the range", () => {
    expect(clientPortFromHeaders(new Headers({ "x-forwarded-port": "54321" }))).toBe(54321);
    expect(clientPortFromHeaders(new Headers({ "x-forwarded-port": "0" }))).toBeNull();
    expect(clientPortFromHeaders(new Headers({ "x-forwarded-port": "70000" }))).toBeNull();
    expect(clientPortFromHeaders(new Headers({ "x-forwarded-port": "abc" }))).toBeNull();
    expect(clientPortFromHeaders(new Headers())).toBeNull();
  });
});
