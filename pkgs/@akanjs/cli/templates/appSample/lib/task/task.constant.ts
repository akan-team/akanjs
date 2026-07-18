import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

import { WorkHistory } from "../__scalar/workHistory/workHistory.constant";

// ===== task.constant.ts =====
// Convention: <module>.constant.ts — the data shape layer of an Akan.js database module.
// Import scalar primitives from akanjs/base; define model layers with via() from akanjs/constant.
// Scalars are embedded via field([ScalarType], ...) — see WorkHistory embedding below.
// Layer order: enum → Input → Object → Light → Full.
//   Input = user-provided fields; Object = Input + system fields + embedded scalars; Light = subset for list views; Full = Object + Light.
// Registered by akan sync into cnst.ts barrel.

export class TaskStatus extends enumOf("taskStatus", [
  "todo",
  "inProgress",
  "completed",
] as const) {}

export class TaskInput extends via((field) => ({
  title: field(String),
  content: field(String, { default: "" }),
})) {}

// TaskObject embeds WorkHistory as a list field — the scalar embedding pattern.
// field([WorkHistory]) stores a list of scalar objects in the parent document.
// Each status change (create, start, complete) pushes a new entry into this list.
export class TaskObject extends via(TaskInput, (field) => ({
  status: field(TaskStatus, { default: "todo" }),
  due: field(Date).optional(),
  workHistory: field([WorkHistory]),
})) {}

export class LightTask extends via(TaskObject, ["title", "status", "due"] as const, (resolve) => ({})) {}

export class Task extends via(TaskObject, LightTask, (resolve) => ({})) {}

export class TaskInsight extends via(Task, (field) => ({})) {}

// ---- Expandable additional fields: ----
// ===== Add to TaskInput =====
//  - priority: field(TaskPriority, { default: "medium" })
//  - tags: field(String).list().optional()
// ===== Add to TaskObject =====
//  - assignee: field(ID).optional()
//  - completedAt: field(Date).optional()
// ===== Add to Task =====
//  isOverdue(): boolean { return this.due && this.due < new Date() }
`;
}
