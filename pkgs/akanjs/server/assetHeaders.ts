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
  if (!html) return headers;
  headers.set("X-Frame-Options", "SAMEORIGIN");
  const policy = htmlContentSecurityPolicy();
  if (policy) headers.set("Content-Security-Policy", policy);
  return headers;
};

const isOff = (value: string) => ["off", "false", "0", "none"].includes(value.toLowerCase());

//? No script-src by default: SSR inlines bootstrap scripts without a nonce, and a cached HTML body would replay one.
//? base-uri: an injected <base> would re-point the root-relative module scripts and import map at another origin.
export const DEFAULT_HTML_CONTENT_SECURITY_POLICY = "frame-ancestors 'self'; base-uri 'self'";

export const htmlContentSecurityPolicy = (raw = process.env.AKAN_CONTENT_SECURITY_POLICY?.trim()): string | null => {
  if (!raw || /[\r\n]/.test(raw)) return DEFAULT_HTML_CONTENT_SECURITY_POLICY;
  return isOff(raw) ? null : raw;
};

export const DEFAULT_STRICT_TRANSPORT_SECURITY = "max-age=31536000";

// Browsers ignore the header over plain HTTP, on an IP-literal host and behind a certificate error.
export const strictTransportSecurity = (raw = process.env.AKAN_HSTS?.trim()): string | null => {
  if (!raw || /[\r\n]/.test(raw)) return DEFAULT_STRICT_TRANSPORT_SECURITY;
  return isOff(raw) ? null : raw;
};

// `anyOrigin` is for public files a page elsewhere may load: a font is always fetched in CORS mode, so an MCP view,
// which has no origin of its own, could not use one without it.
export const assetHeaders = ({ contentType, cacheControl, anyOrigin }: AssetHeaderOptions): Headers => {
  const headers = new Headers({ "Content-Type": contentType });
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  if (anyOrigin) headers.set("Access-Control-Allow-Origin", "*");
  return applySecurityHeaders(headers);
};
