# model.document.ts Guideline

## Purpose
Generate persistence behavior for a collection-backed Akan module. This file turns constant types into stored documents, query helpers, indexes, hooks, and model-level database helpers.

## Ownership
- Define `ModelFilter` with `from(cnst.Model, (filter) => ({ query, sort }))` for reusable list and lookup conditions.
- Define `Model` with `by(cnst.Model)` for behavior of one loaded document.
- Define `ModelModel` with `into(Model, ModelFilter, cnst.model, () => ({ ... }))` for collection-level helpers and schema options.
- Document methods should mutate `this`, use `this.set(...)` for multi-field changes, and return `this` for chaining.
- Model helpers should coordinate database lookups that are reused by services.

## Current Akan Patterns
- Query names become generated helpers such as list, find, pick, exists, count, and insight variants.
- Use filter args for required query inputs and optional args only when absence has a clear query meaning.
- Use schema indexes for fields that are frequently filtered, sorted, or uniquely constrained; a `"text"` index builds
  nothing, so give a searched field a `text` role (`field(String, { text: "title" })`) instead.
- Use hooks for persistence lifecycle behavior that must always run with document saves.

## Codegen Rules
- Do not put API guards, page-specific fetch behavior, or UI state in document files.
- Do not duplicate built-in all/latest/oldest behavior unless a business-specific sort is required.
- Keep document methods small and deterministic; put cross-document workflows in service.
- Index only query paths that are actually used by documented filters or lookups.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
