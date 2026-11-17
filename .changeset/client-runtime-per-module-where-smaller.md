---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

Under `clientRuntime: "route"`, a page loads per module only where that makes it smaller, and a page that keeps the whole runtime no longer carries a module's API descriptions twice. With `"all"`, the default, nothing changes.

- `akan build` sizes every route twice: as the analysis planned it, and with every client entry keeping the whole runtime. A route no smaller per module is built again keeping the whole runtime, and stays that way only if it then came out smaller than it was; otherwise it loads per module as planned. The build says what it did in one line: `N routes load per module, M keep the whole runtime because per module would not be smaller`. `akan quality runtime` names the first routes of each kind (`--format json` names all), and the build lists them at the `verbose` log level.
- A page keeping the whole runtime beside pages that load per module took a module's API descriptions from `lib/useClient.ts` and again from that module's `lib/__client/*.fetch.ts` piece. Now `lib/useClient.ts` leaves out what those pieces hold and loads the pieces first, so each description ships once.
- A client entry that no per-module page loads keeps the whole runtime wherever some page does, so the files it shares with that page bring no pieces to it.
- The build warns when a route still loads a scope's whole file together with a piece repeating part of it.
- `akan quality runtime` prints what the last build of each app decided: the routes loading per module, and for every entry keeping the whole runtime the file and line to change, or the rule that keeps it.
- An app with routes to measure bundles its browser code at least twice instead of once: as planned, with everything whole, and then once per round of routes it tries keeping whole, six rounds at most (two to four bundles in the apps measured so far). An app whose every route keeps the whole runtime for a reason in a file bundles once, as before.
