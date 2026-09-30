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

In Akan, a database query is a named filter in `<model>.document.ts`. Services and slices call it by name instead of rebuilding the same condition in every place.

Building Blocks

Piece

- filter(): Starts one named query inside `from(cnst.Task, (filter) => …)`.

- .arg(name, Type): A required input, such as `.arg("projectId", ID)`.

- .opt(name, Type): An optional input. It comes after every `.arg()` and is `undefined` when left out.

- .query((...args, q) => …): Gets the inputs in declared order, then `q`, and returns the condition.

- q: The condition helper: `q.all`, `q.oneOf`, `q.between`, `q.when` and more.

- sort: Named orders beside the built-in `latest`, `oldest` and `relevance`. Write `{}` if you add none.

Basic Filter

Start from the list your screen needs. A project page, for example, shows the tasks of one project that are not archived.

1. Declare It In document.ts

Add the filter to the model's filter class:

2. Name It In The Dictionary

Give the filter and each of its arguments an `[en, ko]` label. A missing entry is a type error:

3. Call It By Name

Each filter becomes a set of methods on the model and the service, named after it:

The methods you will reach for most:

Method

Returns

- listInProject: Every match. A last argument `{ sort, skip, limit }` pages it.

- findInProject: The first match, or `null`.

- pickInProject: The first match. Throws when there is none.

- countInProject: How many documents match.

- existsInProject: The id of one match, or `null`.

- queryInProject: The condition itself, not yet run. A slice's `exec` returns this.

**Eight more follow the same naming:** `listIds`, `findId`, `pickId`, `insight`, and the query-level writes `remove`, `removeOne`, `update` and `updateOne`, which run no hooks.

**A service call has no page size.** Without `limit`, `listInProject()` returns every match, so pass one for lists that grow.

**`sort` names a sort key.** Use `latest`, `oldest` or a key from the filter's `sort` map; an unknown key is refused.

Optional Conditions

An optional input should add its condition only when the user actually picked something. `q.when(condition, query)` adds `query` when `condition` is truthy, and nothing otherwise:

**`q.when` builds its query even when the condition is false.** `q.oneOf(undefined)` throws, which is why the snippet passes `assigneeIds ?? []`.

**An `undefined` value throws.** `{ assignee: assigneeId }` with no `assigneeId` is refused, so wrap it in `q.when`.

**`q.oneOf([])` matches nothing.** Checking `?.length`, not just presence, keeps an empty pick from emptying the list.

**“Has no value” is `q.empty`, never `q.missing`.** `q.missing` means the key is absent from the stored JSON. A document read and saved again gets an explicit `null` from the read, so the key is there from then on. Use `q.missing` only to find rows written before the field was declared.

Range And OR

Use `q.between` for a period and `q.any` for OR. Date dashboards and status boards stay readable:

**Both ends are included.** `q.between(from, to)` compiles to `>= from AND <= to`.

**Pass dates as they arrive.** A `Date` argument reaches the query as a `Dayjs`, and dates are compared as epoch milliseconds.

**One object with several keys is already AND.** `{ project: projectId, status: "done" }` needs no `q.all`.

Raw Query

Reach for `q.raw` only when no helper can express the condition. Keep it one small SQL fragment, and pass every value as a parameter:

**Values go in the array, never in the string.** Each `?` binds the next value, so user input never becomes SQL.

**One fragment, one condition.** It is wrapped in parentheses and joined like any other condition, and a fragment containing `;` is refused.

**Write it for your database.** The snippet is SQLite / libsql. Postgres keeps `_doc` as `jsonb` and reads a field as text, so the same condition is `("_doc" #>> '{score}')::numeric > ?`.

**A raw fragment is not translated between databases.** An app that runs on both SQLite and Postgres avoids `q.raw`, or writes the fragment per database.

How It Becomes SQL

Akan keeps a model's fields in one JSON column, `_doc`, and compiles a filter object into a SQL `WHERE` clause. You write in the document's shape; the database adaptor writes the SQL.

Where A Field Lives

Column

- _doc: A JSON column holding every declared field; SQLite reads one with `json_extract(_doc, '$.field')`.

- id, createdAt, updatedAt, removedAt: Four real columns, compared directly: `"updatedAt" >= ?`.

**Removed documents never match.** Every read adds `"removedAt" IS NULL`, so you never write that condition yourself.

**The SQL below is simplified SQLite / libsql.** Postgres compiles the same filter to `jsonb` operators such as `_doc #> '{status}'`.

**Values stay parameters.** Every `?` is bound separately, so user input is never pasted into the SQL text.

- Compare Values

  - plain value: Equals. Several keys in one object are joined with AND.

  - q.eq: Equals, spelled out. Same as a plain value.

  - q.ne: Not equal.

  - q.oneOf: Equals any value in the list. An empty list matches nothing.

  - q.notOneOf: Equals none of the values. An empty list matches everything.

  - q.gt: Greater than.

  - q.gte: Greater than or equal to.

  - q.lt: Less than.

  - q.lte: Less than or equal to.

  - q.between: Inside a range, both ends included.

- Presence

  - q.exists: The key is in the stored JSON, even when it holds `null`.

  - q.missing: The key is absent from the stored JSON. Use it only for rows older than the field.

  - q.empty: Has no value: the key is absent or holds `null`.

- Arrays And Text

  - q.has: The array field contains the value.

  - array field: On an array field, a plain value or `q.oneOf` also checks the items.

  - q.contains: The text includes the value, bound as `%release%`.

  - q.search: Full-text search over `text`-role fields, compiled to a JOIN. Works in every database mode.

