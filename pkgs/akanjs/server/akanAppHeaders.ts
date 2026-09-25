import { normalizeIpAddress } from "akanjs/common";

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

/** What `Server.requestIP` reports for the socket this hop accepted. */
export interface ProxyClientPeer {
  address: string;
  port: number;
  family: string;
}

export function makeAkanChildProxyHeaders(req: Request, childIdx: number, peer?: ProxyClientPeer | null): Headers {
  const headers = new Headers(req.headers);
  for (const key of HOP_BY_HOP_HEADERS) headers.delete(key);
  const forwardedFor = headers.get("x-forwarded-for");
  // The child talks to the gateway over loopback or a unix socket, so its own peer is always the gateway —
  // this is the only hop that can still see who connected. An `x-real-ip` already present is a trusted
  // upstream proxy's word for the client, and our peer is then that proxy, so the header outranks the socket.
  const clientAddress = headers.get("x-real-ip") ?? (peer ? normalizeIpAddress(peer.address) : "127.0.0.1");
  const host = headers.get("host");
  headers.set("x-real-ip", clientAddress);
  headers.set("x-forwarded-for", forwardedFor ? `${forwardedFor}, ${clientAddress}` : clientAddress);
  if (peer && !headers.has("x-forwarded-port")) headers.set("x-forwarded-port", String(peer.port));
  headers.set("x-forwarded-host", headers.get("x-forwarded-host") ?? host ?? new URL(req.url).host);
  headers.set(
    "x-forwarded-proto",
    headers.get("x-forwarded-proto") ?? (req.url.startsWith("https:") ? "https" : "http"),
  );
  headers.set("x-akan-child-idx", String(childIdx));
  if (!headers.has("x-request-id") && process.env.AKAN_BENCH_SKIP_REQUEST_ID !== "1") {
    headers.set("x-request-id", crypto.randomUUID());
  }
  headers.set("host", "akan-child");
  return headers;
}
