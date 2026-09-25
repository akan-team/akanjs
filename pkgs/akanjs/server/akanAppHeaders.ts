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

export function makeAkanChildProxyHeaders(req: Request, childIdx: number): Headers {
  const headers = new Headers(req.headers);
  for (const key of HOP_BY_HOP_HEADERS) headers.delete(key);
  const forwardedFor = headers.get("x-forwarded-for");
  const clientAddress = headers.get("x-real-ip") ?? "127.0.0.1";
  const host = headers.get("host");
  headers.set("x-forwarded-for", forwardedFor ? `${forwardedFor}, ${clientAddress}` : clientAddress);
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
