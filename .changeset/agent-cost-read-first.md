---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
"create-akan-workspace": patch
---

A coding agent spends fewer calls before and after its first passing test.

- The generated `AGENTS.md` gains a `Read First` section: the docs for three common tasks (pages over an outside HTTP
  API, a stored model and its screens, a page alone) as one `cat`, enough to start together with the path rules of
  the files written. Its Work Loop runs `akan verify` before a slow end-to-end suite, and its Generated Files section
  says that generated files, `.akan/` and env files are git-ignored and that `akan build` writes them, so a fresh
  clone builds as it is.
- The `akan-page` skill says a layout's `.notFound()` and `.error()` are drawn as that layout's `.render()` children,
  and that `Link` has no `shallow` (an `onClick` calls `router.push(href, { shallow: true })`). The `akan-service`
  recipe shapes the upstream JSON in a TypeScript `private` helper, which lint accepts in a service where `#private`
  is refused. The `style` rule says the frame around a page draws nothing on the web without Tailwind. The `ssr`
  rule says what each server-component lint refuses: a client hook or `st` import, `"use client"`, and an inline
  function prop other than `loader`, `render` and `of`; plain objects and arrays cross into a client component.
- `create-akan-workspace` treats a Bun installed with `npm i -g bun` as npm's: the workspace lists `bun` in its
  dependencies and gets the `build` and `start` scripts, as it does under `npx bun`. The `akanjs` README says the
  creator builds and starts nothing, and that `npm run build`, `npm start` and `npx akan` run such a workspace.

Run `akan agent install` in a workspace to pick up the new files.
