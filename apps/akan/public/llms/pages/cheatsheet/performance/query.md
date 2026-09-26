# Querying

- Source: /cheatsheet/performance/query
- Mirror: /llms/pages/cheatsheet/performance/query.md
- Section: cheatsheet
- Category: Performance
- Priority: P2

## Headings

- Querying (#overview)
- Basic Filter (#basic)
- Optional Conditions (#optional)
- Range And OR (#range)
- Raw Query (#raw)
- How It Becomes SQL (#sql)
- Query Habits (#tips)

## Content

Querying

Starts one named query inside `from(cnst.Task, (filter) => …)`.

A required input, such as `.arg("projectId", ID)`.

An optional input. It comes after every `.arg()` and is `undefined` when left out.

Gets the inputs in declared order, then `q`, and returns the condition.

The condition helper: `q.all`, `q.oneOf`, `q.between`, `q.when` and more.

Named orders beside the built-in `latest`, `oldest` and `relevance`. Write `{}` if you add none.

Every match. A last argument `{ sort, skip, limit }` pages it.

The first match, or `null`.

The first match. Throws when there is none.

How many documents match.

The id of one match, or `null`.

The condition itself, not yet run. A slice's `exec` returns this.

A JSON column holding every declared field; SQLite reads one with `json_extract(_doc, '$.field')`.

Four real columns, compared directly: `"updatedAt" >= ?`.

plain value

Equals. Several keys in one object are joined with AND.

Equals, spelled out. Same as a plain value.

Not equal.

Equals any value in the list. An empty list matches nothing.

Equals none of the values. An empty list matches everything.

Greater than.

Greater than or equal to.

Less than.

Less than or equal to.

Inside a range, both ends included.

The key is in the stored JSON, even when it holds `null`.

The key is absent from the stored JSON. Use it only for rows older than the field.

Has no value: the key is absent or holds `null`.

The array field contains the value.

array field

On an array field, a plain value or `q.oneOf` also checks the items.

The text includes the value, bound as `%release%`.

Full-text search over `text`-role fields, compiled to a JOIN. Works in every database mode.

Every condition holds. `null`, `undefined` and `false` entries are skipped.

At least one condition holds.

The condition does not hold.

Adds the query when the condition is truthy, and nothing when it is falsy.

nested path

A dotted key reaches into a nested object.

base column

`id`, `createdAt`, `updatedAt` and `removedAt` are compared as real columns.

Your own SQL fragment, wrapped in parentheses; write it in your database's dialect.

Compare Values

Presence

Arrays And Text

Combine Conditions

Paths And Raw SQL

Lighter Schema Changes

Adding a small field usually needs no table migration, so product code moves faster.

Query-First Design

Data read together is stored together, which saves extra joins and service glue code.

Natural Nested Shapes

Settings, histories, options and snapshots keep their shape, and important paths stay filterable.

Index Only What Gets Hot

Denormalize on purpose for list and detail screens, then index only the paths that carry traffic.

Building Blocks

Piece

Basic Filter

Start from the list your screen needs. A project page, for example, shows the tasks of one project that are not archived.

1. Declare It In document.ts

Add the filter to the model's filter class:

2. Name It In The Dictionary

3. Call It By Name

Each filter becomes a set of methods on the model and the service, named after it:

The methods you will reach for most:

Method

Returns

Optional Conditions

Range And OR

Raw Query

How It Becomes SQL

Where A Field Lives

Column

Helper

Meaning and SQL

Why A JSON Document?

Query Habits

Four habits keep filters easy to find and fast to run:

Index The Hot Paths

Indexes And Hooks

Text Search

Mutating

Atomic updates written with the same query helpers.

## Code Examples

### apps/myapp/lib/task/task.document.ts

```ts
import { ID } from "akanjs/base";
import { from } from "akanjs/document";

import * as cnst from "../cnst";

export class TaskFilter extends from(cnst.Task, (filter) => ({
  query: {
    inProject: filter()
      .arg("projectId", ID)
      .query((projectId, q) =>
        q.all(
          { project: projectId },
          q.not({ status: "archived" }),
        ),
      ),
  },
  sort: {},
})) {}
```

### apps/myapp/lib/task/task.dictionary.ts

```ts
.query<TaskFilter>((fn) => ({
    inProject: fn(["In Project", "프로젝트별 조회"]).arg((t) => ({
      projectId: t(["Project", "프로젝트"]).desc([
        "Project to list tasks of",
        "태스크를 조회할 프로젝트",
      ]),
    })),
  }))
```

### apps/myapp/lib/task/task.service.ts

```ts
import { serve } from "akanjs/service";

import * as db from "../db";

export class TaskService extends serve(db.task, () => ({})) {
  async summarizeProject(projectId: string) {
    const [recentTasks, taskNum] = await Promise.all([
      this.taskModel.listInProject(projectId, { sort: "latest", limit: 20 }),
      this.taskModel.countInProject(projectId),
    ]);
    return { recentTasks, taskNum };
  }
}
```

### apps/myapp/lib/task/task.document.ts

```ts
inProjectWithAssignees: filter()
  .arg("projectId", ID)
  .opt("assigneeIds", [ID])
  .query((projectId, assigneeIds, q) =>
    q.all(
      { project: projectId },
      q.when(assigneeIds?.length, {
        assignee: q.oneOf(assigneeIds ?? []),
      }),
    ),
  ),
```

### apps/myapp/lib/task/task.document.ts

```ts
inPeriod: filter()
  .arg("projectId", ID)
  .arg("from", Date)
  .arg("to", Date)
  .query((projectId, from, to, q) =>
    q.all(
      { project: projectId },
      { updatedAt: q.between(from, to) },
      q.any({ status: "done" }, { status: "reviewing" }),
    ),
  ),
```

### apps/myapp/lib/post/post.document.ts

```ts
aboveScore: filter()
  .arg("minScore", Float)
  .query((minScore, q) =>
    q.all(
      { status: "published" },
      q.raw("json_extract(_doc, '$.score') > ?", [minScore]),
    ),
  ),
```

### apps/myapp/lib/task/task.document.ts

```ts
import { by, from, into, type SchemaOf } from "akanjs/document";

export class TaskModel extends into(Task, TaskFilter, cnst.task, () => ({})) {
  static override _onSchema(schema: SchemaOf<TaskModel, Task>) {
    schema.index({ project: 1, status: 1 });
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

