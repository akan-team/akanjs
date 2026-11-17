---
"akanjs": minor
---

A native app's page now sends its errors to `/_akan/client-report` when `option.setClientReport` is on. The page is bundled into the app and loaded from `app://localhost` or `https://app.localhost`, another origin than the server, so no page view gave it a signed id and the browser listeners never ran there. At its first `window.onerror` or unhandled rejection (React's uncaught and recoverable errors and a failed native plugin call among them) it asks `GET /_akan/client-report` on the app's server for an id, which the server gives only to a shell origin, counted against `perAddress` and drawn against `sampleRate` like a page view, and asks again after 30 minutes. Its reports go through the same checks and caps as a browser page's, reach `setErrorReporter` as a `BrowserError` whose new `data.shell` (`BrowserErrorShell`, added to `akanjs/signal`) names the shell and whose `traceId` is the ask's request id, and are logged as `Native <shell> page error`. A web page loads nothing more, and a page with no error sends nothing.

Upgrade: a reporter that reads `BrowserError.data` needs no change; `shell` is `null` for every browser page. Code that builds a `BrowserErrorData` itself, such as a test fake, adds `shell: null`.
