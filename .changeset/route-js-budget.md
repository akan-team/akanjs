---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan build` measures the JavaScript each server route can load, and fails a route that outgrows the budget the app commits.

- **The measure:** what a route can load before it hydrates. That is the runtime, every client component its page and layouts import, and the vendors those import, counted in the brotli bytes the server sends. A new `Measuring route JS` step names the largest route, and the summary lists the ten largest with their brotli and raw sizes. On `apps/minimal` the largest is `/:lang/explore` at 571.5KB brotli (1.6MB raw).
- **The budget:** `akan build <app> --update-budget` writes `apps/<app>/akan.budget.json` with one `routeJsBrotliKB` entry per route. After that, `akan build` fails a route over its entry, naming the route, its size and its entry, so CI stops the growth. The update adds a new route, lowers an entry its route now fits under and drops a route that is gone. It never raises an entry: to raise one, edit it by hand in the change that grows the route.
- **Opt-in:** an app without the file gets the report and nothing fails. A route without an entry is reported, not failed. `akan sync` accepts `akan.budget.json` at an app root.
