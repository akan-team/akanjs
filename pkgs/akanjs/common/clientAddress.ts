/** Headers a proxy hop writes so the next hop can still name the original caller. */
export const forwardedHeaders = [
  "x-real-ip",
  "x-forwarded-for",
  "x-forwarded-port",
  "x-forwarded-host",
  "x-forwarded-proto",
] as const;

/**
 * An IPv4 client reaching a dual-stack listener is reported as `::ffff:203.0.113.10`. That form is not a
 * valid destination for a `udp4` socket and does not compare equal to the same address written plainly, so
 * it is unwrapped at every boundary rather than at each call site that happens to remember.
 */
export const normalizeIpAddress = (address: string): string => {
  const trimmed = address.trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  return mapped?.[1] ?? trimmed;
};

/**
 * The caller's address as the nearest proxy recorded it. `x-real-ip` is one hop's word for who the client is
 * and wins; `x-forwarded-for` is a chain appended left to right, so its *first* entry is the original client
 * and everything after it is a proxy.
 *
 * Returns `null` rather than a placeholder. A socket peer behind a proxy is the proxy, so `127.0.0.1` here
 * would be indistinguishable from a genuinely local caller — and that is the failure this exists to prevent.
 */
export const clientAddressFromHeaders = (headers: Headers): string | null => {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return normalizeIpAddress(realIp);
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? normalizeIpAddress(forwarded) : null;
};

/** The client port the nearest proxy recorded, for correlating a connection with a peer's own logs. */
export const clientPortFromHeaders = (headers: Headers): number | null => {
  const port = Number(headers.get("x-forwarded-port"));
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
};
