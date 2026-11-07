<!-- akan:generated -->

# Model.Template.tsx Guideline

## Purpose
Generate form and interaction fragments bound to store form state and generated setters.

## Ownership
- Template owns create/edit form pieces and reusable input groups.
- It may use store hooks and generated setters when it is a client component.
- It should not own persistence workflow decisions.

## Current Akan Patterns
- Use dictionary-backed labels and descriptions.
- Use generated form state and setter actions.
- Split repeated scalar editors into scalar Template files when reusable.

## Codegen Rules
- Do not call service or signal directly from inputs.
- Do not duplicate validation that belongs in constants or service invariants.
- Do not build page layout here when Zone should compose it.
- Do not persist typed values yourself. The edit shells (`Load.Edit`, `Model.EditModal`, `Model.New`) save the
  whole `<model>Form` and recover it on the next open; a Template that reaches for `localStorage` or a per-field
  cache saves a fragment of a form and restores it over whatever the server just returned.
- The `Field.*` `cache` prop and the `Input` `cacheKey` prop are deprecated and store nothing. Turn recovery off
  with `draft={false}` on the shell, or name a scope with `draft="<scope>"`; do not reintroduce a field-level one.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
