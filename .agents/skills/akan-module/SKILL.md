---
name: akan-module
description: "Add or change an Akan database module: the constant→dictionary→document→service→signal→store→UI flow and which layer owns what."
---

<!-- akan:generated -->

# Akan module flow

Creating a **new** module? Do not hand-write these files — scaffold with `create-module` first (the
`akan-scaffold` skill), then fill in the layers below.

A stored model flows through layers, one file each under `lib/<model>/`:

`constant → dictionary → document → service → signal → store → UI`

| file | owns |
| --- | --- |
| `<model>.constant.ts` | the five classes, in order: `XInput → XObject → LightX → X → XInsight`. Write `XInsight` even when empty. |
| `<model>.dictionary.ts` | `[en, ko]` labels and the `Err` keys, in the fixed chain with empty stages still written. |
| `<model>.document.ts` | `XFilter → X → XModel`. Chain methods validate, mutate, `return this`, and never `save()`. |
| `<model>.service.ts` | load → chain → `return await ….save()`. Side effects go in `_preUpdate` / `_postCreate`. |
| `<model>.signal.ts` | `XInternal → XSlice → XEndpoint`, all three declared even when empty. |
| `<model>.store.ts` | only what `store()` does not already generate — see `akan-store`. |
| `<Model>.*.tsx` | rendering. `Template` / `Zone` / `Util` are client, `Unit` / `View` are server. |

## The rule most often missed

**Display and predicate logic belongs on `Light<Model>`** — `isNew()`, `canWrite(user?)`, `formatTimes()`.
The Light class is the one both server and client hold, so shared logic lives there instead of in a util
module. Collection-level helpers go `static` on the full model.

## Rules

- New module ⇒ `create-module`. New field / action / list on an existing one ⇒ `add-field` /
  `add-mutation` / `add-slice`. Hand-writing is the fallback, not the default.
- A module is for data that must be **stored**. Static page content is a page.
- Keep business decisions in constant, document and service; API exposure in signal; client coordination in
  store; rendering in UI.
- Never hand-edit a generated registry file — `cnst.ts`, `db.ts`, `dict.ts`, `option.ts`, `sig.ts`, `srv.ts`,
  `st.ts`, `useClient.ts`, `useServer.ts`, and every `index.ts` barrel. They are scanner output; run
  `akan sync <app>` or `repair_generated`.
- Read the module's `<module>.abstract.md` before changing it, and update it when an invariant or workflow
  changes — not for formatting.

Deeper detail per layer is a `get_guideline` call away: `moduleOverview`, `modelConstant`, `modelDocument`,
`modelService`, `modelSignal`, `modelStore`, `modelDictionary`.

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-module/references/moduleOverview.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-module/references/modelConstant.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-module/references/modelDictionary.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-module/references/fieldRule.md` — Purpose · Ownership · Field Types · Masked And Visual Fields · Immutable Fields · …
