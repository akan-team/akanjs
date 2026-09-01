---
"akanjs": patch
"@akanjs/devkit": patch
---

perf(build): precompress the CSS bundle, and serve brotli sidecars ahead of gzip

The compiled stylesheet went out uncompressed in production. `precompressArtifacts` only walked
`.akan/artifact/client`, so every JS chunk got a `.gz` sidecar while the CSS — written to
`.akan/artifact/styles` — got none, and `#fileResponse` fell through to streaming the raw file. Nothing was
wrong on the serving side: `#isCompressible` already accepts `text/css` and the sidecar lookup already ran.
The file simply was not there. On one deployed app that was 319KB on the wire per cold load, against 45KB
gzipped. The CSS is and always was minified — Lightning CSS runs in `prepareCssAsset` — so this is purely the
transfer encoding.

Sidecars are now written for `styles/` too, and a `.br` sidecar is written alongside every `.gz`.

Brotli is tried first and gzip remains the fallback, because browsers only advertise `br` on secure origins.
Quality is 11 for CSS and 9 for everything else: there is one CSS asset per basePath and it is the largest
single file an app ships, worth ~20% over gzip for ~0.2s, while spending 11 on several hundred JS chunks costs
~12s of build time for a few hundred KB. Measured on `apps/akan`: 371 files, 14.5MB raw, 4.2MB gzip, 3.9MB
brotli, and the CSS bundle 103KB raw → 16.2KB gzip → 13.0KB brotli. The compress phase went from ~0.3s to
~0.64s. Gzip sidecars moved to level 9, which is free at build time and was previously left at the default.

Encoding negotiation moved out of `WebRouter` and `AkanApp` into `resolveEncodedSidecar`. Both classes carried
their own copy of the gzip lookup plus `#acceptsGzip` / `#isCompressible`, and a gateway that disagrees with
its child about which encoding a request accepts serves a body the caller cannot decode. The shared version
also honours `q=0` as the refusal it is, and no longer treats a token merely starting with `br` as brotli.

**Anything caching in front of the app must pass `Vary: Accept-Encoding` through.** The header was already
set, but it only mattered when one encoding was on offer; with two, a proxy that drops or ignores it will
hand a brotli body to a client that asked for gzip. Artifacts now carry both sidecars, so a build's static
output grows by roughly the brotli total (3.9MB for `apps/akan`).
