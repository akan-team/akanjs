import { clientAddressFromHeaders, normalizeIpAddress } from "./clientAddress";
import { IpBytes } from "./IpBytes";
import { IpLiteral } from "./IpLiteral";
import { Logger } from "./Logger";

interface Cidr {
  bytes: Uint8Array;
  bits: number;
}

interface TrustPolicy {
  trustAll: boolean;
  privateRanges: boolean;
  strict: boolean;
  cidrs: Cidr[];
}

export interface ResolvedClient {
  address: string | null;
  /** Read from a trusted hop's forwarded headers rather than taken from the socket peer. */
  forwarded: boolean;
}

// Forwarded headers are forgeable, so they are believed only from a trusted peer: loopback always (the gateway's own
// hop to its children), and private or link-local ranges until `AKAN_TRUSTED_PROXIES` names the list that replaces
// them — CIDRs or addresses, plus `private` (those ranges again), `none` (loopback only) or `*` alone (every peer). Any
// other list also switches on the strict reading: `x-forwarded-for` walked from the nearest hop past every trusted one.
export class TrustedProxy {
  static #policy: TrustPolicy | null = null;
  //? Every request asks about its peer, and behind a proxy that is the same few addresses; bounded for a direct server.
  static readonly #verdicts = new Map<string, boolean>();
  static readonly #verdictLimit = 1024;
  static #warnedIgnoredPeer = false;
  static #warnedUnlistedChain = false;

  static configure(list: string | null | undefined) {
    TrustedProxy.reset();
    TrustedProxy.#policy = TrustedProxy.#policyOf(list);
  }

  static reset() {
    TrustedProxy.#policy = null;
    TrustedProxy.#verdicts.clear();
    TrustedProxy.#warnedIgnoredPeer = false;
    TrustedProxy.#warnedUnlistedChain = false;
  }

