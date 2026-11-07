<!-- akan:generated -->

# Model.Zone.tsx Guideline

## Purpose
Generate page sections that compose loaders, lists, views, templates, utilities, and section-level UI state.

## Ownership
- Zone owns page-level composition around one model.
- It coordinates Load wrappers, Unit/View display, Util controls, and section layout.
- It may hold local UI state that is only meaningful for the section.

## Current Akan Patterns
- Use store selectors and actions to connect data to the section.
- Split display into Unit/View and controls into Util before Zone grows too large.
- Name zones after page sections or user tasks.

## Codegen Rules
- Do not put low-level input groups here when Template owns them.
- Do not duplicate Unit or View display code.
- Do not implement service workflow logic in Zone.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
