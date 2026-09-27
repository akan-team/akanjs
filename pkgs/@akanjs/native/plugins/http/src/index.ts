import { AkanNativeError, type CallOptions, definePlugin, type Plugin } from "../../../packages/core/src/index.ts";
import { base64ToBytes, bytesToBase64, normalizeUrl } from "./common.ts";
import { web } from "./web.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type BodyEncoding = "utf8" | "base64";
/** How the host hands the body over the bridge. "json" (below) is text parsed in the page. */
export type NativeResponseType = "text" | "base64";
export type ResponseType = NativeResponseType | "json";

/** A request as the host receives it (the PL-10 spec types). */
export interface NativeRequest {
  /**
   * Absolute http or https URL. The page sends it in canonical form (WHATWG-parsed, lowercase
   * scheme and host, no default port or fragment): that is what the app's scope matches.
   */
  url: string;
  /** Default GET. */
  method?: HttpMethod;
  /**
   * Request headers, each name once (whatever its case). Host, Content-Length, Transfer-Encoding,
   * Connection, Keep-Alive, Upgrade, TE, Trailer, Expect and Accept-Encoding belong to the HTTP
   * stack and reject INVALID_ARGS. Nothing adds cookies: send a Cookie header yourself.
   */
  headers?: Record<string, string>;
  /**
   * Text (sent as UTF-8) or, with bodyEncoding "base64", bytes. Without a Content-Type header one
   * is added: text/plain;charset=UTF-8 or application/octet-stream. GET and HEAD cannot have one;
   * POST, PUT and PATCH without one send an empty body.
   */
  body?: string;
  /** Default utf8. */
  bodyEncoding?: BodyEncoding;
  /** Default text. */
  responseType?: NativeResponseType;
  /** Milliseconds for the whole request (redirects and body included). Default 60000. */
  timeout?: number;
}

export interface NativeResponse {
  status: number;
  /**
   * Lowercase names; a repeated header (Set-Cookie too) is joined with ", ". Content-Encoding and
   * Content-Length are left out when the body came compressed (it is always decoded).
   */
  headers: Record<string, string>;
  /** Text (UTF-8, BOM dropped, invalid bytes as U+FFFD) or base64. */
  data: string;
  /** The URL that answered, after redirects, in canonical form. */
  url: string;
}

/** The bridge spec the Swift and Kotlin bindings are generated from (PL-10). */
export interface HttpSpec {
  request(options: NativeRequest): Promise<NativeResponse>;
}

export interface HttpRequestOptions extends Omit<NativeRequest, "responseType"> {
  /** "json" parses the text in the page (an empty body is null); invalid JSON rejects INTERNAL. Default text. */
  responseType?: ResponseType;
}

export interface HttpResponse<T = string> extends Omit<NativeResponse, "data"> {
  data: T;
}

/**
 * HTTP from the native side of the app (WV-5, Capacitor's CapacitorHttp approach): no CORS, since
 * the request does not come from the page. iOS URLSession, Android HttpURLConnection, desktop
 * Bun's fetch; the web falls back to the page's fetch, where CORS and the page's
 * Content-Security-Policy (connect-src) apply as usual.
 *
 * - Any status resolves (404 and 500 too); network failures (DNS, refused, TLS, timeout) reject
 *   INTERNAL, invalid options INVALID_ARGS.
 * - Redirects are followed (at most 20) as fetch does: 301/302 POST and 303 become GET,
 *   Authorization and Cookie are not sent to another origin, and every hop must be inside the
 *   app's scope.
 * - No cookie jar and no cache on any platform.
 * - Plain http:// is refused by iOS App Transport Security and Android's cleartext policy unless
 *   the app allows it (PERMISSION_DENIED); desktop allows it.
 * - The app's capabilities (PL-11) limit URLs with scopes { url }: URL patterns whose scheme,
 *   host, port and path are compared separately (urlMatch in @akanjs/native/core; no port = the default port
 *   in allow, any port in deny), e.g. { identifier: "http:default", allow: [{ url: "https://api.example.com/*" }] }.
 *   http:default allows no URL until the app lists them.
 * - Bodies travel over the bridge as text or base64: fine for API calls, not for large downloads.
 */