- Combine Conditions

  - q.all: Every condition holds. `null`, `undefined` and `false` entries are skipped.

  - q.any: At least one condition holds.

  - q.not: The condition does not hold.

  - q.when: Adds the query when the condition is truthy, and nothing when it is falsy.

- Paths And Raw SQL

  - nested path: A dotted key reaches into a nested object.

  - base column: `id`, `createdAt`, `updatedAt` and `removedAt` are compared as real columns.

  - q.raw: Your own SQL fragment, wrapped in parentheses; write it in your database's dialect.

Helper

Meaning and SQL

Why A JSON Document?

- Lighter Schema Changes — Adding a small field usually needs no table migration, so product code moves faster.

- Query-First Design — Data read together is stored together, which saves extra joins and service glue code.

- Natural Nested Shapes — Settings, histories, options and snapshots keep their shape, and important paths stay filterable.

- Index Only What Gets Hot — Denormalize on purpose for list and detail screens, then index only the paths that carry traffic.

Query Habits

Four habits keep filters easy to find and fast to run:

**Name filters with a preposition.** `inProject`, `inPeriod` and `byStatuses` say what the list is scoped to; never `getXInY` or `listX`.

**Keep query building out of pages.** Pages and services call the filter by name, so each condition lives in one place.

**Prefer helpers to raw SQL.** Helpers work on both SQLite and Postgres and bind every value for you.

**`q.contains` reads every row.** It is a `LIKE '%…%'` scan that no index can serve; a search box wants `q.search`.

Index The Hot Paths

When a filter becomes a busy traffic path, index the fields it compares in the model's `_onSchema`:

**The index is built on the expression the filter compiles to.** On SQLite, `schema.index({ project: 1 })` indexes `json_extract(_doc, '$.project')`, which `{ project }` then uses; Postgres indexes its own form of the same expression.

**Sort keys are indexed for you.** Each order in the filter's `sort` map gets an index together with `removedAt`; the fields you filter on do not.

Indexes And Hooks

The full `_onSchema` API, including unique indexes.

Text Search

`q.search` and the `text` field role.

Mutating

Atomic updates written with the same query helpers.

## Code Examples

### plain value

```ts
{ status: "done" }
// → json_extract(_doc, '$.status') = ?
```

### q.eq

```ts
{ priority: q.eq("high") }
// → json_extract(_doc, '$.priority') = ?
```

### q.ne

```ts
{ status: q.ne("archived") }
// → json_extract(_doc, '$.status') != ?
```

### q.oneOf

```ts
{ status: q.oneOf(["done", "reviewing"]) }
// → json_extract(_doc, '$.status') IN (?, ?)
```

### q.notOneOf

```ts
{ status: q.notOneOf(["archived", "deleted"]) }
// → json_extract(_doc, '$.status') NOT IN (?, ?)
```

### q.gt

```ts
{ score: q.gt(80) }
// → json_extract(_doc, '$.score') > ?
```

### q.gte

```ts
{ progress: q.gte(50) }
// → json_extract(_doc, '$.progress') >= ?
```

### q.lt

```ts
{ retryCount: q.lt(3) }
// → json_extract(_doc, '$.retryCount') < ?
```

### q.lte

```ts
{ dueAt: q.lte(to) }
// → json_extract(_doc, '$.dueAt') <= ?
```

### q.between

```ts
{ dueAt: q.between(from, to) }
// → json_extract(_doc, '$.dueAt') >= ? AND json_extract(_doc, '$.dueAt') <= ?
```

### q.exists

```ts
q.exists("assignee")
// → json_type(_doc, '$.assignee') IS NOT NULL
```

### q.missing

```ts
q.missing("deletedAt")
// → json_type(_doc, '$.deletedAt') IS NULL
```

### q.empty

```ts
q.empty("assignee")
// → json_type(_doc, '$.assignee') IS NULL OR json_type(_doc, '$.assignee') = 'null'
```

### q.has

```ts
{ tags: q.has("urgent") }
// → EXISTS (SELECT 1 FROM json_each(json_extract(_doc, '$.tags')) WHERE json_each.value = ?)
```

### array field

```ts
{ watchers: userId }
// → EXISTS (SELECT 1 FROM json_each(json_extract(_doc, '$.watchers')) WHERE json_each.value = ?)
```

### q.contains

```ts
{ title: q.contains("release") }
// → json_extract(_doc, '$.title') LIKE ?
```

### q.search

```ts
q.search(text, { prefix: true })
// → JOIN (SELECT … FROM search_fts … WHERE search_fts MATCH ?) …
```

### q.all

```ts
q.all({ project }, { status: "active" })
// → (json_extract(_doc, '$.project') = ?) AND (json_extract(_doc, '$.status') = ?)
```

### q.any

```ts
q.any({ status: "done" }, { status: "reviewing" })
// → (json_extract(_doc, '$.status') = ?) OR (json_extract(_doc, '$.status') = ?)
```

### q.not

```ts
q.not({ status: "archived" })
// → NOT (json_extract(_doc, '$.status') = ?)
```

### q.when

```ts
q.when(userIds.length, { user: q.oneOf(userIds) })
// → json_extract(_doc, '$.user') IN (?, ...)
q.when(false, { user })
// → 1 = 1
```

### nested path

```ts
{ "profile.city": "Seoul" }
// → json_extract(_doc, '$.profile.city') = ?
```

### base column

```ts
{ updatedAt: q.gte(from) }
// → "updatedAt" >= ?
```

### q.raw

```ts
q.raw("json_extract(_doc, '$.score') > ?", [minScore])
// → (json_extract(_doc, '$.score') > ?)
```

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

