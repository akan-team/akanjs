import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { dayjs, enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

// ===== workHistory.constant.ts =====
// Convention: lib/__scalar/<type>/ — scalar modules use double-underscore prefix.
// Scalars are embedded value shapes, reused across models via field([ScalarType]).
// Define enums with enumOf() and entry classes with via() from akanjs/constant.

// ---- Enum ----
// WorkHistoryAction: the type of change recorded in a work history entry
// Scalar enums follow the same enumOf() convention as model enums
export class WorkHistoryAction extends enumOf("workHistoryAction", [
  "created",
  "started",
  "completed",
] as const) {}

// ---- Scalar Entry ----
// WorkHistory: a single entry in a model's workHistory list
// Each status change in the owning model pushes a new entry into the list
// field([WorkHistory]) in the parent model's Object layer
export class WorkHistory extends via((field) => ({
  action: field(WorkHistoryAction),
  at: field(Date, { default: () => dayjs() }),
  note: field(String, { default: "" }),
})) {}

// ---- Expandable additional fields: ----
//  - actor: field(String).optional() — who performed the action
//  - previousStatus: field(TaskStatus).optional() — status before the change
`;
}
