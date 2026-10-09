# model.document.ts

- Source: /conventions/module/document
- Mirror: /llms/pages/conventions/module/document.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.document.ts (#document-overview)
- Standard Document Shape (#standard-document-shape)
- Queries, Sorts And Generated Methods (#query-sort-methods)
- Text Search Query (#text-search-query)
- Changing One Document (#document-by)
- Model-Level Helpers (#model-into)
- Extending A Library Model (#generated-extension)
- Loaders And Lookups (#loaders-lookups)
- Schema Hooks And Indexes (#schema-hooks)
- Practical Rules (#practical-rules)

## Content

model.document.ts

`model.document.ts` decides how a stored model is queried and changed. `model.constant.ts` says what the data looks like; this file holds the reusable queries, the state changes and the database helpers that services call.

Open it when a service repeats the same query, when a record moves between states, or when a table needs a counter, a loader or an index.

Words used on this page

Term

- filter: A named, reusable query such as `inProject`. Each one generates fourteen methods.

- document: One loaded record: a class instance with `set()`, `save()` and your own chain methods.

- chain method: A document method that changes `this` and returns it, so calls chain before one `save()`.

- model: The class for work on the whole collection. A service reaches it as `this.ticketModel`.

- this.Ticket: The table facade inside the model class: `pickById`, `find`, `updateOne` and more.

- hook: A function that runs before or after a document is written.

- query-level write: One UPDATE over every match. Fast, but no hook runs.

Standard Document Shape

A database module's document file declares three classes, always in this order. A complete file with one query and one chain method looks like this:

Class

- TicketFilter: Named queries and sort orders. Each query becomes fourteen methods on the model and the service. — Example: `from(cnst.Ticket, (filter) => ({ query: {}, sort: {} }))`

- Ticket: One loaded record. Its chain methods change state and return the document itself. — Example: `by(cnst.Ticket)`

- TicketModel: Work on the whole collection: atomic writes, loaders, indexes and hooks. — Example: `into(Ticket, TicketFilter, cnst.ticket, () => ({}))`

**The order is fixed.** `TicketFilter` → `Ticket` → `TicketModel`, and `sort: {}` is written even when it is empty.

**Names follow the constant.** The three class names come from `cnst.Ticket`; `into()` takes the lowercase `cnst.ticket`.

**The fourth argument of `into()` declares loaders.** Write `() => ({})` when there are none.

**An empty module keeps all three.** A new module starts with three empty classes; they mark where each kind of code goes.

Queries, Sorts And Generated Methods

Write a condition you use often once, as a named query, and call the generated methods from services and signals. A query named `inProject` becomes `listInProject`, `countInProject`, `existsInProject` and eleven more:

Building a query

Builder

- filter(): Starts one named query.

- .arg(name, Type): A required argument. Every required argument comes before the optional ones.

- .opt(name, Type): An optional argument. Omitted, it is `undefined` or `null`, so add its condition only when set.

- .arg(name, ID, { ref }): Names the model an id points at, e.g. `{ ref: "user" }`, so the admin panel shows a picker.

- .query((...args, q) => …): Returns the condition. The `q` helpers arrive as the last parameter.

- sort: { key: { field: -1 } }: A named order, picked by key as `{ sort: "highPriority" }`. `-1` is descending.

**Already built in:** the `any` query (every row not removed) and the `latest`, `oldest` and `relevance` sorts. Add only the rules your business needs.

**Never put `undefined` in a query.** `{ status: undefined }` throws, so leave the key out when an optional argument is missing.

**Sort keys are checked.** A key the filter does not declare is refused, not quietly replaced by another order.

The q helpers

Most helpers sit in a field's position, as in `{ status: q.oneOf(list) }`. The three presence checks take a field path instead.

Helper

- q.all, q.any, q.not: AND, OR and NOT. `all` and `any` skip `false` and `null`; an `{}` inside `any` matches every row. — Example: `q.any({ owner: userId }, { assignee: userId })`

- q.eq, q.ne: Equal or not equal. A bare value such as `{ status }` already means equal.

- q.oneOf, q.notOneOf: In or not in a list. An empty `oneOf` matches nothing; an empty `notOneOf` matches everything. — Example: `{ status: q.oneOf(statuses) }`

- q.gt, q.gte, q.lt, q.lte, q.between: Range comparisons for numbers and dates. — Example: `{ price: q.gte(minPrice) }`

- q.has: An array field contains this element. A bare value on an array field means the same. — Example: `{ tags: q.has(tag) }`

- q.contains: A text field contains this substring. — Example: `{ title: q.contains(word) }`

- q.empty(path): The field has no value: absent or `null`. This is the one for "has no value". — Example: `q.empty("assignee")`

- q.exists(path), q.missing(path): The key is stored, or absent. `missing` is for rows written before the field existed.

- q.when: Returns the query when the condition is truthy, `{}` otherwise. — Example: `q.when(onlyOpen, { status: "opened" })`

- q.search: Full-text match over fields with a `text` role. See Text Search Query below.

- q.raw(sql, params): A raw SQL fragment with bound parameters. It ties the query to one database dialect.

Fourteen generated methods

Every query generates fourteen methods, identically on the model and the service. Ten of them only read:

- list<Filter> (Promise<Doc[]>): Every match. Options: `sort`, `skip`, `limit`, `select`.

- listIds<Filter> (Promise<string[]>): The same, ids only.

- find<Filter> (Promise<Doc | null>): One match or `null`.

- findId<Filter> (Promise<string | null>): The same, id only.

- pick<Filter> (Promise<Doc>): One match; throws when there is none.

- pickId<Filter> (Promise<string>): The same, id only.

- exists<Filter> (Promise<string | null>): The matching id or `null` — not a boolean.

- count<Filter> (Promise<number>): How many match.

- insight<Filter> (Promise<Insight>): Every counter the Insight class declares.

- query<Filter> (QueryOf<Doc>): Builds the query without running it, synchronously. A slice's `exec` returns this.

The other four are **query-level writes**: one statement straight to the database, with no hook:

- remove<Filter> (Promise<UpdateResult>): One atomic UPDATE marking every match removed.

- removeOne<Filter> (Promise<UpdateResult>): The same, on the newest match only.

- update<Filter> (UpdateChain<Doc>): A chain; the patch goes on a terminal `.set(patch)`.

- updateOne<Filter> (UpdateChain<Doc>): The same, on the newest match only.

In a service they read like this:

**`count` and `insight` read the same query.** `count` returns a number; `insight` returns every counter on `db.<Model>Insight`.

**`exists<Filter>` is not a boolean.** It resolves to the matching id or `null`, so a strict `=== true` never passes.

**`removeOne` and `updateOne` hit the newest match.** They are for "there is at most one of these", never for taking the next item off a queue.

**`update<Filter>` is a chain.** The patch goes on a terminal `.set()`; building the chain touches nothing.

**A projection nests under `select` here.** `listInProject(id, { select: { secret: true } })`, while the facade's `pickById(id, { secret: true })` takes it bare.

**The four query-level writes run no hooks.** No `_postRemove`, no cascade: on a model whose removal deletes a stored file or closes a child, `remove<Filter>` leaves all of that undone and still reports a count that looks like success. Use them only on models with no removal side effect; otherwise remove one at a time with the service's `remove<Model>(id)`.

Generated CRUD methods

Next to the query methods, every model gets these six CRUD methods.

- get<Model>(id) (Promise<Doc>): Loads through the id loader and throws when the document does not exist.

- load<Model>(id?) (Promise<Doc | null>): The same, but resolves to `null` instead of throwing, also for an empty id.

- load<Model>Many(ids) (Promise<Doc[]>): Loads several ids in one batched query.

- create<Model>(data) (Promise<Doc>): Inserts one document. The `save` and `create` hooks run.

- update<Model>(id, data) (Promise<Doc>): Patches and saves one document. The `save` and `update` hooks run.

- remove<Model>(id) (Promise<Doc>): Soft-deletes one document by stamping `removedAt`. The `remove` hooks run.

Called from a service:

**Call them on the service.** The service's copies also run `_preCreate`, `_postRemove` and the other service hooks, and its `remove<Model>` runs the cascade. The model's copies skip both.

Text Search Query

`q.search()` matches the full-text index built from fields that declare a `text` role, such as `field(String, { text: "title" })`. There is no separate search method: a query named `bySearch` gets `listBySearch`, `countBySearch`, `queryBySearch`, `insightBySearch` and the rest.

It is an ordinary query node, so it combines with normal conditions:

Search options

- prefix (boolean, default false): Treats the last word as a prefix, which a search-as-you-type box needs.

- columns (("title" | "desc" | "tag" | "filter")[]): Limits the match to some columns, e.g. `{ columns: ["title"] }`. Omitted, all four match.

- weights (number[], default [10, 1, 3, 0]): Ranking weights in the order title, desc, tag, filter: four finite, non-negative numbers.

A service calls it like any other query:

Rules

**Keep it at an AND position.** At the top or inside `q.all()`, never under `q.any()` or `q.not()`.

**Blank input matches nothing.** An empty search box never turns into a full listing; do not "fix" that into a passthrough.

**Name `relevance` for the best match first.** Another sort key wins over the score. With no sort, a service call orders by score but a slice uses `latest`.

**No search in a query-level write.** `update<Filter>`, `remove<Filter>` and their `One` forms throw on a search query.

**Works in every database mode.** For the same text, SQLite and Postgres match the same documents; only the order can differ on Postgres.

**A filter is enough for a service.** A slice publishes the search to clients, so add one only for models that are safe to enumerate.

Optional search text

The admin search in `libs/shared` takes the text as optional and falls back to `{}`, so an empty box lists every admin. That is intended only because admin guards protect the slice; never do it on a public one.

Changing One Document

The state changes of one record live on the document class as chain methods. Each one checks, changes `this` and returns `this`, so a service can chain several and save once.

The service loads, chains and saves:

**Check, change, return `this`.** Validate first, mutate second, and end with `return this`.

**Never `save()` inside.** The caller saves once, so chains compose: `org.removeUser(id).removeInvite(id).save()`.

**Several fields at once: `this.set({ … })`.** It returns `this`, so it can be the method's return value.

**One comment line per method names the transition,** such as `// draft -> opened`.

**Throw `new Err("ticket.error.<key>")`, never `new Error`.** A raw `Error` fails lint and with it the build, so register the key as `[en, ko]` in the dictionary's `.error({})`. A state precondition throws here; a rule across several documents throws in the service.

Model-Level Helpers

Work on the whole collection goes on the model class: atomic updates, bulk writes, counters and building new documents. Inside it, `this.Story` is the table facade:

**Counters use the updater callback.** `({ inc }) => ({ viewCount: inc() })` compiles to one atomic UPDATE with no read first; return `!!modifiedCount`.

**Updater helpers:** `set`, `unset`, `inc`, `mul`, `min`, `max`, `push`, `pull`, `addToSet`, `setOnInsert`. A bare value means `set`.

**Removal is always soft.** Every remove stamps `removedAt`, and every query already skips removed rows, so a filter does not need to check `removedAt`.

The table facade

Method

- pickById, pickOne: One document, or throw. The second argument is a bare projection, e.g. `{ secret: true }`.

- findById, findOne, find: `null` or a list instead of throwing. `find` chains `.sort()`, `.skip()` and `.limit()`.

- count, exists: A number, or the matching id or `null`. `countDocuments` is the deprecated name.

- pickAndWrite, pickOneAndWrite: Load, `set()` and `save()` in one call, so the save hooks run. — Example: `await this.Story.pickAndWrite(storyId, { status: "approved" })`

- updateOne, updateMany, removeOne, removeMany: Query-level writes: one statement, no hooks. `One` hits the newest match.

- updateById, removeById: The same hookless writes, narrowed to one id. Not the document path.

- new this.Story(data): Builds an unsaved document. Its `save()` inserts it and runs the `save` and `create` hooks. — Example: `return await new this.Story(data).save();`

- sample, sampleOne: Random documents that match the query.

- bulkWrite: Several `updateOne` operations in one call, each optionally upserting.

Extending A Library Model

An app can add to a model a library already defines, such as `user` from `libs/shared`. Pass the library's classes as the last arguments and write only what the app adds.

`../__lib/lib.document` collects the library's classes for each model:

**One spread per class.** `...user.filters` goes into `from()`, `...user.docs` into `by()`, `...user.models` into `into()`.

**The library's behavior merges in.** Its queries, sorts, document methods, model methods, loaders and `_onSchema` hooks all join yours.

**Keep the spreads when you edit.** Dropping one removes the library's methods from your class.

**`lib/__lib/lib.document.ts` is generated.** Do not edit it; it follows the libraries the app depends on.

Loaders And Lookups

A loader collects the lookups made in the same tick and answers them with one query, so a hundred `load()` calls cost one round-trip. Declare one in the fourth argument of `into()` for a lookup key you use often.

- byField("sku"): One document per value of a field: the match for that key, or `null`.

- byArrayField("tags"): One document whose array field contains the key.

- byQuery(["shop", "orderNumber"] as const): One document per combination of several fields.

A single-field loader looks up by one key:

A key made of several fields takes `byQuery`:

**A missing key resolves to `null`.** `load()` does not throw for a key with no match.

**Every builder takes a default query** as its second argument, e.g. `byField("sku", { status: "active" })`.

**The id loader is built in.** `get<Model>`, `load<Model>` and `load<Model>Many` already batch through it, and it keeps nothing past a batch.

**A loader returns one document per key, not a list.** `byField("seller")` would answer one product per seller. "Every product of a seller" is a query, `listBySeller(sellerId)`, not a loader.

Keeping Loaded Keys

Every builder takes an option object as its third argument, such as `byField("sku", {}, { cache: 60_000 })`. Its `cache` decides how long a loaded key is answered from memory:

Each loaded key is kept

The default: not past the batch it was loaded in.

For that many milliseconds.

For as long as the process runs.

**A kept key serves a stale document.** Loaders live as long as the process, so a document changed after it was loaded is still answered in its old shape until the key expires.

**A failed load is never kept.** The next `load()` for that key asks the database again.

Schema Hooks And Indexes

`static override _onSchema(schema)` declares what the table itself needs: indexes, and small hooks that keep derived fields in step. Business workflows stay in the service.

Indexes

An index speeds up a lookup you run often:

The second argument of `schema.index()`:

- unique (boolean, default false): Refuses a second document with the same values in these fields.

- name (string, default <table>_<fields>_<position>): Fixes the index name. The default depends on the index's position in `_onSchema`.

**Search is not an index.** `schema.index()` builds plain lookup indexes. The value `"text"` is an old alias for a plain index, not search; declare a `text` role on the field instead.

**Named sorts are indexed for you.** Each order in the filter's `sort` already has an index, so declare one only for a lookup you run often.

**A builder form exists too.** `schema.createIndex(name)` chains `.path(field, order)`, `.unique()` and ends with `.done()`.

**Leave a shipped index as written.** Every live database remembers its definition, so changing it, even `"text"` to `1` or adding `unique`, breaks them all. Add a new index at the end instead, or give it a `name`.

Hooks

A hook keeps a derived field in step with the field it comes from. This one recounts a story's tags whenever they change:

Which writes run which hook event:

Event

create — create<Model>

update — update<Model> · save()

remove — remove<Model>

query-level — update<Filter>

- `schema.pre("…", fn)` · `schema.post("…", fn)`

  - "save": Every document write except a removal.

  - "create": Only when a document is inserted.

  - "update": When an existing document is saved.

  - "remove": When `remove<Model>(id)` stamps `removedAt`.

runs

does not run

**Hooks may be `async` and need no `next()`.** `this` is the document, and the third parameter, `previous`, is the row before this write (absent on create).

**Read `this.isModified("field")` inside a save hook.** On a document fresh from a read, such as `get<Model>` or `list<Filter>`, it throws.

**On a create, `isModified()` is always `false`.** A create has no `previous`, so check `!previous` first, as the example does.

**`post` hooks run after the write commits.** `pre` hooks run before it, and can still change the document.

**`updatedAt` is stamped for you** on every write, query-level ones included. Do not set it in a hook.

Practical Rules

Where each kind of code goes, across the three classes and the service:

What you are writing

Filter — from()

Document — by()

Model — into()

Service — serve()

- Reading

  - reusable condition: A list or lookup you would otherwise repeat in service methods.

  - sort order: A named order such as `highPriority`.

  - frequent lookup: A loader for a key you look up often, or an index for a query you run often.

- Writing

  - state transition: One record moves between states: `open()`, `approve()`.

  - state precondition: The chain method throws `Err` when the record is in the wrong state.

  - counter · bulk write: One UPDATE through the facade, returning `!!modifiedCount`.

  - derived field · index: Small persistence work in `_onSchema`.

- Orchestrating

  - cross-document rule: Load every document involved, then throw `Err` or save.

  - side effect of a write: `_postCreate`, `_postRemove` and the other service hooks.

goes here

not here

Common mistakes

**Class names that drift from the constant.** `TicketFilter`, `Ticket` and `TicketModel` match `cnst.Ticket`.

**The same condition copied into several services.** Move it into the filter and call `listInProject` everywhere.

**A filter named after its own model.** A `ticket` query on `Ticket` would produce `removeTicket` and `updateTicket`, which the CRUD methods already own.

**`!!result` instead of `!!modifiedCount`.** `updateOne` resolves to an object, so `!!` on it is always `true`. Destructure `{ modifiedCount }` first.

**A heavy workflow in a schema hook.** Hooks are for indexes and small derived fields; workflows go in the service.

**A large scalar document.** A scalar's document file is usually just `by(cnst.X)` with a small helper or two.

Related pages

- model.constant.ts — Field types, and the text roles that search reads.

- model.service.ts — Who calls these methods, and the service hooks around them.

- scalar.document.ts — The document file of an embedded value object.

- Text Search — Search from marking the fields to publishing a slice.

## Code Examples

### apps/koyo/lib/ticket/ticket.document.ts

```ts
import { ID } from "akanjs/base";
import { by, from, into } from "akanjs/document";

import * as cnst from "../cnst";

export class TicketFilter extends from(cnst.Ticket, (filter) => ({
  query: {
    inProject: filter()
      .arg("project", ID)
      .query((project) => ({ project })),
  },
  sort: {},
})) {}

export class Ticket extends by(cnst.Ticket) {
  open() {
    this.status = "opened";
    return this;
  }
}

export class TicketModel extends into(
  Ticket,
  TicketFilter,
  cnst.ticket,
  () => ({}),
) {}
```

### apps/koyo/lib/ticket/ticket.document.ts

```ts
export class TicketFilter extends from(cnst.Ticket, (filter) => ({
  query: {
    inProject: filter()
      .arg("project", ID)
      .opt("statuses", [cnst.TicketStatus])
      .query((project, statuses, q) => ({
        project,
        ...(statuses?.length ? { status: q.oneOf(statuses) } : {}),
      })),
  },
  sort: {
    highPriority: { priority: -1 },
  },
})) {}
```

### apps/koyo/lib/ticket/ticket.service.ts

```ts
const tickets = await this.listInProject(projectId, {
  sort: "highPriority",
  limit: 20,
});
const firstTicket = await this.findInProject(projectId);
const ticket = await this.pickInProject(projectId);

const count: number = await this.countInProject(projectId);
const ticketId: string | null = await this.existsInProject(projectId);
const ticketInsight: db.TicketInsight = await this.insightInProject(projectId);

await this.updateInProject(projectId).set({ status: "archived" });
```

### apps/koyo/lib/ticket/ticket.service.ts

```ts
const ticket = await this.getTicket(ticketId);
const maybeTicket = await this.loadTicket(ticketId);
const tickets = await this.loadTicketMany(ticketIds);

const created = await this.createTicket(data);
const updated = await this.updateTicket(ticketId, updateData);
await this.removeTicket(ticketId);
```

### apps/koyo/lib/ticket/ticket.document.ts

```ts
export class TicketFilter extends from(cnst.Ticket, (filter) => ({
  query: {
    bySearch: filter()
      .arg("text", String)
      .opt("statuses", [cnst.TicketStatus])
      .query((text, statuses, q) =>
        q.all(
          q.search(text, { prefix: true }),
          statuses?.length ? { status: q.oneOf(statuses) } : {},
        ),
      ),
  },
  sort: {},
})) {}
```

### apps/koyo/lib/ticket/ticket.service.ts

```ts
const tickets = await this.listBySearch(text, statuses, {
  sort: "relevance",
});
const count = await this.countBySearch(text, statuses);
```

### libs/shared/lib/admin/admin.document.ts

```ts
export class AdminFilter extends from(cnst.Admin, (filter) => ({
  query: {
    byAccountId: filter()
      .arg("accountId", String)
      .query((accountId) => ({ accountId })),
    bySearch: filter()
      .opt("text", String)
      .opt("roles", [cnst.AdminRole])
      .query((text, roles, q) =>
        q.all(
          text ? q.search(text, { prefix: true }) : {},
          roles?.length ? { roles: q.oneOf(roles) } : {},
        ),
      ),
  },
  sort: {},
})) {}
```

### apps/koyo/lib/ticket/ticket.document.ts

```ts
import { by } from "akanjs/document";

import * as cnst from "../cnst";
import { Err } from "../dict";

export class Ticket extends by(cnst.Ticket) {
  // draft -> opened
  open() {
    if (this.status !== "draft") throw new Err("ticket.error.notDraft");
    this.status = "opened";
    return this;
  }
  // opened -> assigned
  assign(userId: string) {
    if (this.status !== "opened") throw new Err("ticket.error.notOpened");
    return this.set({ assignee: userId, status: "assigned" });
  }
}
```

### apps/koyo/lib/ticket/ticket.service.ts

```ts
async open(ticketId: string, userId: string) {
  const ticket = await this.getTicket(ticketId);
  return await ticket.open().assign(userId).save();
}
```

### apps/koyo/lib/story/story.document.ts

```ts
export class StoryModel extends into(
  Story,
  StoryFilter,
  cnst.story,
  () => ({}),
) {
  async publish(storyId: string) {
    return await this.Story.pickAndWrite(storyId, { status: "approved" });
  }
  async addViewCount(storyId: string) {
    const { modifiedCount } = await this.Story.updateOne(
      { id: storyId },
      ({ inc }) => ({ viewCount: inc() }),
    );
    return !!modifiedCount;
  }
}
```

### apps/blog/lib/user/user.document.ts

```ts
import { by, from, into } from "akanjs/document";

import { user } from "../__lib/lib.document";
import * as cnst from "../cnst";

export class UserFilter extends from(
  cnst.User,
  (filter) => ({ query: {}, sort: {} }),
  ...user.filters,
) {}

export class User extends by(cnst.User, ...user.docs) {
  hasAccessToken() {
    return !!this.githubInfo?.accessToken;
  }
}

export class UserModel extends into(
  User,
  UserFilter,
  cnst.user,
  () => ({}),
  ...user.models,
) {}
```

### apps/koyo/lib/product/product.document.ts

```ts
export class ProductModel extends into(
  Product,
  ProductFilter,
  cnst.product,
  ({ byField }) => ({ productSkuLoader: byField("sku") }),
) {
  async getProductBySku(sku: string) {
    return await this.productSkuLoader.load(sku);
  }
  async getProductsBySkus(skus: string[]) {
    return await this.productSkuLoader.loadMany(skus);
  }
}
```

### apps/koyo/lib/order/order.document.ts

```ts
export class OrderModel extends into(
  Order,
  OrderFilter,
  cnst.order,
  ({ byQuery }) => ({
    orderLoader: byQuery(["shop", "orderNumber"] as const),
  }),
) {
  async getShopOrder(orderQuery: { shop: string; orderNumber: string }) {
    return await this.orderLoader.load(orderQuery);
  }
}
```

### apps/koyo/lib/story/story.document.ts

```ts
import { by, from, into, type SchemaOf } from "akanjs/document";

export class StoryModel extends into(
  Story,
  StoryFilter,
  cnst.story,
  () => ({}),
) {
  static override _onSchema(schema: SchemaOf<StoryModel, Story>) {
    schema.index({ author: 1, createdAt: -1 });
    schema.index({ slug: 1 }, { unique: true });
  }
}
```

### apps/koyo/lib/story/story.document.ts

```ts
export class StoryModel extends into(
  Story,
  StoryFilter,
  cnst.story,
  () => ({}),
) {
  static override _onSchema(schema: SchemaOf<StoryModel, Story>) {
    schema.pre<Story>("save", function (_next, _type, previous) {
      if (!previous || this.isModified("tags")) {
        this.tagNum = this.tags.length;
      }
    });
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

