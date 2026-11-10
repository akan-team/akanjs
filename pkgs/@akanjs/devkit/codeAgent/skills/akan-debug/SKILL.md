---
name: akan-debug
description: "Check and debug a running Akan app: akan preview for what a page shows and throws, where the dev-server log is, how to read it, and how to tell a runtime failure from a build one."
---

# Akan debug

## See the change run: `akan preview`

`akan preview <app> [paths]` opens pages of the app's dev server in a headless browser and prints, per page,
the HTTP status, the title, a slice of the visible text, the uncaught errors and rejections the page reported,
the server errors logged meanwhile, console errors and warnings, and layout smells. It exits 1 when a page failed.

- It uses the dev server that answers for this app and checkout. With none, it starts one for the run and
  stops it after; `--keep` leaves it up for the next preview. It never starts a second server beside a
  running one.
- Paths are comma-separated (`akan preview <app> /board,/board/new`) and get the default locale when they lack
  one, unless the app sets `localePrefix: "as-needed"` and `--csr` is off. What the server answers outside a
  locale opens as written: a `/_akan` route such as Studio (`/_akan/studio?view=runtime`), a route under the
  API prefix, `/__csr`, `/__rsc`, `/.well-known`, `/openapi.json`, the default `/mcp`, `/favicon.ico`,
  `/robots.txt`, `/sitemap.xml`, `manifest.webmanifest` and a file in the app's `public/`. A full URL
  (`http://localhost:<port>/oauth/token`) opens exactly as written: use it for an endpoint mounted outside the
  API prefix or a custom MCP path. A page `--changed` finds always gets the locale.
  `--changed` adds the pages your uncommitted page and layout edits reach. A dynamic route needs a concrete
  path (`/memo/1`); `akan context --app <app>` lists every route with its params and search names.
- The viewport is a 390x844 phone; `--desktop` is 1280x800. `--csr` loads each page in the CSR boot the native
  shells load. `--screenshot` saves a PNG per page under `local/apps/<app>/runtime/preview/`, for a model
  that reads images. `--format json` gives the same report as data.

### Which platforms that covers

- Every change: the server-rendered web page and, with `--csr`, the bundle the iOS, Android and desktop
  shells run.
- A change to `native/`, `plugin/`, an `isNativeApp()` branch, `native` in `akan.config.ts` or an
  `@akanjs/native` plugin also needs that shell: `akan start-ios`, `start-android` or `start-desktop` on top of
  the running dev server. Errors thrown in the shell reach the same dev-server log as `ClientReport` lines
  tagged with the platform and target. Capture the shell with `xcrun simctl io booted screenshot <file>.png` or
  `adb exec-out screencap -p > <file>.png`. When you cannot run the shell, say so: "not checked on iOS".
- Real devices, memory, OTA updates and store builds are for whoever releases.

### What goes in your answer

The verdict lines of the pages you changed (`ok    /en/board  200  "Board"  1.4s`) and every finding you left
unfixed. "Not opened in a browser" is not an answer once `akan preview` can run.

## The log is a file, and that file is the whole session

A supervised `akan start` writes **`local/apps/<app>/runtime/dev.log`** — no ANSI, nothing truncated, every
process of the app in arrival order, including the dev host's own build output, which reaches no other
file. The previous session is kept beside it as `dev.prev.log`.

Read that file. Do not ask for a paste of the terminal: the full-screen view repaints one frame in place, so
what survives in the scrollback is bordered and truncated to the pane.

- `tail -n 200 local/apps/<app>/runtime/dev.log` after an edit, to see what the reload produced.
- `akan logs <app>` tails a running server with `--level --grep --endpoint --trace --child --role --origin
  --since` and `--json`.
- The dev server's URL is printed in that log. A server `akan preview` started logs to
  `local/apps/<app>/runtime/preview/server.log` instead.
- An uncaught error or unhandled rejection in a page reaches the server log as a `ClientReport` error line,
  naming the page, the client (`ssr` or `csr`) and the native target.

## Which loop you are in

- **A type or lint failure** is the `akan-validate` loop: `akan verify`.
- **A runtime or SSR failure** is the dev log. The page renders blank, an overlay appears, or a request
  500s — none of that shows up in a typecheck.

If a dev server is already running for the app, do **not** start another. If it looks wedged, surface the
log tail in your answer rather than killing it.

## Reading a log line

Every `Logger` call carries `traceId`, `endpoint` and `origin` alongside the message, so one request's lines
share a trace — `akan logs <app> --trace <id>` pulls just that request. The level ladder is
`trace verbose debug info warn error`; `.log()` is deprecated and emits at `info`, which is why a call that
reads like its own level is not one.

## Before you conclude

A change that renders is not a change that passed. Run `akan verify`; for a `.tsx` change it also runs the
SSR check, since a UI edit that moves markup into a client bundle typechecks perfectly.
