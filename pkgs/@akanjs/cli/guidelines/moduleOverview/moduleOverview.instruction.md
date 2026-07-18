# Module Overview Guideline

## Purpose
Use this before generating or reviewing a database module. It defines which file owns which responsibility and in what order a module should grow.

## Ownership
- `model.abstract.md` describes business intent, durable domain rules, workflows, and agent notes that are not obvious from code.
- `model.constant.ts` defines business data shape, model layers, enums, field options, resolved values, and small type helpers.
- `model.dictionary.ts` defines user-facing labels, descriptions, endpoint text, slice text, errors, and UI strings.
- `model.document.ts` defines persistence behavior: filters, document methods, model helpers, indexes, and schema hooks.
- `model.service.ts` owns business workflows using document helpers and other services.
- `model.signal.ts` exposes internal tasks, slices, endpoints, realtime, pubsub, guards, and resolved handlers.
- `model.store.ts` coordinates generated fetch APIs with client state, form state, list state, and UI actions.
- `Model.Template.tsx`, `Model.Unit.tsx`, `Model.View.tsx`, `Model.Util.tsx`, and `Model.Zone.tsx` render forms, list items, detail views, controls, and page sections.

## Current Akan Patterns
- For a new model, read and generate in this order: abstract, constant, dictionary, document, service, signal, store, UI.
- Before changing an existing module, read `model.abstract.md` first when it exists.
- For a list page, inspect signal slice, store, Zone, then Unit.
- For detail or edit UI, inspect signal view/endpoint, store, Zone/View, then Template.
- For a user action, design service behavior first, then signal endpoint, store action, and Util or Template control.

## Codegen Rules
- Generate only files needed by the requested behavior; a simple read-only feature may not need every layer.
- Do not hide business rules inside React render functions.
- Do not copy model shapes by hand across files; rely on generated types and helpers.
- Keep scanner-friendly names exactly aligned with the module name and PascalCase component name.
- Update `model.abstract.md` when business invariants, workflows, or public behavior change.
- Do not update `model.abstract.md` for formatting-only, import-only, or style-only changes.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
