import { Err } from "../lib/dict";

export interface UntrustedFetchOptions {
  headers?: { [key: string]: string };
  signal?: AbortSignal;
  timeout?: number; //? ms until the final response headers arrive, across DNS, connects and every redirect hop
  deadline?: number; //? ms for the whole exchange including the body
  maxBytes?: number;
  maxRedirects?: number; //? 0 turns any redirect into an error
}

export interface UntrustedResponse {
  url: string;
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array>;
  totalBytes: number; //? the declared content-length, 0 when the server sent none
}

//* For URLs a user, a chain event or a vendor chose: every hop's resolved address is checked and the connection pinned
//* to it, so neither a redirect nor a rebinding DNS answer reaches a private network (plain fetch also reads file://).
export class UntrustedFetch {
  static readonly defaultTimeout = 30_000;
  static readonly defaultDeadline = 30 * 60_000;
  static readonly defaultMaxBytes = 200 * 1024 * 1024;
  static readonly defaultJsonMaxBytes = 1024 * 1024;
  static readonly #redirectStatuses = new Set([301, 302, 303, 307, 308]);
  //? What fetch itself drops when a redirect leaves the origin; other caller headers still follow.
  static readonly #crossOriginDroppedHeaders = ["authorization", "cookie", "proxy-authorization"] as const;
  static readonly #blockedIpv4Ranges = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const;

  static isPublicAddress(address: string) {
    const ipv4 = UntrustedFetch.#ipv4Octets(address);
    if (ipv4) return UntrustedFetch.#isPublicIpv4(ipv4);
    const ipv6 = UntrustedFetch.#ipv6Hextets(address);
    return ipv6 ? UntrustedFetch.#isPublicIpv6(ipv6) : false;
  }

  static parseUrl(url: string) {
    const parsed = URL.parse(url);
    if (!parsed) throw new Err("util.error.untrustedUrlRejected", { reason: "not a URL" });
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new Err("util.error.untrustedUrlRejected", { reason: `${parsed.protocol} is not http or https` });
    return parsed;
  }

  static async fetch(
    url: string,
    {
      headers = {},
      signal,
      timeout = UntrustedFetch.defaultTimeout,
      deadline = UntrustedFetch.defaultDeadline,
      maxBytes = UntrustedFetch.defaultMaxBytes,
      maxRedirects = 5,
    }: UntrustedFetchOptions = {},
  ): Promise<UntrustedResponse> {
    const controller = new AbortController();
    const fetchSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const abortOnTimeout = () => controller.abort(new Err("util.error.untrustedFetchTimedOut"));
    const headersTimer = setTimeout(abortOnTimeout, timeout);
    const deadlineTimer = setTimeout(abortOnTimeout, deadline);
    deadlineTimer.unref();
    const settle = () => {
      clearTimeout(headersTimer);
      clearTimeout(deadlineTimer);
    };
    try {
      let target = UntrustedFetch.parseUrl(url);
      let requestHeaders = new Headers(headers);
      for (let hopNum = 0; ; hopNum += 1) {
        const response = await UntrustedFetch.#send(target, requestHeaders, fetchSignal);
        const location = response.headers.get("location");
        if (!UntrustedFetch.#redirectStatuses.has(response.status) || !location) {
          clearTimeout(headersTimer);
          return UntrustedFetch.#accept(target, response, maxBytes, settle);
        }
        await response.body?.cancel();
        if (hopNum >= maxRedirects)
          throw new Err("util.error.untrustedUrlRejected", { reason: `more than ${maxRedirects} redirects` });
        const next = UntrustedFetch.parseUrl(new URL(location, target).href);
        if (next.origin !== target.origin) requestHeaders = UntrustedFetch.#withoutCredentials(requestHeaders);
        target = next;
      }
    } catch (error) {
      settle();
      throw error;
    }
  }

  static async json<T>(url: string, options: UntrustedFetchOptions = {}): Promise<T> {
    const { body } = await UntrustedFetch.fetch(url, {
      maxBytes: UntrustedFetch.defaultJsonMaxBytes,
      deadline: options.timeout ?? UntrustedFetch.defaultTimeout,
      ...options,
    });
    return JSON.parse(await new Response(body).text()) as T;
  }

  static async #send(target: URL, headers: Headers, signal: AbortSignal) {
    const literal = UntrustedFetch.#addressLiteralOf(target.hostname);
    if (literal && !UntrustedFetch.isPublicAddress(literal))
      throw new Err("util.error.untrustedUrlRejected", { reason: "a private network address" });
    const address = literal ?? (await UntrustedFetch.#resolvePublicAddress(target.hostname, signal));
    const pinned = new URL(target.href);
    pinned.hostname = address.includes(":") ? `[${address}]` : address;
    const pinnedHeaders = new Headers(headers);
    pinnedHeaders.set("host", target.host);
    return await fetch(pinned, {
      headers: pinnedHeaders,
      redirect: "manual",
      signal,
      //? With the IP in the URL, serverName is what Bun sends as SNI and checks the certificate against.
      ...(target.protocol === "https:" && !literal ? { tls: { serverName: target.hostname } } : {}),
    });
  }

