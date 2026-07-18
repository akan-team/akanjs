import type { AppInfo, LibInfo } from "akanjs";

export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: { appName: string }) {
  return `import { dayjs } from "akanjs/base";
import { by, from, into } from "akanjs/document";

import { Err } from "../dict";
import * as cnst from "../cnst";

// ===== task.document.ts =====
// Convention: <module>.document.ts — the database query and persistence layer.
// Import from/into/by from akanjs/document — the framework convention for Filter, Document, and Model classes.
// Filter defines query/sort conditions (auto-generates List/Find/Pick/Exists/Count methods via akan sync).
// Document defines chainable per-document methods (e.g., task.start().save()).
// Model = into(Document, Filter, cnst.module, ...) — collection-level operations, schema hooks.
// Registered by akan sync into db.ts barrel.

export class TaskFilter extends from(cnst.Task, (filter) => ({
  query: {
    byStatus: filter()
      .arg("status", cnst.TaskStatus)
      .query((status) => ({ status })),
    dueBefore: filter()
      .arg("before", Date)
      .query((before, q) => ({ due: q.lte(before) })),
  },
  sort: {
    byDue: { due: 1 },
    newest: { createdAt: -1 },
  },
})) {}

export class Task extends by(cnst.Task) {
  start() {
    if (this.status !== "todo") throw new Err("task.error.cannotStartFromNonTodo");
    this.status = "inProgress";
    this.workHistory.push({ action: "started", at: dayjs(), note: "" });
    return this;
  }

  complete() {
    if (this.status !== "inProgress") throw new Err("task.error.cannotCompleteFromNonInProgress");
    this.status = "completed";
    this.workHistory.push({ action: "completed", at: dayjs(), note: "" });
    return this;
  }
}

export class TaskModel extends into(Task, TaskFilter, cnst.task, () => ({})) {}
`;
}
