import { clientPortFromHeaders, TrustedProxy } from "akanjs/common";
import { TraceContext } from "../common/TraceContext";
import { RequestTrace } from "../signal/requestTrace";

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

const isTrustedPeer = (peer: ProxyClientPeer | null | undefined) =>
  peer === null || TrustedProxy.isTrusted(peer?.address);

export const adoptProxyTrace = (req: Request, peer?: ProxyClientPeer | null): RequestTrace =>
  RequestTrace.accept(req.headers, peer);

export function makeAkanChildProxyHeaders(
  req: Request,
  childIdx: number,
  peer?: ProxyClientPeer | null,
  trace: RequestTrace = adoptProxyTrace(req, peer),
): Headers {
  const headers = new Headers(req.headers);
  for (const key of HOP_BY_HOP_HEADERS) headers.delete(key);
  // Only this hop still sees the caller; forwarded headers count only from a trusted proxy peer, else any client
  // could forge `.with(Ip)`. A `null` peer (dev host over a unix socket) is local; `undefined` (no server) is not.
  const peerAddress = peer === null ? null : peer?.address;
  const client = TrustedProxy.resolve(headers, peerAddress);
  const host = headers.get("host");
  // Security: the child believes this hop and walks `x-forwarded-for`, so it gets the one answer resolved here, never
  // the inbound chain. Unset when unknown: a loopback placeholder would be indistinguishable from a real local caller.
  if (client.address) {
    headers.set("x-real-ip", client.address);
    headers.set("x-forwarded-for", client.address);
  } else {
    headers.delete("x-real-ip");
    headers.delete("x-forwarded-for");
  }
  const port = client.forwarded ? clientPortFromHeaders(headers) : (peer?.port ?? null);
  if (port) headers.set("x-forwarded-port", String(port));
  else headers.delete("x-forwarded-port");
  // Security: a replica trusts this hop's host and scheme too, so an untrusted caller's claim of either stops here.
  // Judged by the peer, not by `client.forwarded`: a tunnel agent on loopback names the host but may know no address.
  const relayed = (name: string) => (isTrustedPeer(peer) ? headers.get(name) : null);
  headers.set("x-forwarded-host", relayed("x-forwarded-host") ?? host ?? new URL(req.url).host);
  headers.set("x-forwarded-proto", relayed("x-forwarded-proto") ?? (req.url.startsWith("https:") ? "https" : "http"));
  headers.set("x-akan-child-idx", String(childIdx));
  //? The child encodes for the caller and the gateway relays its bytes. Set when absent, or `fetch` supplies its own.
  if (!headers.get("accept-encoding")) headers.set("accept-encoding", "identity");
  // Security: the child takes this hop's id as its own, so it gets the one settled here and never the caller's headers.
  headers.set(TraceContext.traceparentHeader, trace.traceparent);
  headers.set(TraceContext.requestIdHeader, trace.traceId);
  if (trace.link) headers.set(TraceContext.linkHeader, trace.link);
  else headers.delete(TraceContext.linkHeader);
  headers.set("host", AKAN_CHILD_HOST);
  return headers;
}
