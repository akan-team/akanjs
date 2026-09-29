---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan start-desktop`, `start-ios` and `start-android` print a page's log once, at the level it was logged, and say a
boot came up in one line

- A boot that comes up prints `cmdc ios ready · iPhone 16 · http://localhost:8283 · 12.4s` and nothing else; its steps
  (prepare, build, install, launch) are debug. A boot that fails prints every step it took ahead of the error. A native
  config warning still prints as it happens.
- A page line reads `WARN  [page:WsClient] WebSocket message process failed …`: stamped once by the CLI's logger, at
  the page's own level, with no `[default]` label, no empty line after it, and a multi-line message kept together. A
  page logger writes `[Name] message` at the console method of its level inside a native shell, and the desktop host
  and iOS tag each line `[page<+><#window> <level>]` for the CLI to read back.
- Android forwards the page console through the bridge in a dev build too, so logcat carries each line at its level
  and a `console.error("%s", …)` substitution the way the devtools show it; iOS writes os_log at the page's level. An
  uncaught error forwards its message along with WebKit's frames, which carry none.
- Frame tracing (`[akan:frame:…]`) is opt-in (`?akanFrameDebug=1` or `localStorage["akan:debug:frame"] = "1"`) and
  logs at debug, once per event; a mobile or desktop target no longer turns it on for every visibility change.
- Lines no page or host wrote (the simulator, WebKit) and where the host's pages come from are debug; `--verbose` shows
  the former. `start-desktop` and friends ask a dev server whose builder idled out for its health, not its home page,
  so they no longer report it missing while it wakes.
