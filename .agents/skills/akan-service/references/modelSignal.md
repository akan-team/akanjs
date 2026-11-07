<!-- akan:generated -->

# model.signal.ts Guideline

## Purpose
Generate the page-callable API surface for a module. Signal classes expose internal tasks, list/detail slices, endpoints, realtime channels, and resolved field handlers.

## Ownership
- `Internal` is for scheduled, queued, or server-only behavior.
- `Slice` is for page data loading: lists, insights, detail views, pagination, filters, and guards.
- `Endpoint` is for user actions such as create, update, submit, approve, archive, sync, or upload.
- The exported signal registry class ties internal, endpoint, and slice classes to the model constant.

## Current Akan Patterns
- Use guards at root/get/cru/action boundaries so generated fetch clients inherit correct access rules.
- Slices should call service methods and return model constants, light models, insights, or serializable DTOs.
- Endpoints should call service workflows and return the updated model or action result.
- Name slices and endpoints after user-visible behavior, not transport details.

## Codegen Rules
- Do not place business workflows in signal when service can own them.
- Do not expose internal-only operations as public endpoints.
- Do not bypass generated fetch/store conventions with ad hoc network calls.
- Keep argument names stable because dictionary, docs, and generated clients depend on them.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
