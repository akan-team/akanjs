# Mutating

- Source: /cheatsheet/performance/mutation
- Mirror: /llms/pages/cheatsheet/performance/mutation.md
- Section: cheatsheet
- Category: Performance
- Priority: P2

## Headings

- Mutating (#overview)
- Two Write Styles (#styles)
- Counters And Sets (#counters)
- Upsert (#upsert)
- How It Becomes SQL (#sql)
- Tips (#tips)

## Content

Mutating

Akan has two ways to change stored data. Use document methods when you edit one loaded document, and use query updates when you change matching rows directly in the database.

Document methods (`.set().save()`, `Model.update`, `Model.remove`) load a document, run save/update/remove hooks, then persist it.

Query updates (`updateOne`, `updateMany`, `deleteMany`, `bulkWrite`) compile to a single atomic SQL statement and do not load documents.

Use the `u` update helper for operators, the same way `q` is used for query conditions.

Two Write Styles

Pass a plain object for simple value assignments, or a builder function to reach the operator helpers scoped to that call. A bare value is shorthand for `set`.

Object form (bare value = set)

Builder form (operators)

The builder runs synchronously. Compute awaited values (like a password hash) before the call and reference them inside the builder.

Counters And Sets

Numeric operators (`inc`, `mul`, `min`, `max`) and array operators (`push`, `addToSet`, `pull`) run inside the database, so concurrent writers do not lose each other's changes.

Atomic counters

`addToSet` and `pull` match array elements by value and are reliable for scalar sets (ids, strings, numbers).

Upsert

With `{ upsert: true }`, a missing match inserts a new row. Values from the filter seed the document, operators apply from empty defaults, and `setOnInsert` only applies on that insert.

Insert or increment

How It Becomes SQL

The adaptor folds every operator into one nested JSON expression on the `_doc` column and always stamps `updatedAt`. The whole update is a single statement the database applies atomically.

Update helper

Document update

SQL fragment

These SQL snippets are simplified to show the idea, and reflect the SQLite/libsql dialect. Postgres uses the equivalent jsonb functions. Every operator reads the pre-update document, so all changes in one call see the same original values.

Query updates do not run document hooks.

`updateOne`, `updateMany`, `deleteMany`, and `bulkWrite` write directly in the database and do not fire save/update/remove hooks.

When a per-document rule must always run, use a document path: `Model.update(id, patch)`, `Model.remove(id)`, or `doc.set(...).save()`.

Tips

Prefer query updates for counters and bulk state changes; prefer document methods when hooks or rich domain logic must run.

Use the builder form instead of importing update helpers at module scope.

Check `modifiedCount` from the result when a mutation must have matched a row.

## Code Examples

### Code

```ts
await this.Post.updateOne({ id }, { status: "published", pinned: true });
```

### Code

```ts
await this.Post.updateOne({ id }, ({ inc, addToSet }) => ({
  views: inc(1),
  tags: addToSet("hot"),
}));
```

### Code

```ts
// bump a view counter for every matching row in one statement
await this.Post.updateMany({ status: "published" }, ({ inc }) => ({ viewCount: inc(1) }));

// keep a set of tags unique, or remove one
await this.Post.updateOne({ id }, ({ addToSet }) => ({ tags: addToSet("featured") }));
await this.Post.updateOne({ id }, ({ pull }) => ({ tags: pull("featured") }));
```

### Code

```ts
await this.Counter.updateOne(
  { key: "daily-visits" },
  ({ inc, setOnInsert }) => ({ total: inc(1), status: setOnInsert("active") }),
  { upsert: true },
);
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

