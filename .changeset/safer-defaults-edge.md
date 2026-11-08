---
"akanjs": patch
---

The server, gateway and image optimizer bound the resources one client can hold, and HTML responses carry stricter default headers.

- A connection that sends nothing for 120 seconds is closed, where it used to stay open for good; `akan start` keeps it open. A request whose handler is still working is never cut; a streamed response that sends nothing for that long is. `AKAN_IDLE_TIMEOUT` (`30` or `30s`) sets it, up to Bun's 255, and `0` restores the old behaviour. The gateway's WebSockets now idle out the same way after 120 seconds without a frame, which the automatic pings keep from happening to a live socket; `AKAN_WS_IDLE_TIMEOUT=0` restores the old behaviour.
- A request body is capped at 128 MiB server-wide (`AKAN_MAX_UPLOAD_BODY`, e.g. `512mb`, `512M`, `1.5g` or `512MiB`), and a body other than `multipart/form-data` at 16 MiB (`AKAN_MAX_REQUEST_BODY`, `off` lifts it). A declared length over the cap gets 413 before the body is read, and a chunked body gets 413 once it passes the cap.
- A size or timeout value the server cannot read is logged once as a warning, and the default applies.
- `akan start` binds the dev server to 127.0.0.1 outside a container instead of every interface. `AKAN_LISTEN_HOST=*` binds every interface again, and `AKAN_LISTEN_HOST` still takes one address.
- The gateway's socket to its replicas is readable and writable by its owner only.
- The gateway closes a WebSocket with 1009 when it sends more than 1 MiB before its replica's socket opens, and with 1013 when that socket has not opened within 10 seconds. `AKAN_MAX_WEBSOCKETS` and `AKAN_MAX_WEBSOCKETS_PER_IP` cap open sockets in total (503) and per client address (429); both are unset by default.
- A production HTML page answered 200 carries `Cache-Control: no-cache`, or `private, no-cache` when the request has an `Authorization` header or a cookie other than `theme`. `AKAN_HTML_CACHE_CONTROL` sets the anonymous value, and `off` sends no header as before.
- A production HTML page served over HTTPS carries `Strict-Transport-Security: max-age=31536000`. `AKAN_HSTS` sets another value, and `off` drops it.
- HTML pages, system pages and the gateway's status pages carry `Content-Security-Policy: frame-ancestors 'self'; base-uri 'self'`, and system and status pages also `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`. `AKAN_CONTENT_SECURITY_POLICY` replaces the policy, and `off` drops it; there is no default `script-src`, as the pages inline their bootstrap scripts without a nonce.
- `/__rsc/manifest` is served in development only. `AKAN_EXPOSE_RSC_MANIFEST=1` serves it in production again.
- The client reads a 413 answer as `base.error.payloadTooLarge` ("The request is too large for the server to accept.") instead of an unexpected response, and does not send it again.
- A static file whose real path, after symlinks, is outside the public directory is not served, except the `public/libs/<lib>` links `akan sync` makes to a lib's own public directory.
- The 404 page's retry link always points at the same origin, whatever the requested path starts with.
- The image optimizer keys a local image by its path, so a query string no longer makes a new cache entry unless a `localPatterns` entry names that query.
- The image optimizer keeps its disk cache under `images.maxCacheBytes` (default 1 GiB, `0` for no limit), removing the oldest entries first.
- The image optimizer answers 503 with `Retry-After: 1` once `images.maxQueue` encodes (default 256, `0` for no limit) are waiting for a free slot.
- The image optimizer serves a source over `images.maxInputPixels` (default 120 million) as it is instead of decoding it.
- The image optimizer refuses, with 400, a remote image whose host, on any redirect hop, resolves to a loopback, private, link-local or other non-public address. `images.dangerouslyAllowLocalIP: true` allows them again.
- The image optimizer answers 502 when a remote image request fails, instead of passing the remote status on.
- An IPv6 address that carries an IPv4 one (mapped, compatible, NAT64, 6to4, Teredo) is judged by the IPv4 address it carries when deciding whether an address is private.
- With `AKAN_TRUSTED_PROXIES` unset, the server logs one warning when a non-loopback proxy passes on an `X-Forwarded-For` chain whose last hop is not its `X-Real-IP`, or several hops and no `X-Real-IP`. The warning names the proxy's address and suggests listing it; the default reading of the headers is unchanged.
