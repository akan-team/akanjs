---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix(agent): stop a workspace's agent guide and lint config from freezing at the release that created it

`createWorkspace` copies the whole `templates/workspaceRoot` tree — 21 `.cursor/rules/*.mdc`, `AGENTS.md`,
`biome.json`, `tsconfig.json` — but the only maintenance path, `generateAgentRules`, rewrites three of them, and
`akan agent install` refreshes only the `akan:agent` block inside `AGENTS.md`. Twenty-one files created, three
maintained: everything else was a one-time copy that no framework release could ever reach. Adding one lint rule
meant writing the same sentence into `AGENTS.md`, `.cursor/rules/lint-enforced-rules.mdc`, its `.mdc.template`,
`AGENTS.md.template`, `biome.json`, and `biome.json.template` — and even then, no existing workspace saw it.

Four changes, ordered by how much drift each removes.

**Lint config now extends a config shipped in the package.** `@akanjs/devkit/biome.base.json` carries the
formatter, the rule set, and every grit plugin registration; a workspace `biome.json` is `extends` plus its own
`files.includes`. Biome resolves the specifier through node_modules (it does not consult the package `exports`
map), and `plugins` paths inside an extended config resolve from the entry config's directory, so the
`./node_modules/@akanjs/devkit/lint/*.grit` form the template already used is correct. Rule changes now reach a
workspace on `bun update` with no command to run. Two merge behaviours decided the split: `overrides` concatenate,
so the generated-file opt-out moved there from `files.includes`, which *replaces* and would silently drop the base
list the moment a workspace added one exclusion of its own. Because Biome moves rules between groups across minors
(`noUnnecessaryConditions` is `nursery` at 2.4 and `suspicious` at 2.5, and the old position is a hard error), the
base config and the Biome version travel together: `biomeBase.ts` pins the version `createWorkspace` installs
instead of resolving `latest`.

**The conventions body moved into the managed block.** It now ships as the `conventions` guideline and renders
between the `akan:agent` markers, so `akan agent install` refreshes it. `AGENTS.md.template` carried a *second*,
independently written 990-line convention guide — not a copy of the repo's 791-line one, a parallel fork — which
became the `workspaceOnboarding` guideline. Onboarding renders only outside the framework monorepo, where it would
otherwise double an always-loaded file for readers who are changing Akan rather than building on it. The two
guides still overlap and would repay a merge.

**The 20 duplicate Cursor rules are gone.** `akan.mdc` is `alwaysApply: true` plus `@AGENTS.md`, so the per-topic
`.mdc` files were a second copy of the same rules drifting on their own schedule. This repo had all 20 and no
`akan.mdc` at all; it now has the pointer and nothing else.

**`akan doctor` reports drift.** The block is stamped with the `@akanjs/devkit` version that rendered it, and
doctor warns `agent-guide-stale` (or `agent-guide-unstamped`) with `akan agent install agents-md` as the repair.

**`repoName` no longer comes from the folder name.** `WorkspaceExecutor.fromRoot` defaulted to
`path.basename(process.cwd())`, so every generated file that names the repo — the `AGENTS.md` title, its `- Repo:`
line — depended on what each person called the directory they cloned into, and the committed diff never settled.
It now resolves from the `origin` remote, falling back to the directory name when there is no git or no remote.
`AKAN_PUBLIC_REPO_NAME` is deliberately not consulted: that is a deployment namespace (queue prefixes, cache keys,
secret paths) which a monorepo hosting several products legitimately points elsewhere.

Two bugs surfaced on the way. `## Validation` listed `akan quality scan` and `akan quality ssr` in a *generated*
section — hand-added, and due to be wiped by the next install; they are in the generator's list now. And
`no-throw-raw-error` exempted `apps/akan/env/**` by name, so `apps/minimal/env/*` failed a rule the guide said did
not apply to `env/`; the exemption is `**/env/**`. Lint output over the whole repo is otherwise byte-identical
before and after, and formatter output is unchanged.

Biome itself moves to **2.5.8** in the same change, so the shared config targets the current release rather than
freezing the ecosystem at 2.4.4 — workspaces created before this already installed a 2.5.x, and pinning backwards
would have made adoption a downgrade. The jump adds 263 diagnostics across the monorepo, but only **32 of them are
in `apps/` and `libs/`** (30 `noUnnecessaryConditions`, 2 `useArrayFind`) and the rest are in the framework's own
`pkgs/`. No scope regressed from passing to failing: `akan lint minimal`, the one green scope, is still green, and
`apps/akan`, `libs/util`, and `libs/shared` were already failing on 2.4.4 with pre-existing errors. Every grit
plugin was re-verified against 2.5.8. `noUnnecessaryConditions` stays at `error` and now reports 220 repo-wide,
190 of them in `pkgs/` — a real backlog, and a deliberate one to leave visible rather than downgrade to a warning.

Existing workspaces keep working untouched — they simply stay frozen at the release that created them, which
`akan doctor` now reports. The migration guide walks through adopting the change in four steps, only one of which
needs a human decision.
