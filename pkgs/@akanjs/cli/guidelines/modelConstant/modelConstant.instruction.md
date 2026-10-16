# model.constant.ts Guideline

## Purpose
Generate the business data shape for a collection-backed Akan module. This file is the shared type source used by document, service, signal, store, and UI.

## Ownership
- Define enum classes first when the model has categorical states.
- Define `ModelInput` for fields accepted from create or edit flows.
- Define `ModelObject` by extending `via(ModelInput, (field) => ({ ... }))` for stored fields controlled by system or service behavior.
- Define `LightModel` by selecting compact list/reference fields from the object layer.
- Define full `Model` by combining object and light layers and adding only small static or type helpers when needed.
- Always define `ModelInsight`, empty when the model has no aggregation or dashboard values yet.

## Current Akan Patterns
- Use `via()` and the `field` helper for all model layers.
- Use `field.hidden()` and `field.secret()` for internal or sensitive values.
- Use scalars from `../__scalar/<name>/<name>.constant` when a field group is reusable and embedded.
- Use direct imports for related light models to avoid circular barrel imports.

## Codegen Rules
- Keep the light model small enough for lists, cards, and relation previews.
- Do not put persistence queries, service workflows, fetch calls, or React UI in constant files.
- Use stable defaults for arrays and frequently read values.
- Never declare a `static` on the Object or Light class: `via(XObject, LightX, …)` mixes in their prototypes only, so a static there never reaches `X` — put it on `XInput` (or a scalar), `X`, or `XInsight`. `no-static-in-object-light-model` recognises the Object class by its `*Object` name (its `via()` shape is the Insight's) and the Light class by its `Light*` name or its `[...] as const` field tuple.
- Add dictionary coverage for public fields, enums, insights, and query-facing names.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
