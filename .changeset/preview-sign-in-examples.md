---
"akanjs": minor
"@akanjs/cli": minor
"@akanjs/devkit": minor
---

feat(cli): `akan preview` opens pages signed in through `preview.signIn`, and `[param]` routes through `preview.examples`

`akan preview` opened every page with an empty cookie jar, so a page behind a sign-in showed its redirect, and
`--changed` listed every route with a `[param]` as not opened. An app now declares both in `akan.config.ts`:

- `preview.signIn({ origin, as })` is called once per run, after the dev server answers. It returns the sign-in
  `Response`, whose `Set-Cookie` pairs become the cookies of every page the run opens, or the cookies by name for a
  session the app's own client writes. It reads the account from the environment; the report says only
  `Signed in through preview.signIn.`, never a cookie. `--as <name>` reaches it as `as`, and `--anonymous` skips it.
- `preview.examples` lists concrete paths, without the locale. `--changed` opens a `[param]` route at the first one
  that fits its pattern, query kept.

**Upgrading.** Nothing to change. The JSON report gains `signedIn`, and the not-opened line of a `[param]` route now
ends `needs a concrete path, typed or declared in preview.examples`: a script matching the old line needs the new one.
