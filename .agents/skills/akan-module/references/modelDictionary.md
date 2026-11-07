<!-- akan:generated -->

# model.dictionary.ts Guideline

## Purpose
Generate user-facing language for a model. Dictionary entries should make fields, enum values, queries, slices, endpoints, errors, and UI phrases readable in every supported language.

## Ownership
- `modelName` and `modelDesc` describe the model itself.
- Public model fields need `fieldName` and `desc-fieldName` entries.
- Enum values need `enum-field-value` and `enumdesc-field-value` entries.
- Document queries and sorts need query labels, descriptions, and argument descriptions when surfaced to UI or docs.
- Signal slices and endpoints need API labels, API descriptions, argument labels, and argument descriptions.
- Custom UI text should live near the model when it is model-specific.

## Current Akan Patterns
- Use `ModelDictionary`, `SignalDictionary`, base translations, and base signal translations where available in nearby examples.
- Keep language order consistent with the app convention.
- Prefer short labels and useful descriptions over repeating the field name.
- Group entries by model, insight, query, endpoint, enum, error, and UI sections.

## Codegen Rules
- Dictionary keys must match generated field, enum, query, slice, endpoint, and argument names.
- Do not add orphan translations that are not used by the model or UI.
- Do not omit descriptions for public fields or externally visible arguments.
- Preserve generated base translations instead of rewriting common keys.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
