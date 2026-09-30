import { TrustedProxy } from "akanjs/common";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** The Host every request the gateway hands a replica carries; a browser never sends it to a replica's port. */
export const AKAN_CHILD_HOST = "akan-child";

export interface ProxyClientPeer {
  address: string;
  port: number;
  family: string;
}

export function makeAkanChildProxyHeaders(req: Request, childIdx: number, peer?: ProxyClientPeer | null): Headers {
  const headers = new Headers(req.headers);
  for (const key of HOP_BY_HOP_HEADERS) headers.delete(key);
  const forwardedFor = headers.get("x-forwarded-for");
  // Only this hop still sees the caller; an inbound `x-real-ip` counts only from a trusted proxy peer, else any client
  // could forge `.with(Ip)`. A `null` peer (dev host over a unix socket) is local; `undefined` (no server) is not.
  const clientAddress = TrustedProxy.clientAddress(headers, peer === null ? null : peer?.address);
  const host = headers.get("host");
  // Unset when unknown: a loopback placeholder would be indistinguishable from a real local caller.
  if (clientAddress) {
    headers.set("x-real-ip", clientAddress);
    headers.set("x-forwarded-for", forwardedFor ? `${forwardedFor}, ${clientAddress}` : clientAddress);
  } else {
    headers.delete("x-real-ip");
    headers.delete("x-forwarded-for");
  }
  if (peer && !headers.has("x-forwarded-port")) headers.set("x-forwarded-port", String(peer.port));
  headers.set("x-forwarded-host", headers.get("x-forwarded-host") ?? host ?? new URL(req.url).host);
  headers.set(
    "x-forwarded-proto",
    headers.get("x-forwarded-proto") ?? (req.url.startsWith("https:") ? "https" : "http"),
  );
  headers.set("x-akan-child-idx", String(childIdx));
  // Bun's `fetch` decodes any child encoding anyway; set, not deleted, or `fetch` supplies its own default.
  headers.set("accept-encoding", "identity");
  if (!headers.has("x-request-id") && process.env.AKAN_BENCH_SKIP_REQUEST_ID !== "1") {
    headers.set("x-request-id", crypto.randomUUID());
  }
  headers.set("host", AKAN_CHILD_HOST);
  return headers;
}
