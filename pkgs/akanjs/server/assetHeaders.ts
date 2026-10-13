export interface AssetHeaderOptions {
  contentType: string;
  cacheControl?: string;
  anyOrigin?: boolean;
}

// nosniff: Bun.file().type falls back to octet-stream, and a sniffing browser may run a public/ file as script.
// Referrer-Policy: paths carry ids. X-Frame-Options (HTML only): stops clickjacking of cookie-authenticated pages.
export const applySecurityHeaders = (headers: Headers, { html = false } = {}): Headers => {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (html) headers.set("X-Frame-Options", "SAMEORIGIN");
  return headers;
};

// `anyOrigin` is for public files a page elsewhere may load: a font is always fetched in CORS mode, so an MCP view,
// which has no origin of its own, could not use one without it.
export const assetHeaders = ({ contentType, cacheControl, anyOrigin }: AssetHeaderOptions): Headers => {
  const headers = new Headers({ "Content-Type": contentType });
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  if (anyOrigin) headers.set("Access-Control-Allow-Origin", "*");
  return applySecurityHeaders(headers);
};
