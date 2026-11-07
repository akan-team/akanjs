---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A coding agent can now see a page run before it reports a change as done. `akan preview` opens pages in a headless browser, and the dev server now logs what any page it serves throws.

**Upgrade note.** Run `akan agent install` and commit what it writes. The Work Loop in `AGENTS.md` gains a step: after a page, UI or runtime change, run `akan preview <app> --changed` and quote its verdict lines. The `akan-debug` skill now covers `akan preview` too.

- **`akan preview <app> [paths]`** opens each page and prints one verdict line per page (`ok`, `warn` or `FAIL`), with its status, title and load time, plus where a redirect landed. Under the verdict line it lists any uncaught errors, the server errors logged for that request, console errors and warnings, and layout problems. It exits 1 when a page failed.
  - It reuses a dev server that answers on the app's dev port as this app from this checkout. Otherwise it starts `akan start <app>`, waits until the server has booted or failed to boot, and stops it afterwards. `--keep` leaves that server running and prints how to stop it. The server's output goes to `local/apps/<app>/runtime/preview/server.log`.
  - A page fails on a 4xx or 5xx status, an empty body, the server's error page, the dev build overlay, an uncaught error, a console error, a server error logged for it, or a load that times out. Console warnings and layout problems make the verdict `warn`: a page wider than the viewport, text the same colour as its background, or a dropped daisyUI colour class.
  - Paths are comma-separated, and the default locale is added when a path has none. `--changed` adds the pages that uncommitted page and layout changes reach, falling back to `/` when no route changed. It opens at most 8 pages and lists any dynamic pages it could not open.
  - `--csr` loads each page through the CSR boot a native app uses. `--desktop` uses a 1280×800 viewport instead of 390×844. `--screenshot` saves a PNG per page. `--timeout` sets the seconds a page may take, 60 by default. `--format json` prints the full report.
  - The engine is Bun.WebView: WebKit on macOS, so nothing is downloaded, and an installed Chrome or Chromium elsewhere. `--engine` picks one.
- **Client errors in the dev log.** In `akan start`, every page the dev server serves reports its uncaught errors and unhandled rejections to the dev server, whether it runs in a browser, a CSR boot or a native shell. They are logged as `ClientReport` error records naming the page, its boot (`ssr` or `csr`), and the platform and target of a native shell, so `akan logs` and the dev terminal show them. A page reports at most 50, and control characters are stripped before a report is logged.
- **`akan context --app <app>`** lists the app's routes: path, file, search keys, and whether a guard applies, its own or a layout's. Past 60 routes the largest folders fold into one line each. `--format json` lists every route.
- **`@akanjs/devkit/preview`** exports `PreviewView` and `PreviewChrome`, which moved out of the code agent. `PreviewView.probe()` gains a deadline, a settle time, the page's final URL, title, visible text, status and console warnings. The `akan code` preview check now reports console warnings too.
