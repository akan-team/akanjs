---
name: akan-service
description: "Add a service module — behaviour not centred on one stored model — under lib/_<service>/, and keep its abstract current."
---

<!-- akan:generated -->

# Akan service modules

Behaviour that is not centred on a single stored model lives in a **service module**: the folder is
`lib/_<service>/` and its abstract file is `<service>.abstract.md` — the folder carries the underscore, the
abstract drops it. Its UI surface is limited to `<Service>.Util.tsx` and `<Service>.Zone.tsx`, and its
dictionary is a `serviceDictionary`.

## Rules

- Read the module's `*.abstract.md` **before** changing it — it states the invariants the code cannot show.
  Update it when an invariant, workflow, or public behaviour changes; not for formatting or imports.
- Keep the public surface in the signal layer and the decisions in the service.
- Service methods stay a few lines: load → chain → `return await ….save()`. Write `return await` explicitly
  in tail position. Side effects belong in `_preUpdate` / `_postCreate`, not inline. Fire-and-forget is
  explicitly `void`-ed.
- Return `null` / `false` for "not allowed" or "not found" and let the signal decide whether that is an
  error.

## Reaching other things

Inside a service, in preference order: `service<srv.XService>()` for another module's service,
`plug(AdapterClass)` for an adapter, `use<T>()` only for an `option.ts`-registered legacy singleton, and
`env(...)` for config. Injection resolves by field name — a field named `<refName>Service` finds the service
registered under `<refName>`, and the `Service` suffix is required.

An external API or piece of infrastructure is an `adapt()` class in `srvkit/`, injected with `plug`. It
self-registers, so do **not** add it to `lib/option.ts`.

Full detail: `get_guideline` with `modelService`.

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-service/references/modelService.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-service/references/modelSignal.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
- `.agents/skills/akan-service/references/modelDocument.md` — Purpose · Ownership · Current Akan Patterns · Codegen Rules · Review Checklist
