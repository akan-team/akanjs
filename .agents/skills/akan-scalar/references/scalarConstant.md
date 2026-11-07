<!-- akan:generated -->

# scalar.constant.ts Guideline

## Purpose
Generate reusable embedded value objects. A scalar constant should be small, typed, easy to embed, and understandable without the parent model.

## Ownership
- Define one PascalCase scalar class with `via((field) => ({ ... }))`.
- Use base types, enum classes, other scalar classes, and arrays as needed.
- Use `.optional()` when absence is valid for that value object.
- Use pure instance methods only when they describe the value itself and do not need persistence.

## Current Akan Patterns
- Use defaults for stable empty values such as zero amount, empty text, empty list, or a date factory.
- Use enum classes for constrained categorical values that need translations.
- Use nested scalars when composition makes the parent model clearer.
- Keep examples representative because API docs and AI generation rely on them.

## Codegen Rules
- Do not include collection-level queries, service calls, signal endpoints, or store state.
- Do not create a scalar when the object needs its own identity and lifecycle.
- Do not overfit scalar names to one parent model if the value object is reusable.
- Every public field should be covered by scalar dictionary text.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
