import { describe, expect, test } from "bun:test";
import { IpLiteral } from "./IpLiteral";

describe("IpLiteral.parse", () => {
  test("takes a bare address, unwrapping an IPv4-mapped one", () => {
    expect(IpLiteral.parse(" 203.0.113.9 ")).toBe("203.0.113.9");
    expect(IpLiteral.parse("2001:db8::1")).toBe("2001:db8::1");
    expect(IpLiteral.parse("::ffff:203.0.113.9")).toBe("203.0.113.9");
  });

  test("drops the port a proxy may record beside the address", () => {
    expect(IpLiteral.parse("203.0.113.9:4711")).toBe("203.0.113.9");
    expect(IpLiteral.parse("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(IpLiteral.parse("[2001:db8::1]")).toBe("2001:db8::1");
  });

  test("refuses anything that is not an address", () => {
    for (const entry of ["", "unknown", "_hidden", "203.0.113", "203.0.113.256", "[203.0.113.9]", "1::2::3", "a b"])
      expect(IpLiteral.parse(entry)).toBeNull();
  });

  test("answers one spelling per address, whatever spelling arrived", () => {
    expect(IpLiteral.parse("2001:0DB8:0000:0000:0000:0000:0000:0001")).toBe("2001:db8::1");
    expect(IpLiteral.parse("2001:db8:0:0:1:0:0:1")).toBe("2001:db8::1:0:0:1");
    expect(IpLiteral.parse("2001:db8:0:1:1:1:1:1")).toBe("2001:db8:0:1:1:1:1:1");
    expect(IpLiteral.parse("0:0:0:0:0:0:0:1")).toBe("::1");
    expect(IpLiteral.parse("0::0")).toBe("::");
    expect(IpLiteral.parse("fe80:0:0:0:0:0:0:0")).toBe("fe80::");
    expect(IpLiteral.parse("::FFFF:7f00:1")).toBe("127.0.0.1");
  });

  test("drops a zone index and refuses one that is not an interface name", () => {
    expect(IpLiteral.parse("fe80::1%eth0")).toBe("fe80::1");
    expect(IpLiteral.parse("[fe80::1%en0.5]:443")).toBe("fe80::1");
    for (const entry of ["::1%<script>alert(1)</script>", "::1%a b c", "::1%", "::1%a%b", "203.0.113.9%eth0"])
      expect(IpLiteral.parse(entry)).toBeNull();
  });

  test("refuses an IPv4 octet with a leading zero, which some parsers read as octal", () => {
    for (const entry of ["010.0.0.1", "10.0.0.01", "10.00.0.1", "010.0.0.1:80"])
      expect(IpLiteral.parse(entry)).toBeNull();
    expect(IpLiteral.parse("10.0.0.0")).toBe("10.0.0.0");
  });
});
