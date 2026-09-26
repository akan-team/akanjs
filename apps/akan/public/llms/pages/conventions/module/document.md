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

A named, reusable query such as `inProject`. Each one generates fourteen methods.

One loaded record: a class instance with `set()`, `save()` and your own chain methods.

chain method

A document method that changes `this` and returns it, so calls chain before one `save()`.

The class for work on the whole collection. A service reaches it as `this.ticketModel`.

The table facade inside the model class: `pickById`, `find`, `updateOne` and more.

hook

A function that runs before or after a document is written.

query-level write

One UPDATE over every match. Fast, but no hook runs.

Named queries and sort orders. Each query becomes fourteen methods on the model and the service.

One loaded record. Its chain methods change state and return the document itself.

Work on the whole collection: atomic writes, loaders, indexes and hooks.

Starts one named query.

A required argument. Every required argument comes before the optional ones.

An optional argument. Omitted, it is `undefined` or `null`, so add its condition only when set.

Names the model an id points at, e.g. `{ ref: "user" }`, so the admin panel shows a picker.

Returns the condition. The `q` helpers arrive as the last parameter.

A named order, picked by key as `{ sort: "highPriority" }`. `-1` is descending.

AND, OR and NOT. `all` and `any` skip `false` and `null`; an `{}` inside `any` matches every row.

Equal or not equal. A bare value such as `{ status }` already means equal.

In or not in a list. An empty `oneOf` matches nothing; an empty `notOneOf` matches everything.

Range comparisons for numbers and dates.

An array field contains this element. A bare value on an array field means the same.

A text field contains this substring.

The field has no value: absent or `null`. This is the one for "has no value".

The key is stored, or absent. `missing` is for rows written before the field existed.

Returns the query when the condition is truthy, `{}` otherwise.

Full-text match over fields with a `text` role. See Text Search Query below.

A raw SQL fragment with bound parameters. It ties the query to one database dialect.

Every match. Options: `sort`, `skip`, `limit`, `select`.

The same, ids only.

One match or `null`.

The same, id only.

One match; throws when there is none.

The matching id or `null` — not a boolean.

How many match.

Every counter the Insight class declares.

Builds the query without running it, synchronously. A slice's `exec` returns this.

One atomic UPDATE marking every match removed.

The same, on the newest match only.

A chain; the patch goes on a terminal `.set(patch)`.

Loads through the id loader and throws when the document does not exist.

The same, but resolves to `null` instead of throwing, also for an empty id.

Loads several ids in one batched query.

Inserts one document. The `save` and `create` hooks run.

Patches and saves one document. The `save` and `update` hooks run.

Soft-deletes one document by stamping `removedAt`. The `remove` hooks run.

Treats the last word as a prefix, which a search-as-you-type box needs.

Limits the match to some columns, e.g. `{ columns: ["title"] }`. Omitted, all four match.

Ranking weights in the order title, desc, tag, filter: four finite, non-negative numbers.

One document, or throw. The second argument is a bare projection, e.g. `{ secret: true }`.

`null` or a list instead of throwing. `find` chains `.sort()`, `.skip()` and `.limit()`.

A number, or the matching id or `null`. `countDocuments` is the deprecated name.

Load, `set()` and `save()` in one call, so the save hooks run.

Query-level writes: one statement, no hooks. `One` hits the newest match.

The same hookless writes, narrowed to one id. Not the document path.

Builds an unsaved document. Its `save()` inserts it and runs the `save` and `create` hooks.

Random documents that match the query.

Several `updateOne` operations in one call, each optionally upserting.

One document per value of a field: the match for that key, or `null`.

One document whose array field contains the key.

One document per combination of several fields.

Refuses a second document with the same values in these fields.

Fixes the index name. The default depends on the index's position in `_onSchema`.

query-level

Every document write except a removal.

Only when a document is inserted.

When an existing document is saved.

When `remove<Model>(id)` stamps `removedAt`.

Reading

reusable condition

A list or lookup you would otherwise repeat in service methods.

sort order

A named order such as `highPriority`.

frequent lookup

A loader for a key you look up often, or an index for a query you run often.

Writing

state transition

One record moves between states: `open()`, `approve()`.

state precondition

The chain method throws `Err` when the record is in the wrong state.

counter · bulk write

One UPDATE through the facade, returning `!!modifiedCount`.

derived field · index

Small persistence work in `_onSchema`.

Orchestrating

cross-document rule

Load every document involved, then throw `Err` or save.

side effect of a write

`_postCreate`, `_postRemove` and the other service hooks.

Field types, and the text roles that search reads.

Who calls these methods, and the service hooks around them.

The document file of an embedded value object.

Text Search

Search from marking the fields to publishing a slice.

Open it when a service repeats the same query, when a record moves between states, or when a table needs a counter, a loader or an index.

Words used on this page

Term

Standard Document Shape

A database module's document file declares three classes, always in this order. A complete file with one query and one chain method looks like this:

Class

Queries, Sorts And Generated Methods

Building a query

Builder

The q helpers

Helper

Fourteen generated methods

Every query generates fourteen methods, identically on the model and the service. Ten of them only read:

In a service they read like this:

Generated CRUD methods

Next to the query methods, every model gets these six CRUD methods.

Called from a service:

Text Search Query

It is an ordinary query node, so it combines with normal conditions:

Search options

A service calls it like any other query:

Rules

Optional search text

Changing One Document

The service loads, chains and saves:

Model-Level Helpers

The table facade

Method

Extending A Library Model

Loaders And Lookups

A single-field loader looks up by one key:

Keeping Loaded Keys

Each loaded key is kept

The default: not past the batch it was loaded in.

For that many milliseconds.

For as long as the process runs.

Schema Hooks And Indexes

Indexes

An index speeds up a lookup you run often:

Hooks

Which writes run which hook event:

Event

runs

does not run

Practical Rules

Where each kind of code goes, across the three classes and the service:

What you are writing

goes here

not here

Common mistakes

Related pages

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

