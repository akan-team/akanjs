---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

What a coding agent needs to build its first app is now written where it looks, and two messages say what to do next.

- **A query or mutation that answers `null` without `nullable: true`** now fails with `query <name> answered null, but its return is not nullable: answer a value, or declare { nullable: true } and answer null`. It used to fail with `Required Any value: null`, or `Invalid Value (Nullable)` for a model, which named neither the endpoint nor the fix.
- **`akan build` for the `local` environment** ends its summary with one line: such a build serves the dev routes to every caller, and a host others can reach needs `AKAN_PUBLIC_ENV=main`, `AKAN_PUBLIC_REPO_NAME` and `AKAN_PUBLIC_SERVE_DOMAIN`. A build for any other environment prints nothing new, and the check that refuses a deployed build with stand-in values is unchanged.
- **The `akan-page` skill** carries a one-screen API summary: a data-driven `<title>`, an async render, `router.notFound()` and a layout's `.notFound()` / `.error()`, `Link`, and a shallow `router.replace` for a client filter kept in the URL. The page rule names the shallow replace too.
- **The `akan-service` skill** carries a recipe for pages backed by an external HTTP API: an `adapt()` adapter in `srvkit/` that reads its base URL at boot, a `lib/_<service>` service, a `Public` `query(Any, { nullable: true })` endpoint and its dictionary label, and the page that calls it.
- **The README's "Inside an existing repository"** runs the creator through `npx -y bun@1.4.4 x …` on a host with only Node and npm, so nothing global is written. It also gives copy-ready `build` and `start` scripts, says a fresh clone builds without a committed env file, and says which environment a `.env`-less build is for and what a deployed host sets instead.
