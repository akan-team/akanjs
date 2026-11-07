<!-- akan:generated -->

# Model.Util.tsx Guideline

## Purpose
Generate small model-specific client controls such as action buttons, toolbars, dialogs, query panels, and navigation helpers.

## Ownership
- Util owns interactive helpers that are too small to be a Zone.
- It may call store actions and open dialogs.
- It should stay model-specific and composable.

## Current Akan Patterns
- Use dictionary text for confirmations and action labels.
- Keep destructive actions explicit and confirmable.
- Prefer store actions over inline fetch calls.

## Codegen Rules
- Do not put large page layout in Util.
- Do not duplicate Template form code.
- Do not bypass guards or server-side invariants.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
