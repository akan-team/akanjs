---
"akanjs": patch
---

fix(dev): dev documents skip the browser's HTTP cache, the HMR socket answers only its own origin, and superseded server bundles are removed during a session

- Under `akan start`, SSR pages and the dev CSR shell are sent with `Cache-Control: no-store`, so going back to a
  page no longer replays a document rendered by a build the server has moved past. `akan build` output is unchanged.
- `/_akan/hmr` refuses an upgrade from a page on another origin, by the rule mutations already follow (the serving
  host, the native shells, and `allowedOrigins`): its messages carry build errors and the names of the files being
  edited, which a `--share` visitor's page or another site open in the same browser could otherwise read.
- A render error's overlay clears once the page renders again, instead of staying on every tab until it reconnects.
  The HMR socket's reconnect backoff starts over at the server's hello rather than when the socket opens, so a
  gateway whose upstream keeps failing is no longer asked every 250ms.
- A pages build that changes server output no longer leaves the bundle before it in `.akan/artifact/server` for the
  rest of the session (8MB on minimal, 21MB on apps/akan): each time the RSC worker takes a new bundle, the ones it
  has moved past that are over a minute old are removed, so a burst of saves leaves its bundles only until the next
  server-side save after it. A CSS change removes the stylesheets no tab can still link to the same way.
- `getAkanHmrPhase()` and `isAkanHmrApplying()` from `akanjs/common` are deprecated: nothing sets the phase any more,
  so they always answer `null` and `false`.
