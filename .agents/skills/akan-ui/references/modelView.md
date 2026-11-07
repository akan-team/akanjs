<!-- akan:generated -->

# Model.View.tsx Guideline

## Purpose
Generate full-model detail displays for detail pages, view modals, and sections needing complete model data.

## Ownership
- View owns presentation of one full model.
- It can compose Unit displays for related light models.
- It should show data clearly without owning page-level state.

## Current Akan Patterns
- Use full model props and render important fields, relations, and resolved values.
- Use dictionary terms for field labels where possible.
- Keep display variants named by layout or purpose.

## Codegen Rules
- Do not perform click workflows here; wrap with Util or Zone when interaction is needed.
- Do not fetch data inside View.
- Do not omit core model fields when the view claims to be general.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
