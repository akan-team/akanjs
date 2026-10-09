# Mutating

- Source: /cheatsheet/performance/mutation
- Mirror: /llms/pages/cheatsheet/performance/mutation.md
- Section: cheatsheet
- Category: Performance
- Priority: P2

## Headings

- Mutating Data (#overview)
- Two Write Styles (#styles)
- Counters And Sets (#counters)
- Upsert (#upsert)
- How It Becomes SQL (#sql)
- Tips And Pitfalls (#tips)

## Content

Mutating

Mutating Data

You need to bump a view counter, archive a batch of rows, or edit the one record a user opened. There are two ways to write, and the choice decides whether your hooks run.

- Document Path — Loads the document, changes it and saves it, so hooks run and a removal takes its cascade. — `await this.updatePost(id, data);`

- Query Write — Sends one atomic SQL statement and loads nothing. Fast and safe under races, but no hook runs. — `await this.Post.updateOne(filter, change);`

Which one runs what

If a hook or a cascade must run for each document, take a document path. The table uses three words:

Term

- schema.pre, schema.post: Schema hooks, registered in `_onSchema`. They run whenever a document is saved or removed.

- _preCreate, _postCreate, _preUpdate, _postUpdate, _preRemove, _postRemove: Service hooks. Only the service's `create<Model>`, `update<Model>` and `remove<Model>` run them.

- cascade: A removal declared on a field: documents linked to the removed one go with it.

Method

Schema hooks

Service hooks

cascade

- Document path: load, change, save

  - update<Model>(id, data): Generated on the service. The default choice for one record.

  - remove<Model>(id): Generated on the service. Soft-removes the document, then runs the cascade.

  - pickAndWrite(id, data): On the model: pick, set, save. `pickOneAndWrite(query, data)` picks by query.

  - doc.set(data).save(): The same thing, spelled out, when you already hold the document.

- Query write: one SQL statement, nothing loaded

  - updateOne · updateMany: Change the newest match, or every match.

  - removeOne · removeMany: Soft-remove the newest match, or every match.

  - updateById · removeById: The same query writes, narrowed to one id.

  - update<Filter>(…).set(…): Generated per filter, like `remove<Filter>`, `updateOne<Filter>` and `removeOne<Filter>`.

  - bulkWrite(operations): A list of `updateOne` operations, run one after another.

Runs

Does not run

A query write fires no hooks, and therefore no cascade.

**Nothing runs after it.** No schema hook, no service hook (`_postRemove` included) and no `cascade`. A removed row's files, children and counters stay behind, and because removal is soft, nothing reports the loss.

**`updateById` and `removeById` only look like the document call.** They are the same query write narrowed to one id, and fire nothing.

**`updateOne` and `removeOne` always hit the newest match** and return only counts. Use them for "there is at most one of these", never to take the next item off a queue.

**Live lists miss it too.** A `.live()` slice is fed by the same hooks, so a query write never reaches it. The one exception is a row an upsert inserts.

Two Write Styles

Every query write takes a filter first, then the change. Write the change as a plain object or as a builder function:

Form

When

Example

- Object — You only assign values. A bare value means `set`. — Example: `{ status: "published", pinned: true }`

- Builder — You need `inc`, `addToSet` or another operator. — Example: `({ inc }) => ({ viewNum: inc(1) })`

In a model class, the two look like this:

**The builder's argument holds every operator,** the way `q` holds the conditions in a filter. Destructure only what you use; there is nothing to import.

**Keys are field paths.** `"profile.city"` writes inside an object field, and a key that names no declared field throws.

**The four base columns take only `set` and `unset`.** `id`, `createdAt`, `updatedAt` and `removedAt` refuse `inc` and every other operator.

**The builder runs synchronously.** Compute awaited values, such as a password hash, before the call and reference them inside the builder.

Counters And Sets

Numeric and array operators run inside the database. Two requests that bump the same counter at once both count, and neither overwrites the other:

**Numbers: `inc`, `mul`, `min`, `max`.** A missing field counts as 0 for `inc` and `mul`; `min` and `max` just write the value. `inc()` alone adds 1.

**Arrays: `push`, `addToSet`, `pull`.** A missing array starts empty. `push` always appends, `addToSet` appends only when the value is absent, and `pull` removes every equal element.

**`updateMany` reports how many rows it touched** in `modifiedCount`, all in one statement.

**Keep sets to plain values.** `addToSet` and `pull` compare elements by value: reliable for ids, strings and numbers, not for objects.

Upsert

An upsert changes the match, or inserts a new row when nothing matches. Pass `{ upsert: true }` as the third argument:

When nothing matches, each part of the call ends up here:

Part of the call

In the new row

- { key: "daily-visits" } — Plain values in the filter are copied in. Conditions such as `q.oneOf()` are not.

- total: inc(1) — Operators apply to an empty value, so `total` starts at 1.

- status: setOnInsert("active") — Written on this insert only. An update that finds a match ignores it.

- result — `upsertedId` holds the new id, and `matchedCount` is 0.

**Only `updateOne`, `updateById` and `bulkWrite` upsert.** `updateMany` takes no options.

**The insert runs the `"create"` schema hooks only.** The `"save"` hooks and service hooks such as `_postCreate` do not run.

How It Becomes SQL

Every operator folds into one nested JSON expression on the `_doc` column, and `updatedAt` is stamped on every write. The database applies the whole update as one statement.

Operator

What it does · SQL

- plain value: Sets the field. The short form of `set`.

- set(value): Sets the field.

- unset(): Removes the field.

- inc(by = 1): Adds `by`. A missing field counts as 0.

- mul(by): Multiplies by `by`. A missing field counts as 0.

- min(value): Keeps the smaller of the stored value and `value`.

- max(value): Keeps the larger of the stored value and `value`.

- push(value): Appends to the array. A missing array starts empty.

- addToSet(value): Appends only when no equal element is there yet.

- pull(value): Removes every element equal to `value`.

- setOnInsert(value): Sets the field only when an upsert inserts a new row.

- nested path: A dotted key writes inside an object field.

- combined: Several operators nest into one expression.

**Simplified, in the SQLite dialect.** Postgres uses the matching `jsonb` functions.

**Every operator reads the document as it was before the update,** so all changes in one call see the same original values.

Tips And Pitfalls

**Query writes for counters and bulk state changes,** on a model with no removal side effect. Take a document path whenever hooks, a cascade or domain logic must run.

**Put atomic writes on the model class** in `<model>.document.ts`, and return `!!modifiedCount` so the service gets a plain yes or no.

**Use the builder form** instead of importing update helpers at module scope.

**`q.search()` cannot filter a write.** A query write whose filter searches throws; find the ids first, then write by id.

**`bulkWrite` runs its operations one by one,** each as its own statement, and adds up the counts.

What a write returns

Every query write resolves to the same result. Check `modifiedCount` when the write must have hit a row:

- acknowledged (boolean): `true` once the statement ran.

- matchedCount (number): Rows the filter matched. 0 when an upsert inserted instead.

- modifiedCount (number): Rows the write changed, counting an upsert's insert.

- upsertedId (string | null, optional): The new row's id when an upsert inserted; otherwise `null` or absent.

Read next

Querying

The filters and `q` conditions a write matches with.

Schema Hooks

`schema.pre` and `schema.post` in `_onSchema`.

Service Hooks

`_preUpdate`, `_postRemove` and the rest.

Cascade Remove

What `remove<Model>` takes along with it.

## Code Examples

### apps/myapp/lib/post/post.document.ts

```ts
export class PostModel extends into(Post, PostFilter, cnst.post, () => ({})) {
  async publish(postId: string) {
    const { modifiedCount } = await this.Post.updateOne(
      { id: postId },
      { status: "published", pinned: true },
    );
    return !!modifiedCount;
  }
  async markHot(postId: string) {
    const { modifiedCount } = await this.Post.updateOne(
      { id: postId },
      ({ inc, addToSet }) => ({ viewNum: inc(1), tags: addToSet("hot") }),
    );
    return !!modifiedCount;
  }
}
```

### apps/myapp/lib/post/post.document.ts

```ts
export class PostModel extends into(Post, PostFilter, cnst.post, () => ({})) {
  async addViewToPublished() {
    const { modifiedCount } = await this.Post.updateMany(
      { status: "published" },
      ({ inc }) => ({ viewNum: inc(1) }),
    );
    return modifiedCount;
  }
  async addTag(postId: string, tag: string) {
    const { modifiedCount } = await this.Post.updateOne(
      { id: postId },
      ({ addToSet }) => ({ tags: addToSet(tag) }),
    );
    return !!modifiedCount;
  }
  async subTag(postId: string, tag: string) {
    const { modifiedCount } = await this.Post.updateOne(
      { id: postId },
      ({ pull }) => ({ tags: pull(tag) }),
    );
    return !!modifiedCount;
  }
}
```

### apps/myapp/lib/stat/stat.document.ts

```ts
export class StatModel extends into(Stat, StatFilter, cnst.stat, () => ({})) {
  async addDailyVisit() {
    const { modifiedCount } = await this.Stat.updateOne(
      { key: "daily-visits" },
      ({ inc, setOnInsert }) => ({
        total: inc(1),
        status: setOnInsert("active"),
      }),
      { upsert: true },
    );
    return !!modifiedCount;
  }
}
```

### plain value

```ts
{ status: "done" }
// → json_set(_doc, '$.status', json(?))
```

### set(value)

```ts
({ set }) => ({ status: set("done") })
// → json_set(_doc, '$.status', json(?))
```

### unset()

```ts
({ unset }) => ({ draft: unset() })
// → json_remove(_doc, '$.draft')
```

### inc(by = 1)

```ts
({ inc }) => ({ viewNum: inc(1) })
// → json_set(_doc, '$.viewNum', COALESCE(json_extract(_doc, '$.viewNum'), 0) + ?)
```

### mul(by)

```ts
({ mul }) => ({ price: mul(1.1) })
// → json_set(_doc, '$.price', COALESCE(json_extract(_doc, '$.price'), 0) * ?)
```

### min(value)

```ts
({ min }) => ({ lowest: min(10) })
// → json_set(_doc, '$.lowest', MIN(COALESCE(json_extract(_doc, '$.lowest'), ?), ?))
```

### max(value)

```ts
({ max }) => ({ highest: max(90) })
// → json_set(_doc, '$.highest', MAX(COALESCE(json_extract(_doc, '$.highest'), ?), ?))
```

### push(value)

```ts
({ push }) => ({ logs: push(entry) })
// → json_set(_doc, '$.logs', json_insert(COALESCE(json_extract(_doc, '$.logs'), json('[]')), '$[#]', json(?)))
```

### addToSet(value)

```ts
({ addToSet }) => ({ tags: addToSet("urgent") })
// → json_set(_doc, '$.tags', CASE WHEN EXISTS (SELECT 1 FROM json_each(...) WHERE value = ?) THEN ... ELSE json_insert(..., '$[#]', json(?)) END)
```

### pull(value)

```ts
({ pull }) => ({ tags: pull("urgent") })
// → json_set(_doc, '$.tags', (SELECT json_group_array(value) FROM json_each(...) WHERE value <> ?))
```

### setOnInsert(value)

```ts
({ setOnInsert }) => ({ status: setOnInsert("new") })
// → no SQL; applied only to the upsert insert
```

### nested path

```ts
({ set }) => ({ "profile.city": set("Seoul") })
// → json_set(_doc, '$.profile.city', json(?))
```

### combined

```ts
({ inc, addToSet }) => ({ viewNum: inc(1), tags: addToSet("hot") })
// → json_set(json_set(_doc, '$.viewNum', ... + ?), '$.tags', ...)
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

