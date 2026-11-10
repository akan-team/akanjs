---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan build` measures the JavaScript each server route loads, and reports a route that outgrows the budget the app commits; `akan build --check-budget` fails on it.

- **The measure:** the runtime, every client module statically reachable from the route's page and layouts, and their vendors, counted in the brotli bytes the server sends. A chunk loaded by a dynamic `import()` is left out, and so is the locale dictionary. A new `Measuring route JS` step names the largest route, and the summary lists the ten largest with their brotli and raw sizes. On `apps/minimal` the largest is `/:lang/explore` at 473.3KB brotli (1.2MB raw).
- **The budget:** `akan build <app> --update-budget` writes `apps/<app>/akan.budget.json` with the environment it built for and one `routeJsBrotliKB` entry per route. After that, a route that passes its entry by more than the larger of 1% and 4KB, as the bundle size gate allows, is an overage, named with its bytes and its limit. The slack absorbs the `AKAN_PUBLIC_*` values a build inlines, so a budget recorded for one environment holds for another, and an overage says when the file was recorded for another one. The update adds a new route, lowers an entry its route now fits under and drops a route that is gone. It never raises an entry: `--raise-budget` or a hand edit does, in the change that grows the route.
- **Where it fails:** only `akan build --check-budget`, on an overage, a route with no entry, an unreadable file or a missing one. A plain `akan build` warns of each under its route table, and `--update-budget` rewrites an unreadable file. `akan verify` warns of each route over its entry and of an unreadable file, one line each, but never fails on them. A mobile or desktop build skips the step.
- **Opt-in:** an app without the file gets the report and nothing fails, unless `--check-budget` asks for it. A route without an entry is reported, and fails only `--check-budget`. `akan sync` accepts `akan.budget.json` at an app root.
