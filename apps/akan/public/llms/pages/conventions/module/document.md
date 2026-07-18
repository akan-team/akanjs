# model.document.ts

- Source: /conventions/module/document
- Mirror: /llms/pages/conventions/module/document.md
- Section: conventions
- Category: Domain
- Priority: P1

## Headings

- model.document.ts (#document-overview)
- Standard Document Shape (#standard-document-shape)
- Query, Sort, And Generated Methods (#query-sort-methods)
- Document Instance Behavior (#document-by)
- Model-Level Helpers (#model-into)
- Extending Generated Documents (#generated-extension)
- Loaders And Custom Lookups (#loaders-lookups)
- Schema Hooks And Indexes (#schema-hooks)
- Practical Rules (#practical-rules)

## Content

model.document.ts

A document file defines the database behavior of a module. The constant file describes the data shape, while the document file explains how to query, mutate, load, index, and operate on stored documents.

A normal document file usually contains search conditions, document-level behavior, and database model helpers used by services.

Standard Document Shape

Use this shape for normal collection-backed models. Business documents usually define query rules, one-document behavior, and model-level helpers together.

Reusable list, lookup, and sort conditions.

Behavior of one loaded document.

Model-level helpers used by services.

Query, Sort, And Generated Methods

Define frequently used list and lookup conditions once, then use the generated methods in services or signals. For example, a query named inProject becomes methods like listInProject, countInProject, and existsInProject.

The framework already provides all-document and latest/oldest ordering behavior, so only add business-specific search and sort rules.

Required input for the query. Required args must come before optional args.

Optional input. Build the query conditionally when the value exists.

Use helpers like all, any, not, oneOf, notOneOf, between, gte, lte, contains, exists, and empty.

Document Instance Behavior

Put small state transitions and document-level checks on the loaded document class. Methods usually mutate this, use this.set(...) when several fields change together, and return this for chaining.

Because each method returns the same document, service code can chain several document methods and save the final result once.

Model-Level Helpers

Put collection-level operations on the model class. Service files usually call these helpers when they need direct database updates, batch operations, counters, or document generation.

Extending Generated Documents

Generated or app-template domains can provide existing filter, document, and model behavior. Keep those generated refs in the class declarations, then add only the local app-specific methods you need.

Loaders And Custom Lookups

Declare loaders for lookup shapes that are used often and should stay consistent. Use a single-field loader for lookups like product by seller, and a multi-field loader for stable combinations like order by shop and order number.

Schema Hooks And Indexes

Use _onSchema when the storage schema needs indexes or lightweight save hooks. Keep heavy business workflows in service or model methods, and keep schema hooks focused on persistence concerns.

Practical Rules

Use Filter, Document, and Model class names that match the constant model name.

Put reusable list and lookup conditions in the filter section instead of repeating them in service methods.

Put single-document state transitions on the document class, and collection-level operations on the model class.

Use generated extension spreads when a template domain provides filters, docs, or models.

Use loaders for common stable lookups, and schema hooks only for persistence-level indexes or small save hooks.

Keep scalar document files small; a simple document class is usually enough.

## Code Examples

### ticket.document.ts

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

export class TicketModel extends into(Ticket, TicketFilter, cnst.ticket, () => ({})) {}
```

### story.document.ts

```ts
export class TicketFilter extends from(cnst.Ticket, (filter) => ({
  query: {
    inProject: filter()
      .arg("project", ID)
      .query((project) => ({ project })),
  },
  sort: {
    highPriority: { priority: -1 },
  },
})) {}
```

### ticket.service.ts | ticket.document.ts

```ts
const ticket = await this.getTicket(ticketId);
const ticket = await this.loadTicket(ticketId);
const tickets = await this.loadTicketMany(ticketIds);

const ticket = await this.createTicket(data);
const ticket = await this.updateTicket(ticketId, updateData);
await this.removeTicket(ticketId);
```

### ticket.service.ts | ticket.document.ts

```ts
const tickets = await this.listInProject(projectId, { sort: "highPriority" });
const ticket = await this.findInProject(projectId);
const ticket = await this.pickInProject(projectId);

const count = await this.countInProject(projectId);
const exists = await this.existsInProject(projectId);
const ticketInsight = await this.insightInProject(projectId);
```

### ticket.document.ts

```ts
export class Ticket extends by(cnst.Ticket) {
  open() {
    this.status = "opened";
    return this;
  }
}
```

### ticket.service.ts

```ts
const ticket = await this.getTicket(ticketId);
await ticket.open().assign(userId).save();
```

### story.document.ts

```ts
export class StoryModel extends into(Story, StoryFilter, cnst.story, () => ({})) {
  async publish(storyId: string) {
    return await this.Story.pickAndWrite(storyId, { status: "approved" });
  }
}
```

### user.document.ts

```ts
export class UserFilter extends from(cnst.User, (filter) => ({ query: {}, sort: {} }), ...user.filters) {}

export class User extends by(cnst.User, ...user.docs) {
  hasAccessToken() {
    return this.githubInfo?.accessToken !== undefined;
  }
}

export class UserModel extends into(User, UserFilter, cnst.user, () => ({}), ...user.models) {}
```

### product.document.ts

```ts
export class ProductModel extends into(Product, ProductFilter, cnst.product, ({ byField }) => ({
  productSellerLoader: byField("seller"),
})) {
  async getSellerProducts(sellerId: string) {
    return await this.productSellerLoader.load(sellerId);
  }
  async getManySellerProducts(sellerIds: string[]) {
    return await this.productSellerLoader.loadMany(sellerIds);
  }
}
```

### order.document.ts

```ts
export class OrderModel extends into(Order, OrderFilter, cnst.order, ({ byQuery }) => ({
  orderLoader: byQuery(["shop", "orderNumber"] as const),
})) {
  async getShopOrder(orderQuery: { shop: string; orderNumber: string }) {
    return await this.orderLoader.load(orderQuery);
  }
}
```

### story.document.ts

```ts
export class StoryModel extends into(Story, StoryFilter, cnst.story, () => ({})) {
  static override _onSchema(schema: SchemaOf) {
    schema.index({ title: "text" });
  }
}
```

### user.document.ts

```ts
export class UserModel extends into(User, UserFilter, cnst.user, () => ({})) {
  static override _onSchema(schema: SchemaOf) {
    schema.pre("save", function (next) {
      this.updatedAt = new Date();
      next();
    });
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

