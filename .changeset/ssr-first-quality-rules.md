---
"akanjs": minor
---

feat(devkit): measure and enforce the server/client render split with `akan quality ssr`

Agent-written UI drifts client-side. The boundary conventions say which file role carries `"use client"`, but
nothing said how *little* should sit behind it, so markup that could ship as HTML kept landing in the bundle.
`akan quality ssr` now reports the server render share per app and lib and flags the client code that should have
rendered on the server; `akan quality scan` includes both, and `--format json` carries an `ssrBalance` field.

**The share is measured in JSX elements, not files.** A file count cannot move: the module convention already fixes
`Zone`/`Template`/`Util` as client and `Unit`/`View` as server, so the ratio sits near 3:2 whatever an agent
writes. Element mass is what actually shifts when rendering moves across the boundary.

Six rules under a new `ssr` warning scope:

- `akan.ssr.unnecessary-use-client` — the directive is present but the file uses no hook, event handler, store, or
  browser API.
- `akan.ssr.client-static-component` — a component inside a client file renders markup with zero client-only
  capability.
- `akan.ssr.client-static-markup` — a large subtree wraps one or two interactive touches.
- `akan.ssr.client-mount-load` — a `useEffect(…, [])` loads server data the route could have fetched first.
- `akan.ssr.module-missing-server-view` — a module renders only from `Template`/`Zone`/`Util` and declares no
  `Unit`/`View`.
- `akan.ssr.template-client-state` — a `Template` holds form state in `useState` instead of the store.

Three exemptions keep the rules from firing on code that has no server alternative, and each one exists because the
naive version was noisy in practice. A file importing a bare third-party package may need the directive for the
package's sake, not its own — without this, chart, swiper, markdown, and editor wrappers dominated the output.
`ui/<Folder>/index_.tsx` is the declared `lazy()` boundary. And only *mount-time* loads count as findings: a
`fetch.*` inside an `onClick` is an interaction, and a poll inside `useInterval` has no server equivalent, so
neither is flagged.

The 50% server-share target is reported as a metric, not a warning. A scope can be legitimately client-heavy — a lib
of third-party wrappers will never reach it — and a threshold that fires on unfixable code trains agents to ignore
the tool, so the warnings stay individually actionable and the share stays a scoreboard.

Guidance ships with it: an **SSR First** section in the workspace `AGENTS.md` (and in the generated-workspace
template) covering the cost model, the rule table, and a ten-point server-side playbook — client shells that render
`children` untouched, `Tab`/`Tab.Panel` composition that keeps panel content server-rendered, `init`/`view`
state-sync instead of mount fetching, passing an unawaited `ClientInit` promise so `Load.*` streams it behind a
skeleton, named `ReactNode` slots, derived work on `Light<Model>`, server-side auth gating, and CSS variants in
place of client state. The same content is fetchable as the `ssrRule` guideline (`akan guideline show ssrRule`,
`get_guideline`) and mirrored into `.cursor/rules/ssr-first.mdc`.