  static async #resolvePublicAddress(hostname: string, signal: AbortSignal) {
    const aborted = new Promise<never>((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    const records = await Promise.race([Bun.dns.lookup(hostname, { family: 0 }), aborted]).catch((error: unknown) => {
      if (signal.aborted) throw error;
      throw new Err("util.error.untrustedUrlRejected", { reason: "the host does not resolve" });
    });
    if (!records.length) throw new Err("util.error.untrustedUrlRejected", { reason: "the host does not resolve" });
    //? Every record is checked: a host answering one public and one private address must not get a second try.
    if (!records.every(({ address }) => UntrustedFetch.isPublicAddress(address)))
      throw new Err("util.error.untrustedUrlRejected", { reason: "a private network address" });
    return (records.find(({ family }) => family === 4) ?? records[0]).address;
  }

  static #accept(target: URL, response: Response, maxBytes: number, settle: () => void): UntrustedResponse {
    if (!response.ok || !response.body) {
      void response.body?.cancel();
      throw new Err("util.error.untrustedFetchFailed", { status: response.status });
    }
    const declared = Number(response.headers.get("content-length"));
    const totalBytes = Number.isFinite(declared) && declared > 0 ? declared : 0;
    if (totalBytes > maxBytes) {
      void response.body.cancel();
      throw new Err("util.error.responseTooLarge", { maxBytes });
    }
    return {
      url: target.href,
      status: response.status,
      headers: response.headers,
      body: UntrustedFetch.#limit(response.body, maxBytes, settle),
      totalBytes,
    };
  }

  static #limit(body: ReadableStream<Uint8Array>, maxBytes: number, settle: () => void) {
    const reader = body.getReader();
    let loadedBytes = 0;
    return new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          const next = await reader.read().catch((error: unknown) => {
            settle();
            throw error;
          });
          if (next.done) {
            settle();
            controller.close();
            return;
          }
          loadedBytes += next.value.byteLength;
          if (loadedBytes > maxBytes) {
            settle();
            await reader.cancel();
            controller.error(new Err("util.error.responseTooLarge", { maxBytes }));
            return;
          }
          controller.enqueue(next.value);
        },
        async cancel(reason) {
          settle();
          await reader.cancel(reason);
        },
      },
      { highWaterMark: 0 },
    );
  }

  static #withoutCredentials(headers: Headers) {
    const next = new Headers(headers);
    for (const name of UntrustedFetch.#crossOriginDroppedHeaders) next.delete(name);
    return next;
  }

  static #addressLiteralOf(hostname: string) {
    const unbracketed = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
    return UntrustedFetch.#ipv4Octets(unbracketed) || UntrustedFetch.#ipv6Hextets(unbracketed) ? unbracketed : null;
  }

  static #ipv4Octets(address: string) {
    const parts = address.split(".");
    if (parts.length !== 4 || !parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part))) return null;
    const octets = parts.map(Number);
    return octets.every((octet) => octet <= 255) ? octets : null;
  }

  static #ipv4Value(octets: number[]) {
    return octets.reduce((value, octet) => value * 256 + octet, 0);
  }

  static #isPublicIpv4(octets: number[]) {
    const value = UntrustedFetch.#ipv4Value(octets);
    return !UntrustedFetch.#blockedIpv4Ranges.some(([base, prefix]) => {
      const size = 2 ** (32 - prefix);
      const start = UntrustedFetch.#ipv4Value(base.split(".").map(Number));
      return value >= start && value < start + size;
    });
  }

  static #ipv6Hextets(address: string) {
    const unzoned = (address.split("%")[0] ?? "").toLowerCase();
    if (!unzoned.includes(":")) return null;
    const lastColon = unzoned.lastIndexOf(":");
    const dottedTail = unzoned.slice(lastColon + 1);
    const tailOctets = dottedTail.includes(".") ? UntrustedFetch.#ipv4Octets(dottedTail) : null;
    if (dottedTail.includes(".") && !tailOctets) return null;
    const hexText = tailOctets
      ? `${unzoned.slice(0, lastColon + 1)}${((tailOctets[0] << 8) | tailOctets[1]).toString(16)}:${((tailOctets[2] << 8) | tailOctets[3]).toString(16)}`
      : unzoned;
    const halves = hexText.split("::");
    if (halves.length > 2) return null;
    const groupsOf = (half: string) => (half === "" ? [] : half.split(":"));
    const head = groupsOf(halves[0] ?? "");
    const tail = halves.length === 2 ? groupsOf(halves[1] ?? "") : [];
    if (halves.length === 2 && head.length + tail.length > 7) return null;
    const groups = halves.length === 2 ? [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail] : head;
    if (groups.length !== 8 || !groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
    return groups.map((group) => Number.parseInt(group, 16));
  }

  static #isPublicIpv6(hextets: number[]) {
    const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets;
    const embeddedIpv4 = [h6 >> 8, h6 & 0xff, h7 >> 8, h7 & 0xff];
    const isZeroPrefix = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0;
    //? IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96) reach the IPv4 address in their last 32 bits.
    if (isZeroPrefix && h5 === 0xffff) return UntrustedFetch.#isPublicIpv4(embeddedIpv4);
    if (h0 === 0x64 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0)
      return UntrustedFetch.#isPublicIpv4(embeddedIpv4);
    if ((h0 & 0xe000) !== 0x2000) return false;
    //? Inside global unicast 2000::/3: IETF assignments incl. Teredo (2001::/23), documentation, 6to4 tunnels.
    if (h0 === 0x2001 && (h1 < 0x200 || h1 === 0xdb8)) return false;
    if (h0 === 0x2002) return false;
    return !(h0 === 0x3fff && h1 < 0x1000);
  }
}
