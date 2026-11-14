import { IpBytes } from "./IpBytes";
import { IpLiteral } from "./IpLiteral";

export const forwardedHeaders = [
  "x-real-ip",
  "x-forwarded-for",
  "x-forwarded-port",
  "x-forwarded-host",
  "x-forwarded-proto",
] as const;

export const normalizeIpAddress = (address: string): string => IpBytes.normalize(address);

/**
 * An IPv6 address as its /64 (`2001:db8:1:2::/64`), since one host is handed a whole /64 and may use any address in
 * it; an IPv4 address, also when mapped into IPv6, as itself.
 */
export const addressBlockOf = (address: string): string => {
  const normalized = normalizeIpAddress(address);
  const bytes = normalized.includes(":") ? IpBytes.of(normalized) : null;
  if (!bytes) return normalized;
  if (bytes.subarray(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff)
    return [...bytes.subarray(12)].join(".");
  const groups = [0, 2, 4, 6].map((at) => (((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)).toString(16));
  return `${groups.join(":")}::/64`;
};

/**
 * Without `isTrusted`: `x-real-ip`, else the leftmost `x-forwarded-for` entry. With it: `x-forwarded-for` walked from
 * the nearest hop past every address it vouches for, and `x-real-ip` only when there is none. `null`, never a
 * placeholder, when nothing names an address.
 */
export const clientAddressFromHeaders = (headers: Headers, isTrusted?: (address: string) => boolean): string | null => {
  const hops = (headers.get("x-forwarded-for") ?? "").split(",").filter((hop) => hop.trim());
  const realIp = headers.get("x-real-ip");
  if (!isTrusted) return (realIp ? IpLiteral.parse(realIp) : null) ?? (hops[0] ? IpLiteral.parse(hops[0]) : null);
  let nearest: string | null = null;
  for (const hop of hops.reverse()) {
    const address = IpLiteral.parse(hop);
    //? Nothing left of a hop that names no address can be vouched for, so the walk ends at the last one it read.
    if (!address) break;
    nearest = address;
    if (!isTrusted(address)) return address;
  }
  if (nearest) return nearest;
  return realIp ? IpLiteral.parse(realIp) : null;
};

export const clientPortFromHeaders = (headers: Headers): number | null => {
  const port = Number(headers.get("x-forwarded-port"));
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
};
