---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

The route JS budget stops failing deploy builds: a plain `akan build` reports an overage, `akan build --check-budget` fails on it, and CI runs that for `apps/minimal` and `apps/akan`, which now commit their `akan.budget.json`. The rc npm publish, which calls CI, skips that job, so an app's budget never holds a release.

- **Report by default:** a plain `akan build`, the one a deploy runs, prints a route over its entry, or an unreadable `akan.budget.json`, as a warning under the route table and passes, as `akan verify` does. `--quiet` drops the rest of the summary but still prints the warning.
- **`--check-budget`** fails the build on an overage, a route with no entry (a new page records its entry with `--update-budget` in the same change), an unreadable file, or an app with no file.
- **`--raise-budget`** re-records every route at its measured size and names the entries it raised, for the change that grows a route on purpose. An overage now names it with the app's own name, along with the file and section to edit by hand. `--check-budget`, `--update-budget` and `--raise-budget` exclude each other.
- **`System` counts as the SSR shell:** the generated root layout imports `System` whole because it serves SSR pages, the CSR shell and MCP App views. The measure now reads that import as `System/SSR.tsx` and leaves out `System`'s CSR and MCP App providers wherever an app imports `System`, since no server page renders them; every client entry is still built. On `apps/minimal` the median route drops from 342KB to 307.5KB brotli and the largest, `/:lang/explore`, from 499.1KB to 473.3KB. On `apps/akan` most routes drop about 1KB, because their other client entries load the providers' dependencies anyway.