  static #load(): TrustPolicy {
    TrustedProxy.#policy ??= TrustedProxy.#policyOf(process.env.AKAN_TRUSTED_PROXIES);
    return TrustedProxy.#policy;
  }

  static #policyOf(list: string | null | undefined): TrustPolicy {
    const entries = (list ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry);
    const keywords = new Set(entries.map((entry) => entry.toLowerCase()));
    const cidrs = entries
      .filter((entry) => !["*", "none", "private"].includes(entry.toLowerCase()))
      .flatMap((entry) => {
        const parsed = TrustedProxy.#parseCidr(entry);
        if (!parsed)
          new Logger("TrustedProxy").warn(
            `AKAN_TRUSTED_PROXIES entry "${entry}" is neither an address nor a CIDR; ignored`,
          );
        return parsed ? [parsed] : [];
      });
    //? Security: 3.1.0 ignored a `*` beside other entries; honouring it now would widen an existing list to everyone.
    const trustAll = keywords.size === 1 && keywords.has("*");
    if (keywords.has("*") && !trustAll)
      new Logger("TrustedProxy").warn(
        `AKAN_TRUSTED_PROXIES lists "*" beside other entries, so "*" is ignored; list it alone to trust every peer`,
      );
    return {
      trustAll,
      privateRanges: !entries.length || keywords.has("private"),
      strict: entries.length > 0 && !trustAll,
      cidrs,
    };
  }

  static isTrusted(address: string | null | undefined): boolean {
    if (!address) return false;
    if (TrustedProxy.#load().trustAll) return true;
    const known = TrustedProxy.#verdicts.get(address);
    if (known !== undefined) return known;
    const verdict = TrustedProxy.#judge(address);
    if (TrustedProxy.#verdicts.size >= TrustedProxy.#verdictLimit) TrustedProxy.#verdicts.clear();
    TrustedProxy.#verdicts.set(address, verdict);
    return verdict;
  }

  static #judge(address: string): boolean {
    const bytes = IpBytes.of(normalizeIpAddress(address));
    if (!bytes) return false;
    const policy = TrustedProxy.#load();
    if (TrustedProxy.#isLoopback(bytes)) return true;
    if (policy.privateRanges && TrustedProxy.#isPrivateRange(bytes)) return true;
    return policy.cidrs.some((cidr) => TrustedProxy.#inRange(bytes, cidr));
  }

  /** A `null` peer is a unix socket, which only a local proxy opens, so its headers count; `undefined` is not. */
  static clientAddress(headers: Headers, peerAddress: string | null | undefined): string | null {
    return TrustedProxy.resolve(headers, peerAddress).address;
  }

  static resolve(headers: Headers, peerAddress: string | null | undefined): ResolvedClient {
    if (peerAddress === null || TrustedProxy.isTrusted(peerAddress)) {
      //* Unset keeps the old reading: walking from the right would name a public CDN hop in front of a private ingress
      //* as every visitor, and make a proxy that sets only `x-real-ip` and passes the client's chain spoofable. `*`
      //* keeps it too: trusting every hop, the walk would always end at the entry the client wrote.
      const judge = TrustedProxy.#load().strict ? (address: string) => TrustedProxy.isTrusted(address) : undefined;
      const recorded = clientAddressFromHeaders(headers, judge);
      if (peerAddress) TrustedProxy.#noteUnlistedChain(headers, peerAddress);
      if (recorded) return { address: recorded, forwarded: true };
    } else if (peerAddress) TrustedProxy.#noteIgnoredPeer(headers, peerAddress);
    return {
      address: peerAddress ? (IpLiteral.parse(peerAddress) ?? normalizeIpAddress(peerAddress)) : null,
      forwarded: false,
    };
  }

  //* Once per process, without header values: an in-cluster ingress left off a set list loses every caller's address.
  static #noteIgnoredPeer(headers: Headers, peerAddress: string) {
    if (TrustedProxy.#warnedIgnoredPeer || !TrustedProxy.#load().strict) return;
    if (!headers.has("x-forwarded-for") && !headers.has("x-real-ip")) return;
    const bytes = IpBytes.of(normalizeIpAddress(peerAddress));
    if (!bytes || !TrustedProxy.#isPrivateRange(bytes)) return;
    TrustedProxy.#warnedIgnoredPeer = true;
    new Logger("TrustedProxy").warn(
      `Forwarded headers from ${normalizeIpAddress(peerAddress)} are ignored: AKAN_TRUSTED_PROXIES does not list it. If it is your proxy, add its address or a CIDR that holds only your proxies.`,
    );
  }

  //* Once, without header values: nginx sets x-real-ip to the hop it appended, so only a chain that disagrees warns.
  static #noteUnlistedChain(headers: Headers, peerAddress: string) {
    if (TrustedProxy.#warnedUnlistedChain) return;
    const policy = TrustedProxy.#load();
    if (policy.strict || policy.trustAll) return;
    const hops = (headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((hop) => hop.trim())
      .filter((hop) => hop);
    const realIp = headers.get("x-real-ip")?.trim();
    const last = hops.at(-1);
    const disagrees = realIp ? !!last && IpLiteral.parse(last) !== IpLiteral.parse(realIp) : hops.length > 1;
    if (!disagrees) return;
    const bytes = IpBytes.of(normalizeIpAddress(peerAddress));
    if (!bytes || TrustedProxy.#isLoopback(bytes)) return;
    TrustedProxy.#warnedUnlistedChain = true;
    new Logger("TrustedProxy").warn(
      `AKAN_TRUSTED_PROXIES is unset, so the client address comes from the x-real-ip or leftmost x-forwarded-for that ${normalizeIpAddress(peerAddress)} sent. If that proxy appends to those headers instead of overwriting them, list it in AKAN_TRUSTED_PROXIES so the chain is read from the nearest hop.`,
    );
  }

  /** For refusing an outbound fetch to a caller-chosen name: judges the address alone, never the proxy list. */
  static isPrivateAddress(address: string): boolean {
    const bytes = IpBytes.of(normalizeIpAddress(address));
    return !bytes || TrustedProxy.#isNonPublic(bytes);
  }

  static #isNonPublic(bytes: Uint8Array): boolean {
    if (TrustedProxy.#isLoopback(bytes) || TrustedProxy.#isPrivateRange(bytes)) return true;
    if (bytes.length === 4) {
      const [a = 0, b = 0] = bytes;
      return a === 0 || (a === 100 && b >= 64 && b <= 127) || a >= 224;
    }
    const embedded = TrustedProxy.#embeddedIpv4(bytes);
    if (embedded) return TrustedProxy.#isNonPublic(embedded);
    const [first = 0, second = 0, third = 0, fourth = 0, fifth = 0, sixth = 0] = bytes;
    const localNat64 =
      first === 0 && second === 0x64 && third === 0xff && fourth === 0x9b && fifth === 0 && sixth === 1;
    return localNat64 || first === 0xff;
  }

  //? Mapped, compatible, SIIT, NAT64, 6to4 and Teredo addresses are delivered to the IPv4 host they carry.
  static #embeddedIpv4(bytes: Uint8Array): Uint8Array | null {
    const zero = (from: number, to: number) => bytes.subarray(from, to).every((byte) => byte === 0);
    const groupAt = (idx: number) => ((bytes[idx] ?? 0) << 8) | (bytes[idx + 1] ?? 0);
    const tail = bytes.slice(12);
    if (zero(0, 10) && (groupAt(10) === 0xffff || groupAt(10) === 0)) return tail;
    if (zero(0, 8) && groupAt(8) === 0xffff && groupAt(10) === 0) return tail;
    if (groupAt(0) === 0x64 && groupAt(2) === 0xff9b && zero(4, 12)) return tail;
    if (groupAt(0) === 0x2002) return bytes.slice(2, 6);
    if (groupAt(0) === 0x2001 && groupAt(2) === 0) return tail.map((byte) => byte ^ 0xff);
    return null;
  }

  static #isLoopback(bytes: Uint8Array): boolean {
    if (bytes.length === 4) return bytes[0] === 127;
    return bytes.every((byte, idx) => (idx === 15 ? byte === 1 : byte === 0));
  }

  /** `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, and their IPv6 counterparts `fc00::/7`, `fe80::/10`. */
  static #isPrivateRange(bytes: Uint8Array): boolean {
    if (bytes.length === 4) {
      const [a = 0, b = 0] = bytes;
      if (a === 10) return true;
      if (a === 192 && b === 168) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      return a === 169 && b === 254;
    }
    const [first = 0, second = 0] = bytes;
    if ((first & 0xfe) === 0xfc) return true;
    return first === 0xfe && (second & 0xc0) === 0x80;
  }

  static #parseCidr(entry: string): Cidr | null {
    const [address, prefix, ...rest] = entry.split("/");
    if (rest.length || (prefix !== undefined && !/^\d{1,3}$/.test(prefix))) return null;
    const bytes = IpBytes.of(normalizeIpAddress(address ?? ""));
    if (!bytes) return null;
    const bits = prefix === undefined ? bytes.length * 8 : Number(prefix);
    if (!Number.isInteger(bits) || bits < 0 || bits > bytes.length * 8) return null;
    return { bytes, bits };
  }

  static #inRange(bytes: Uint8Array, cidr: Cidr): boolean {
    if (bytes.length !== cidr.bytes.length) return false;
    const wholeBytes = cidr.bits >> 3;
    for (let idx = 0; idx < wholeBytes; idx += 1) if (bytes[idx] !== cidr.bytes[idx]) return false;
    const restBits = cidr.bits & 7;
    if (!restBits) return true;
    const mask = 0xff << (8 - restBits);
    return ((bytes[wholeBytes] ?? 0) & mask) === ((cidr.bytes[wholeBytes] ?? 0) & mask);
  }
}
