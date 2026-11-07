<!-- akan:generated -->

# Model.Unit.tsx Guideline

## Purpose
Generate compact reusable light-model displays such as cards, rows, avatars, badges, and summaries.

## Ownership
- Unit owns repeated display of light model data.
- It may accept navigation props or small display options.
- It should stay reusable across list and relation contexts.

## Current Akan Patterns
- Use LightModel fields only unless a full model prop is explicitly passed.
- Prefer small named components over one large card with every variant.
- Use Link when navigation is part of the unit.

## Codegen Rules
- Do not fetch data or mutate state in Unit.
- Do not assume full-model fields are available on light models.
- Do not hide action workflows in list display.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
