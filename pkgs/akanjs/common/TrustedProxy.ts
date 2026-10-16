import { clientAddressFromHeaders, normalizeIpAddress } from "./clientAddress";

// Forwarded headers are forgeable, so they are believed only from a private, loopback or link-local peer;
// `AKAN_TRUSTED_PROXIES` adds a comma-separated CIDR list, and `*` trusts every peer.
export class TrustedProxy {
  static #cidrs: { bytes: Uint8Array; bits: number }[] | null = null;
  static #trustAll: boolean | null = null;
  //? Every request asks about its peer, and behind a proxy that is the same few addresses; bounded for a direct server.
  static readonly #verdicts = new Map<string, boolean>();
  static readonly #verdictLimit = 1024;

  static configure(list: string | null | undefined) {
    TrustedProxy.#verdicts.clear();
    TrustedProxy.#trustAll = list?.trim() === "*";
    TrustedProxy.#cidrs = (list ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry && entry !== "*")
      .flatMap((entry) => {
        const parsed = TrustedProxy.#parseCidr(entry);
        return parsed ? [parsed] : [];
      });
  }

  static reset() {
    TrustedProxy.#cidrs = null;
    TrustedProxy.#trustAll = null;
    TrustedProxy.#verdicts.clear();
  }

  static #load() {
    if (TrustedProxy.#cidrs === null) TrustedProxy.configure(process.env.AKAN_TRUSTED_PROXIES);
  }

  static isTrusted(address: string | null | undefined): boolean {
    if (!address) return false;
    TrustedProxy.#load();
    if (TrustedProxy.#trustAll) return true;
    const known = TrustedProxy.#verdicts.get(address);
    if (known !== undefined) return known;
    const verdict = TrustedProxy.#judge(address);
    if (TrustedProxy.#verdicts.size >= TrustedProxy.#verdictLimit) TrustedProxy.#verdicts.clear();
    TrustedProxy.#verdicts.set(address, verdict);
    return verdict;
  }

  static #judge(address: string): boolean {
    const bytes = TrustedProxy.#toBytes(normalizeIpAddress(address));
    if (!bytes) return false;
    if (TrustedProxy.#isLocalRange(bytes)) return true;
    return (TrustedProxy.#cidrs ?? []).some((cidr) => TrustedProxy.#inRange(bytes, cidr));
  }

  /** A `null` peer is a unix socket, which only a local proxy opens, so its headers count; `undefined` is not. */
  static clientAddress(headers: Headers, peerAddress: string | null | undefined): string | null {
    if (peerAddress === null || TrustedProxy.isTrusted(peerAddress)) {
      const recorded = clientAddressFromHeaders(headers);
      if (recorded) return recorded;
    }
    return peerAddress ? normalizeIpAddress(peerAddress) : null;
  }

  /** For refusing an outbound fetch to a caller-chosen name: judges the address alone, never the proxy list. */
  static isPrivateAddress(address: string): boolean {
    const bytes = TrustedProxy.#toBytes(normalizeIpAddress(address));
    if (!bytes) return true;
    if (TrustedProxy.#isLocalRange(bytes)) return true;
    if (bytes.length === 4) {
      const [a = 0, b = 0] = bytes;
      return a === 0 || (a === 100 && b >= 64 && b <= 127) || a >= 224;
    }
    return bytes.every((byte) => byte === 0) || bytes[0] === 0xff;
  }

  /** `10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, and their IPv6 counterparts `::1`, `fc00::/7`, `fe80::/10`. */
  static #isLocalRange(bytes: Uint8Array): boolean {
    if (bytes.length === 4) {
      const [a = 0, b = 0] = bytes;
      if (a === 10 || a === 127) return true;
      if (a === 192 && b === 168) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      return a === 169 && b === 254;
    }
    const [first = 0, second = 0] = bytes;
    if ((first & 0xfe) === 0xfc) return true;
    if (first === 0xfe && (second & 0xc0) === 0x80) return true;
    return bytes.every((byte, idx) => (idx === 15 ? byte === 1 : byte === 0));
  }

  static #parseCidr(entry: string): { bytes: Uint8Array; bits: number } | null {
    const [address, prefix] = entry.split("/");
    const bytes = TrustedProxy.#toBytes(address ?? "");
    if (!bytes) return null;
    const bits = prefix === undefined ? bytes.length * 8 : Number(prefix);
    if (!Number.isInteger(bits) || bits < 0 || bits > bytes.length * 8) return null;
    return { bytes, bits };
  }

  static #inRange(bytes: Uint8Array, cidr: { bytes: Uint8Array; bits: number }): boolean {
    if (bytes.length !== cidr.bytes.length) return false;
    const wholeBytes = cidr.bits >> 3;
    for (let idx = 0; idx < wholeBytes; idx += 1) if (bytes[idx] !== cidr.bytes[idx]) return false;
    const restBits = cidr.bits & 7;
    if (!restBits) return true;
    const mask = 0xff << (8 - restBits);
    return ((bytes[wholeBytes] ?? 0) & mask) === ((cidr.bytes[wholeBytes] ?? 0) & mask);
  }

  static #toBytes(address: string): Uint8Array | null {
    if (address.includes(".") && !address.includes(":")) {
      const parts = address.split(".");
      if (parts.length !== 4) return null;
      const bytes = new Uint8Array(4);
      for (const [idx, part] of parts.entries()) {
        const value = Number(part);
        if (!/^\d{1,3}$/.test(part) || value > 255) return null;
        bytes[idx] = value;
      }
      return bytes;
    }
    return address.includes(":") ? TrustedProxy.#ipv6ToBytes(address) : null;
  }

  static #ipv6ToBytes(address: string): Uint8Array | null {
    // A zone index (`fe80::1%eth0`) is not part of the address; `normalizeIpAddress` already unwrapped IPv4-mapped.
    const bare = address.split("%")[0] ?? "";
    const halves = bare.split("::");
    if (halves.length > 2) return null;
    const groupsOf = (text: string) => (text ? text.split(":").filter((group) => group !== "") : []);
    const head = groupsOf(halves[0] ?? "");
    const tail = halves.length === 2 ? groupsOf(halves[1] ?? "") : [];
    const filled = halves.length === 2 ? 8 - head.length - tail.length : 0;
    if (filled < 0 || head.length + tail.length + filled !== 8) return null;
    const groups = [...head, ...new Array(filled).fill("0"), ...tail];
    const bytes = new Uint8Array(16);
    for (const [idx, group] of groups.entries()) {
      if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
      const value = Number.parseInt(group, 16);
      bytes[idx * 2] = value >> 8;
      bytes[idx * 2 + 1] = value & 0xff;
    }
    return bytes;
  }
}
