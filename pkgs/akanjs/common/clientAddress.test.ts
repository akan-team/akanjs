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
  const privateOnly = (address: string) => /^10\./.test(address);

  test("walks x-forwarded-for from the nearest hop and stops at the first address nothing vouches for", () => {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.7, 203.0.113.9, 10.0.0.5, 10.0.0.6" });
    expect(clientAddressFromHeaders(headers, privateOnly)).toBe("203.0.113.9");
  });

  test("answers the leftmost entry when every hop is vouched for", () => {
    const headers = new Headers({ "x-forwarded-for": "10.0.0.4, 10.0.0.5" });
    expect(clientAddressFromHeaders(headers, privateOnly)).toBe("10.0.0.4");
  });

  test("without a judge reads x-real-ip, else the leftmost x-forwarded-for entry", () => {
    const both = new Headers({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "203.0.113.9, 10.0.0.5" });
    expect(clientAddressFromHeaders(both)).toBe("198.51.100.1");
    const chain = new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.5, 10.0.0.6" });
    expect(clientAddressFromHeaders(chain)).toBe("203.0.113.10");
  });

  test("without a judge passes over an x-real-ip that is not an address, but never past a bad leftmost entry", () => {
    const badRealIp = new Headers({ "x-real-ip": "<script>", "x-forwarded-for": "203.0.113.9, 10.0.0.5" });
    expect(clientAddressFromHeaders(badRealIp)).toBe("203.0.113.9");
    expect(clientAddressFromHeaders(new Headers({ "x-forwarded-for": "garbage, 203.0.113.9" }))).toBeNull();
  });

  test("prefers x-forwarded-for over x-real-ip, which counts only when there is no chain", () => {
    const both = new Headers({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "203.0.113.9, 10.0.0.5" });
    expect(clientAddressFromHeaders(both, privateOnly)).toBe("203.0.113.9");
    expect(clientAddressFromHeaders(new Headers({ "x-real-ip": "198.51.100.1" }), privateOnly)).toBe("198.51.100.1");
  });

  test("reads a hop recorded with its port or in brackets", () => {
    expect(
      clientAddressFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9:4711, 10.0.0.5" }), privateOnly),
    ).toBe("203.0.113.9");
    expect(clientAddressFromHeaders(new Headers({ "x-forwarded-for": "[2001:db8::7]:443" }), privateOnly)).toBe(
      "2001:db8::7",
    );
  });

  test("ends the walk at a hop that names no address, answering the nearest one it read", () => {
    const behind = new Headers({ "x-forwarded-for": "198.51.100.7, unknown, 10.0.0.5" });
    expect(clientAddressFromHeaders(behind, privateOnly)).toBe("10.0.0.5");
    const nearest = new Headers({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "198.51.100.7, garbage" });
    expect(clientAddressFromHeaders(nearest, privateOnly)).toBe("198.51.100.1");
    expect(clientAddressFromHeaders(new Headers({ "x-forwarded-for": "garbage" }), privateOnly)).toBeNull();
  });

  test("ignores an x-real-ip that is not an address", () => {
    expect(clientAddressFromHeaders(new Headers({ "x-real-ip": "<script>" }))).toBeNull();
    expect(clientAddressFromHeaders(new Headers({ "x-real-ip": "203.0.113.9:80" }))).toBe("203.0.113.9");
    expect(
      clientAddressFromHeaders(new Headers({ "x-real-ip": "::1%<script>", "x-forwarded-for": "2001:DB8::7" })),
    ).toBe("2001:db8::7");
    expect(clientAddressFromHeaders(new Headers({ "x-forwarded-for": "010.0.0.1, 10.0.0.5" }), privateOnly)).toBe(
      "10.0.0.5",
    );
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
    expect(clientAddressFromHeaders(new Headers({ "x-forwarded-for": " , " }))).toBeNull();
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
