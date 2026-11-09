---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan build` measures the JavaScript each server route loads, and fails a route that outgrows the budget the app commits.

- **The measure:** the runtime, every client module statically reachable from the route's page and layouts, and their vendors, counted in the brotli bytes the server sends. A chunk loaded by a dynamic `import()` is left out, and so is the locale dictionary. A new `Measuring route JS` step names the largest route, and the summary lists the ten largest with their brotli and raw sizes. On `apps/minimal` the largest is `/:lang/explore` at 571.5KB brotli (1.6MB raw).
- **The budget:** `akan build <app> --update-budget` writes `apps/<app>/akan.budget.json` with the environment it built for and one `routeJsBrotliKB` entry per route. After that, `akan build` fails a route that passes its entry by more than the larger of 1% and 4KB, as the bundle size gate does, and names the route, its bytes and its limit, so CI stops the growth. The slack absorbs the `AKAN_PUBLIC_*` values a build inlines, so a budget recorded for one environment holds for another, and a failure says when the file was recorded for another one. The update adds a new route, lowers an entry its route now fits under and drops a route that is gone. It never raises an entry: to raise one, edit it by hand in the change that grows the route.
- **Where it fails:** `akan build` fails on an overage or an unreadable file, and `--update-budget` rewrites an unreadable file. `akan verify` measures but never fails on the budget, and a mobile or desktop build skips the step.
- **Opt-in:** an app without the file gets the report and nothing fails. A route without an entry is reported, not failed. `akan sync` accepts `akan.budget.json` at an app root.
