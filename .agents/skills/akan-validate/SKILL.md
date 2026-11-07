---
name: akan-validate
description: "Run the akan check loop after editing and fix each failure class the right way — no silencing, no lint-disable, no gaming the checker."
---

<!-- akan:generated -->

# Akan validation loop

## One call does the whole chain

`akan verify` (the `akan_verify` tool in akan code) syncs, lints with fixes, typechecks, fast-builds each
changed app, and runs the SSR check for a `.tsx` change — over everything the working tree has changed, in one
process. It prints one line when it passes and one line per problem when it fails. **Run it after editing,
before you say you are done.** In akan code it also runs itself at the end of a turn that changed source.

Never run `akan lint`, `akan typecheck` and `akan build` in turn: that is the same work three times over, at
three times the output. Narrow the one command instead:

- `akan verify <app-or-lib-or-pkg>` — that target whole, changed or not.
- `akan verify --lint-only` — the quick pass between edits.
- `akan verify --no-build` — leave the app build out.
- `akan verify --max 0` — every line, when the report ends in `+N more`.
- `fixed N files` in the header means lint rewrote them on disk: re-read before editing them again.

Raw `tsc` misses the generated barrels and reports false errors. Do not reach for it.

## Fixing rules

**Apply the real fix the rule intends. Do not silence the checker.** No blanket lint-disable, no throwaway
re-export, no export-in-place trick, no `as any`, no non-null assertion. Gaming a check is a defect, not a
fix. When a suppression is genuinely right it carries a reason:
`// biome-ignore lint/<rule>: <why>` — and a grit plugin diagnostic is suppressed as `lint/plugin`, not the
bare `plugin` category Biome's own message suggests.

Common classes and their real fix:

| symptom | fix |
| --- | --- |
| a member "already exists" or conflicts with the base class | you redeclared something Akan generates, usually store CRUD. **Delete your version** and call the generated one — do not rename, cast, or suppress. See `akan-store`. |
| `throw new Error` | a typed `Err` with a dictionary key. See `akan-err`. |
| an edit to a generated file | regenerate instead: `akan sync <app>` or `repair_generated`. |
| a file in the wrong place | relocate to `common/` / `webkit/` / `srvkit/` / `ui/`. Never a sibling helper `.ts` inside `lib/<model>/`. |
| a missing dependency | declare it in the owning app or lib `package.json`. See `akan-deps`. |
| a Tailwind class order or colour complaint | let the formatter sort; use semantic tokens. See `akan-ui`. |

Re-run until clean. If a failure is genuinely outside the scope of what you changed, say so in your reply
instead of forcing it.
