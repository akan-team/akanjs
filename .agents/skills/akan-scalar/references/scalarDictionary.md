<!-- akan:generated -->

# scalar.dictionary.ts Guideline

## Purpose
Generate labels and descriptions for scalar value objects so embedded fields are readable in forms, detail views, docs, and generated API descriptions.

## Ownership
- `modelName` and `modelDesc` describe the scalar value object.
- Each public scalar field needs a label and `desc-` description.
- Each scalar enum value needs an enum label and enum description.
- Scalar UI-specific text should be added only when the scalar has Template or Unit components.

## Current Akan Patterns
- Use `ModelDictionary<Scalar>` or the nearby project convention for typed scalar dictionaries.
- Keep descriptions reusable across all parent modules that embed the scalar.
- Use language order consistent with existing app dictionaries.
- Avoid parent-specific wording unless the scalar is intentionally scoped to that parent.

## Codegen Rules
- Do not omit descriptions for public fields.
- Do not define endpoint or slice keys for scalars unless a special UI integration actually uses them.
- Do not duplicate parent model dictionary entries inside scalar dictionaries.
- Do not leave orphan enum entries after scalar fields change.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