export interface HttpApi {
  request(options: HttpRequestOptions & { responseType: "json" }): Promise<HttpResponse<unknown>>;
  request(options: HttpRequestOptions & { responseType?: NativeResponseType }): Promise<HttpResponse<string>>;
  request(options: HttpRequestOptions): Promise<HttpResponse<unknown>>;
}

const handle = definePlugin<HttpSpec>("http", { methods: ["request"], web });

const RESPONSE_TYPES: readonly ResponseType[] = ["text", "json", "base64"];

function asJson(response: NativeResponse): HttpResponse<unknown> {
  if (response.data === "") return { ...response, data: null };
  try {
    return { ...response, data: JSON.parse(response.data) };
  } catch (error) {
    throw new AkanNativeError(
      "INTERNAL",
      `${response.url} answered ${response.status} with a body that is not JSON: ${(error as Error).message}`,
    );
  }
}

function request(options: HttpRequestOptions, call?: CallOptions): Promise<HttpResponse<unknown>> {
  try {
    if (!options || typeof options !== "object") throw new AkanNativeError("INVALID_ARGS", "options must be an object");
    const { responseType, method, ...rest } = options;
    if (responseType !== undefined && !RESPONSE_TYPES.includes(responseType)) {
      throw new AkanNativeError("INVALID_ARGS", `responseType must be one of ${RESPONSE_TYPES.join(", ")}`);
    }
    const wire: NativeRequest = { ...rest, url: normalizeUrl(options.url) };
    if (method !== undefined) wire.method = (typeof method === "string" ? method.toUpperCase() : method) as HttpMethod;
    if (responseType === "text" || responseType === "base64") wire.responseType = responseType;
    const sent = call ? handle.request(wire, call) : handle.request(wire);
    return responseType === "json" ? sent.then(asJson) : sent;
  } catch (error) {
    return Promise.reject(AkanNativeError.from(error));
  }
}

export type Http = Plugin<HttpApi>;

export const http: Http = Object.freeze({ ...handle, request }) as unknown as Http;

export interface FetchOptions {
  /** Default GET; any case. */
  method?: string;
  headers?: HeadersInit;
  body?: string | ArrayBuffer | ArrayBufferView | URLSearchParams | null;
  /** Milliseconds for the whole request. Default 60000. */
  timeout?: number;
  /** Stops the request (the host cancels it too); rejects with CANCELLED, or TIMEOUT for AbortSignal.timeout. */
  signal?: AbortSignal;
}

const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/**
 * A small fetch() over http.request, for code written against fetch: the Response is built from
 * the native result (body as bytes, so text(), json(), arrayBuffer() and blob() work; `url` is the
 * final URL). No streaming, no Request objects. `signal` cancels the request on the host too.
 */
export async function fetch(input: string | URL, init: FetchOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  for (const [name, value] of new Headers(init.headers)) headers[name] = value;
  const method = (init.method ?? "GET").toUpperCase() as HttpMethod;
  const options: HttpRequestOptions = { url: String(input), method, headers, responseType: "base64" };
  const body = init.body;
  if (typeof body === "string") options.body = body;
  else if (body instanceof URLSearchParams) {
    options.body = body.toString();
    headers["content-type"] ??= "application/x-www-form-urlencoded;charset=UTF-8";
  } else if (body instanceof ArrayBuffer) {
    options.body = bytesToBase64(new Uint8Array(body));
    options.bodyEncoding = "base64";
  } else if (ArrayBuffer.isView(body)) {
    options.body = bytesToBase64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    options.bodyEncoding = "base64";
  } else if (body !== undefined && body !== null) {
    throw new AkanNativeError("INVALID_ARGS", "body must be a string, ArrayBuffer, typed array or URLSearchParams");
  }
  if (init.timeout !== undefined) options.timeout = init.timeout;

  const result = (await request(options, init.signal ? { signal: init.signal } : undefined)) as HttpResponse<string>;
  const responseHeaders = new Headers();
  for (const [name, value] of Object.entries(result.headers)) {
    try {
      responseHeaders.append(name, value);
    } catch {
      // not a ByteString (a server's raw UTF-8): Headers cannot hold it
    }
  }
  const bytes = NULL_BODY.has(result.status) || method === "HEAD" ? null : base64ToBytes(result.data);
  const response = new Response(bytes as BodyInit | null, { status: result.status, headers: responseHeaders });
  Object.defineProperty(response, "url", { value: result.url });
  return response;
}
