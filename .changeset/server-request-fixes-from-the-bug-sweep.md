---
"akanjs": patch
---

fix(server): request, render and live-sync fixes from the server bug sweep

- **A multi-hop `x-forwarded-host` / `x-forwarded-proto` is read by its first value** wherever the server builds a
  public URL — the host→basePath map, the locale redirect and the rendered alternates. `pub, lb:8080` used to be
  taken whole, so the map never matched and redirects fell back to the internal origin.
- **A client-side navigation renders with the locale and public path a page load of the same URL gets**, so on a
  sub-route host `usePage().path` no longer reads the internal basePath after a navigation.
- **Gateway-served immutable assets carry `X-Content-Type-Options: nosniff` and `Referrer-Policy`**, like every
  response the web router sends. The gateway answers `/_akan/client|styles|fonts/*` itself under `akan start` and
  with two or more replicas.
- **A respawned RSC worker whose init fails is replaced** instead of leaving every render queued behind it until
  the process restarts.
- **A multi-field query loader keys each document unambiguously.** Values that concatenated alike (`x` + `yz` and
  `xy` + `z`) shared a key, and both callers in the batch got the later document.
- **A live-sync room counts one join per socket.** A stray unsubscribe no longer drops a room other sockets are
  still in, and a socket that subscribed to the same room twice no longer leaves it behind when it closes.
- **`/mcp` reads the bearer scheme case-insensitively and past repeated spaces** (RFC 7235, RFC 6750), so
  `bearer <token>` is judged like `Bearer <token>` instead of passing as no credential.
