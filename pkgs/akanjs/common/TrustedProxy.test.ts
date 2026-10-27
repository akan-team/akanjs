import { afterEach, describe, expect, test } from "bun:test";
import { Logger } from "./Logger";
import { TrustedProxy } from "./TrustedProxy";

const headers = (entries: Record<string, string>) => new Headers(entries);

const captureWarnings = () => {
  const lines: string[] = [];
  const stop = Logger.addSink(({ level, plainMessage }) => {
    if (level === "warn" && plainMessage.includes("TrustedProxy")) lines.push(plainMessage);
  });
  return { lines, stop };
};

describe("TrustedProxy.clientAddress", () => {
  afterEach(() => TrustedProxy.reset());

  test("believes a forwarded address only from a private or loopback peer by default", () => {
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

  test("reads x-real-ip, else the leftmost x-forwarded-for entry, while no list is set", () => {
    const appended = headers({ "x-forwarded-for": "198.51.100.7, 203.0.113.9" });
    expect(TrustedProxy.clientAddress(appended, "10.0.0.2")).toBe("198.51.100.7");
    const both = headers({ "x-real-ip": "198.51.100.66", "x-forwarded-for": "203.0.113.9" });
    expect(TrustedProxy.clientAddress(both, "10.0.0.2")).toBe("198.51.100.66");
  });

  test("takes the nearest untrusted hop once any list is set, not the leftmost entry an appending proxy kept", () => {
    const appended = headers({ "x-forwarded-for": "198.51.100.7, 203.0.113.9" });
    for (const list of ["private", "10.0.0.0/8", "none"]) {
      TrustedProxy.configure(list);
      expect(TrustedProxy.clientAddress(appended, "127.0.0.1")).toBe("203.0.113.9");
    }
  });

  test("walks past trusted middle hops to the client", () => {
    TrustedProxy.configure("192.0.2.0/24");
    const chain = headers({ "x-forwarded-for": "198.51.100.7, 192.0.2.9, 192.0.2.10" });
    expect(TrustedProxy.clientAddress(chain, "192.0.2.1")).toBe("198.51.100.7");
  });

  test("prefers the x-forwarded-for walk over an x-real-ip a proxy left in place once a list is set", () => {
    TrustedProxy.configure("private");
    const both = headers({ "x-real-ip": "198.51.100.66", "x-forwarded-for": "203.0.113.9" });
    expect(TrustedProxy.clientAddress(both, "10.0.0.2")).toBe("203.0.113.9");
  });

  test("tells the gateway whether the address came from the headers or the peer", () => {
    expect(TrustedProxy.resolve(headers({ "x-real-ip": "203.0.113.9" }), "10.0.0.2")).toEqual({
      address: "203.0.113.9",
      forwarded: true,
    });
    expect(TrustedProxy.resolve(headers({}), "10.0.0.2")).toEqual({ address: "10.0.0.2", forwarded: false });
    expect(TrustedProxy.resolve(headers({ "x-real-ip": "203.0.113.9" }), "198.51.100.7")).toEqual({
      address: "198.51.100.7",
      forwarded: false,
    });
  });

  test("judges a peer again once the proxy list changes", () => {
    expect(TrustedProxy.isTrusted("203.0.113.5")).toBe(false);
    TrustedProxy.configure("203.0.113.0/24");
    expect(TrustedProxy.isTrusted("203.0.113.5")).toBe(true);
    TrustedProxy.configure("");
    expect(TrustedProxy.isTrusted("203.0.113.5")).toBe(false);
  });
});

describe("AKAN_TRUSTED_PROXIES", () => {
  afterEach(() => TrustedProxy.reset());

  test("unset or blank keeps loopback and the private ranges trusted", () => {
    for (const list of [undefined, "", " , "]) {
      TrustedProxy.configure(list);
      for (const peer of ["127.0.0.1", "::1", "10.0.0.5", "172.20.0.1", "192.168.1.1", "169.254.1.1", "fd00::1"])
        expect(TrustedProxy.isTrusted(peer)).toBe(true);
      expect(TrustedProxy.isTrusted("203.0.113.5")).toBe(false);
      const appended = headers({ "x-forwarded-for": "198.51.100.7, 203.0.113.9" });
      expect(TrustedProxy.clientAddress(appended, "10.0.0.5")).toBe("198.51.100.7");
    }
  });

  test("a list replaces the private ranges, so a private peer it leaves out is the client itself", () => {
    TrustedProxy.configure("192.0.2.1/32");
    const forged = headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.9" });
    expect(TrustedProxy.clientAddress(forged, "10.0.0.5")).toBe("10.0.0.5");
    expect(TrustedProxy.clientAddress(forged, "192.0.2.1")).toBe("203.0.113.9");
    expect(TrustedProxy.clientAddress(forged, "127.0.0.1")).toBe("203.0.113.9");
  });

  test("warns once, naming the ignored private peer but none of the header values", () => {
    TrustedProxy.configure("192.0.2.1/32");
    const { lines, stop } = captureWarnings();
    try {
      const forged = headers({ "x-real-ip": "203.0.113.9" });
      TrustedProxy.clientAddress(forged, "10.0.0.5");
      TrustedProxy.clientAddress(forged, "10.0.0.6");
      TrustedProxy.clientAddress(headers({ "x-real-ip": "203.0.113.9" }), "198.51.100.7");
    } finally {
      stop();
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("10.0.0.5");
    expect(lines[0]).toContain("a CIDR that holds only your proxies");
    expect(lines[0]).not.toContain("private");
    expect(lines[0]).not.toContain("203.0.113.9");
  });

  test("stays quiet when no list is set or the private peer forwarded nothing", () => {
    const { lines, stop } = captureWarnings();
    try {
      TrustedProxy.clientAddress(headers({ "x-real-ip": "203.0.113.9" }), "198.51.100.7");
      TrustedProxy.configure("192.0.2.1/32");
      TrustedProxy.clientAddress(headers({}), "10.0.0.5");
    } finally {
      stop();
    }
    expect(lines).toEqual([]);
  });

  test("`private` adds the default ranges back to an explicit list", () => {
    TrustedProxy.configure("private, 192.0.2.1");
    expect(TrustedProxy.clientAddress(headers({ "x-real-ip": "203.0.113.9" }), "10.0.0.5")).toBe("203.0.113.9");
    expect(TrustedProxy.isTrusted("192.0.2.1")).toBe(true);
    expect(TrustedProxy.isTrusted("203.0.113.5")).toBe(false);
  });

  test("`none` trusts loopback and a unix socket only", () => {
    TrustedProxy.configure("none");
    expect(TrustedProxy.isTrusted("127.0.0.1")).toBe(true);
    expect(TrustedProxy.isTrusted("::1")).toBe(true);
    expect(TrustedProxy.isTrusted("10.0.0.5")).toBe(false);
    expect(TrustedProxy.isTrusted("fd00::1")).toBe(false);
    expect(TrustedProxy.clientAddress(headers({ "x-real-ip": "203.0.113.9" }), null)).toBe("203.0.113.9");
  });

  test("`*` trusts every peer and keeps the default reading, x-real-ip first", () => {
    TrustedProxy.configure("*");
    expect(TrustedProxy.isTrusted("203.0.113.5")).toBe(true);
    const edge = headers({ "x-real-ip": "203.0.113.50", "x-forwarded-for": "198.51.100.66, 203.0.113.50" });
    expect(TrustedProxy.resolve(edge, "198.51.100.1")).toEqual({ address: "203.0.113.50", forwarded: true });
    const chain = headers({ "x-forwarded-for": "198.51.100.7, 203.0.113.9" });
    expect(TrustedProxy.clientAddress(chain, "203.0.113.5")).toBe("198.51.100.7");
  });

  test("`*` beside other entries still trusts every peer, and says once that they change nothing", () => {
    const { lines, stop } = captureWarnings();
    try {
      TrustedProxy.configure("*, 10.0.0.0/8");
      expect(TrustedProxy.isTrusted("198.51.100.1")).toBe(true);
      const edge = headers({ "x-real-ip": "203.0.113.50", "x-forwarded-for": "198.51.100.66, 203.0.113.50" });
      expect(TrustedProxy.clientAddress(edge, "198.51.100.1")).toBe("203.0.113.50");
      TrustedProxy.clientAddress(edge, "198.51.100.2");
      TrustedProxy.configure("*");
    } finally {
      stop();
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"*"');
  });

  test("ignores an entry that is neither an address nor a CIDR, with a warning", () => {
    const { lines, stop } = captureWarnings();
    try {
      TrustedProxy.configure("10.0.0.0/, proxy.internal, 192.0.2.0/33, 192.0.2.7");
    } finally {
      stop();
    }
    expect(lines).toHaveLength(3);
    expect(TrustedProxy.isTrusted("10.1.2.3")).toBe(false);
    expect(TrustedProxy.isTrusted("192.0.2.7")).toBe(true);
    expect(TrustedProxy.isTrusted("192.0.2.8")).toBe(false);
  });
});

describe("TrustedProxy.isPrivateAddress", () => {
  afterEach(() => TrustedProxy.reset());

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
    TrustedProxy.configure("none");
    expect(TrustedProxy.isPrivateAddress("10.1.2.3")).toBe(true);
  });
});
