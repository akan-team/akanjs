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
- Tips (#tips)

## Content

Querying

In Akan, database queries usually live in `document.ts` filters. Pages and services ask for a named filter instead of rebuilding the same condition everywhere.

Use `filter().arg()` for required inputs.

Use `filter().opt()` for optional inputs.

Use the `q` helper for readable conditions.

Basic Filter

Start with the query your screen needs. For example, a project page often needs active tasks in that project.

Tasks in project

Optional Conditions

Optional filters should add conditions only when the user actually selected something. `q.when` keeps that logic compact.

Filter by assignees

Range And OR

Use `q.between` for periods and `q.any` for OR. This keeps date dashboards and status boards readable.

Dashboard period

Raw Query

Use raw query only when the helper cannot express the condition. Keep it as a small SQL fragment and always pass values as parameters.

Score threshold

How It Becomes SQL

Akan stores most model data as document fields, then turns filter objects into SQL where clauses. You write in document shape, the adaptor compiles it for the database.

Query helper

Document query

SQL condition text

These SQL snippets are simplified to show the idea. Akan keeps values parameterized, so user input should be passed as values instead of being pasted into raw SQL strings.

Why does Akan store most model data as JSON document fields?

Schema changes are lighter. Adding a small field usually does not require a table migration, so product code can move faster.

Akan prefers query-first document design before low-level query tuning. Data that is read together can stay together, reducing extra joins and service glue code.

Business models often contain nested settings, histories, options, and snapshots. JSON fields keep those shapes natural while still allowing SQL filters for important paths.

You can denormalize intentionally for list/detail screens, then add indexes only to the paths that become hot.

Tips

Name filters after screens or use cases: `inProject`, `inPeriod`, `forDashboard`.

Keep page code free of query-building details.

Prefer helper queries before raw SQL.

Add indexes for filters that become important traffic paths.

## Code Examples

### Code

```ts
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

### Code

```ts
inProjectWithAssignees: filter()
  .arg("projectId", ID)
  .opt("assigneeIds", [ID])
  .query((projectId, assigneeIds, q) =>
    q.all(
      { project: projectId },
      q.when(assigneeIds?.length, {
        assignee: q.oneOf(assigneeIds),
      }),
    ),
  ),
```

### Code

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

### Code

```ts
popular: filter()
  .arg("minScore", Number)
  .query((minScore, q) =>
    q.all(
      { status: "published" },
      q.raw("json_extract(_doc, '$.score') > ?", [minScore]),
    ),
  ),
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

