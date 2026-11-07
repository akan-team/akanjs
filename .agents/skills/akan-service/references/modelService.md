<!-- akan:generated -->

# model.service.ts Guideline

## Purpose
Generate server-side business workflows. A service decides which documents to load, how document methods compose, which other services are needed, and when to save results.

## Ownership
- A database service extends the current `serve(db.model, ({ use, service }) => ({ ... }))` pattern used in nearby modules.
- Use generated document helpers for CRUD, list, query, count, insight, search, and load operations.
- Use injected services for cross-domain work instead of importing and constructing service classes manually.
- Use injected utilities or options for external APIs, configuration, queues, and infrastructure dependencies.

## Current Akan Patterns
- Put multi-step business workflows in service, not signal or UI.
- Load documents through generated helpers, call document instance methods, then save once when practical.
- Throw clear domain errors when invariants fail.
- Return typed constants or documents that signal and store can serialize safely.

## Codegen Rules
- Do not keep persistent mutable state on the service instance.
- Do not duplicate query definitions that belong in document filters.
- Do not expose service methods directly to pages; expose them through signal endpoints or slices.
- Do not hide authorization decisions here when they belong in signal guards, but service may still enforce domain invariants.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
