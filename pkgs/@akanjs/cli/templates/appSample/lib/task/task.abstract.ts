import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "task.abstract.md",
    content: `# Task Abstract

## Akan.js Module Pattern

Task is a **database-backed domain module** — the standard Akan.js pattern for persisted entities.
This module demonstrates the full Akan.js module lifecycle:
constant -> document -> service -> signal -> store -> UI.

Every database module in Akan.js follows this layered architecture:
- task.constant.ts — data shape (enum, Input, Object, Light, Full layers via via())
- task.document.ts — DB queries, filters, sorts, indexes, Document chain methods
- task.dictionary.ts — i18n labels, error messages, UI translations
- task.service.ts — business logic orchestration bound to DB via serve(db.task, ...)
- task.signal.ts — API surface (query, mutation, pubsub endpoints bound via endpoint(srv.task, ...))
- task.store.ts — client state management bound to signal via store(sig.task, ...)
- Task.*.tsx — UI components (Zone -> Load -> Unit / View / Template / Util)

## Convention: lib/<module>/ directory naming

- Database modules live under lib/<module>/ (no underscore prefix)
- Files follow <module>.<layer>.ts naming — e.g., task.constant.ts, task.service.ts
- UI files use PascalCase with explicit suffix: Task.Zone.tsx, Task.Unit.tsx, Task.View.tsx

## Convention: scan-registered barrels

akan sync auto-discovers each file and registers it in the corresponding barrel:
cnst.ts, db.ts, dict.ts, srv.ts, sig.ts, st.ts

## Related Modules

- lib/__scalar/workHistory/ — standard scalar modules with double-underscore prefix (reusable field sets)
- lib/_noti/ — pure service module (compare structure differences: no constant/document, serve without DB binding)
`,
  };
}
