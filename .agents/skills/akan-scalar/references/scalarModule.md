<!-- akan:generated -->

# Scalar Module Guideline

## Purpose
Use scalar modules for small embedded value objects shared across models. Scalars are not independent collections and should not own a separate lifecycle.

## Ownership
- Scalar files live under `lib/__scalar/<scalarName>`.
- `scalar.constant.ts` defines the value shape, enum values, defaults, and pure helpers.
- `scalar.dictionary.ts` defines labels and descriptions for scalar fields and enum values.
- `scalar.document.ts` is optional and only for small value helper behavior.
- `Scalar.Template.tsx` and `Scalar.Unit.tsx` are optional reusable editor/display components.

## Current Akan Patterns
- Choose scalar for reusable embedded values such as Price, Address, ContactInfo, Coordinate, FileMeta, or DateRange.
- Choose a normal module when the data needs its own permissions, list page, service methods, independent lifecycle, or search surface.
- Keep scalar constants focused and composable.
- Let the parent module decide how scalar values are saved, loaded, and exposed.

## Codegen Rules
- Do not create service, signal, or store files for scalars by default.
- Do not embed business workflows in scalar helpers.
- Do not duplicate the same group of fields across many modules when a scalar would make the model clearer.
- Do not add UI files unless the scalar needs reusable input or display across modules.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
