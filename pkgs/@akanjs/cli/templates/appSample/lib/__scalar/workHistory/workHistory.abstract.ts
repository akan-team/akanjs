import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return {
    filename: "workHistory.abstract.md",
    content: `# WorkHistory Scalar Abstract

## Akan.js Module Pattern

WorkHistory is a **scalar module** — a reusable value type under lib/__scalar/.
Scalar modules are embedded into models via field([ScalarType]), not stored independently.
They live under the double-underscore prefix to distinguish them from database models.

Standard scalar layers:
- workHistory.constant.ts — enum (WorkHistoryAction) + entry class (WorkHistory) defined via via() + enumOf()
- workHistory.dictionary.ts — i18n via scalarDictionary() (fewer layers than modelDictionary)
- workHistory.abstract.md — embedding rules and intent

## Convention: lib/__scalar/<type>/ directory naming

- Scalar modules use double-underscore prefix: lib/__scalar/workHistory/
- Files drop the underscores: workHistory.constant.ts, not __workHistory.constant.ts
- Models embed scalars via field([WorkHistory]) — list-of-scalar embedding

## Embedding Example (in task.constant.ts)

TaskObject embeds a list of WorkHistory:
  import { WorkHistory } from "../../__scalar/workHistory/workHistory.constant";
  export class TaskObject extends via(TaskInput, (field) => ({
    workHistory: field([WorkHistory]),
  }))

Each status change (create, start, complete) pushes a new entry.

## Agent Notes

- Read this abstract before modifying the WorkHistory scalar.
- Update when new action types or fields are added.
- Do not duplicate workHistory fields in individual models; always reuse this scalar.

## Related Modules

- lib/task/ — database module embedding workHistory as a list field
- lib/_noti/ — pure service module (different module type, no scalar usage)
`,
  };
}
