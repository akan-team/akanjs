# Data Layer

- Source: /docs/core/data-layer
- Mirror: /llms/pages/docs/core/data-layer.md
- Section: docs
- Category: Core Concepts
- Priority: P0

## Headings

- Data Layer (#data-layer)
- Model Shape (#model-shape)
- Document And Service (#document-and-service)
- What A Filter Generates (#filter-methods)
- Signal To UI (#signal-to-ui)
- Fetch And Store Instances (#fetch-and-st)
- Streaming Page Data (#streaming-page-data)
- Common Decisions (#common-decisions)

## Content

Data Layer

The data layer is the path from business data definition to server logic and screen usage. If you are building products, orders, users, reservations, or invoices, this is where the business shape becomes real application behavior.

Akan keeps this flow close to the model folder. For example, a product feature can define what a product is, how it is stored, how stock and price rules work, and how pages load product data from one module.

One module, from the database to the screen

One lib/product folder holds the whole path: document stores the data, service runs the business rules, signal opens them to pages, and past the API the store holds client state for the UI. The constant file runs underneath every step, because each of them reuses its shape.

Model Shape

The constant file is the design sheet of a business object. It answers questions such as: What fields does a product have? Which values are allowed? Which fields should be shown in a lightweight list?

In the product example, the model keeps catalog information such as name, description, image URL, price, stock, and sale status. This is the shared source that the server and client can both understand.

Fields that can be submitted when creating or updating data.

The base object shape used to build other model views.

A smaller view for lists, cards, and embedded references.

The whole record, returned by a detail query. Write all five classes, in this order, in every constant file.

Aggregate numbers a list query reports alongside the rows. Declare it even when it is empty.

How the five classes build on each other

Input is what a form sends. Object adds the stored fields the system controls. Light picks the few fields a list or card needs and carries the shared logic. Model combines Object and Light into the full record, and Insight counts over a list of them.

Where each class shows up

A create or edit form sends Input, a list of cards shows Light, a detail view shows the full Model, and the totals above a list read Insight.

Document And Service

The document file turns the model shape into stored data. It defines the database-facing model and the filter shape used when the application searches or sorts records.

The service file is where business behavior lives. In this simple example, the document knows how to increase its own stock, and the service decides which product should be loaded and saved.

Service decides, document changes itself

The service loads a document from the database, the document validates and changes itself and returns itself, and the service saves it back.

What A Filter Generates

A query you declare in the document file is not one method. Akan generates fourteen from it, named after the filter key: declare byOwner and you have listByOwner, countByOwner, updateOneByOwner, and eleven more, on both the model and the service.

One filter, fourteen methods

One filter such as byOwner generates nine reads, one query descriptor for a slice, and four writes that run no hooks.

Nine of the fourteen read, one only builds a query descriptor, and the remaining four write. Those four are the ones to be careful with: each is a single atomic statement against the database, so none of the model's document hooks run:

Method

- list<Filter>: Read, no hooks. Hydrated documents, newest first; takes skip, limit, sort and select. — Example: `await listByOwner(ownerId, { limit: 20 })`

- listIds<Filter>: Read, no hooks. Just the ids; the same option, minus select. — Example: `await listIdsByOwner(ownerId)`

- find<Filter>: Read, no hooks. The newest match or null. — Example: `await findByOwner(ownerId)`

- findId<Filter>: Read, no hooks. That match's id, or null. — Example: `await findIdByOwner(ownerId)`

- pick<Filter>: Read, no hooks. Like find, but no match throws — for rows the caller knows exist. — Example: `await pickByOwner(ownerId)`

- pickId<Filter>: Read, no hooks. That id, or a throw. — Example: `await pickIdByOwner(ownerId)`

- exists<Filter>: Read, no hooks. The matching id or null — not a boolean, though it works in a condition. — Example: `if (await existsByOwner(ownerId)) …`

- count<Filter>: Read, no hooks. How many rows match. — Example: `await countByOwner(ownerId)`

- insight<Filter>: Read, no hooks. The model's Insight aggregate as a plain record, not a hydrated document. — Example: `await insightByOwner(ownerId)`

- query<Filter>: Neither. The descriptor a slice's exec returns; synchronous, never touches the database. — Example: `this.productService.queryByOwner(ownerId)`

- remove<Filter>: Write, NO hooks. One atomic soft delete over every match, reporting counts. — Example: `await removeByOwner(ownerId)`

- removeOne<Filter>: Write, NO hooks. The same on the newest match; for at-most-one rows, not queue claims. — Example: `await removeOneByOwner(ownerId)`

- update<Filter>: Write, NO hooks. A chain: the patch goes on a terminal .set(); building it does nothing. — Example: `await updateByOwner(ownerId).set({ status: "archived" })`

- updateOne<Filter>: Write, NO hooks. The same chain, narrowed to the newest match. — Example: `await updateOneByOwner(ownerId).set({ status: "archived" })`

Reach for the four writes only on a model whose removal carries no side effect. A model with a cascade, a _postRemove that deletes a stored file, or a live list watching it must be removed one document at a time through remove<Model>(id) — one atomic UPDATE cannot run any of that.

Every model already carries an any filter, so listAny and countAny exist before you declare anything.

Signal To UI

Signal is the layer that makes server behavior available to pages. A slice is useful when the page needs a list or dashboard view. An endpoint is useful when the page needs to run a specific action, such as adding product stock.

Every custom endpoint names its own guards array, and the slice names one per verb. The guards are also the MCP exposure decision: an endpoint that declares none is refused from the agent catalogue, so a missing guards array costs visibility as well as authorization.

Use it for data views such as public list, admin list, dashboard, or search result.

Use it for actions such as cancel order, approve request, send message, or complete payment.

Use it for server-side jobs such as schedules, intervals, queues, or maintenance work.

Two doors out, one job inside

A slice and an endpoint are the two doors a page can reach, each behind its guards; an internal signal runs a job inside the server and has no door at all.

Fetch And Store Instances

After signal is declared, Akan exposes app-specific client helpers from @apps/<app>/client. The two names you will see most often are fetch and st.

Use fetch when you need to call server data or pass slice metadata into Akan UI components. Use st when a client component needs to read current state or run a store action.

Generated request instance. It calls endpoints, initializes slices, loads views, and exposes fetch.slice.* metadata.

Generated client store instance. It provides st.use.* hooks for reading state and st.do.* actions for changing state.

Who calls fetch, who holds st

A server component calls fetch directly. A client component reads the store with st.use and changes it with st.do, and the store's action is what calls fetch.

Endpoint arguments are positional and in declaration order, and the call resolves to whatever the endpoint returns. addStock returns cnst.Product, so the awaited value is the product itself, not a wrapper object.

This pattern is useful when a page, action, or server-side helper needs to run a business operation. The generated fetch instance calls the server endpoint and returns the typed result.

fetch.slice.product is not the product data itself. It is slice metadata that tells Akan UI components which model slice should be viewed, edited, refreshed, or removed.

In client components, st.use.* reads the current store value and st.do.* runs the generated action. This keeps form state and business actions consistent across screens.

st is for client components. If a component uses st.use.* or st.do.*, mark it with "use client". Server pages should usually load initial data with fetch instead.

Streaming Page Data

fetch.init<Model><Suffix>, fetch.view<Model>, and fetch.edit<Model> are the three helpers a route uses to load a screen. Each returns a handle that is awaitable and destructurable at the same time: awaiting it gives the payload object, while reading a field off it gives that field's own promise.

The difference is where the page waits. An awaited call holds the whole route until the query lands, so nothing below it is sent. A promise handed to a Zone or to Load.Stream is awaited inside that component instead, behind a Suspense boundary of its own — the rest of the page is already on the wire, and each section fills in as its own data arrives.

Where the page waits

Browser

Route render

Server queries

shell HTML, one boundary per section

productInitInShop fills the product zone

orderInitInShop fills the order zone

productListInShop fills the Load.Stream

Plain list and insight data. This is the one field that may cross into a client Zone as a prop.

Hydrated model instances, which React Flight refuses as client props. Consume them in a server component or a Load.Stream.

The single-model payloads for Load.View and Load.Edit. The sibling x<Model> field is the hydrated model, so it is server-only for the same reason.

Await what the page needs immediately and stream the rest. The shell is what SEO snapshots, prerendering, and pre-hydration E2E read, so a value the first screen depends on — an auth gate, a title, an id used to build a link — belongs in an awaited call.

Common Decisions

When you are not sure where to put code, start with the business question. The data layer is easier to design when each file answers one kind of question.

Question

- What fields does it have? — model.constant.ts

- Which fields are text searchable? — model.constant.ts

- How is it stored, filtered, or searched? — model.document.ts

- What business rule should run? — model.service.ts

- What should a page call, and who may call it? — model.signal.ts

- What state is shared on the client? — model.store.ts

- What should users see? — Model.View.tsx · Model.Zone.tsx

Keep page files focused on user experience. If the rule would still matter when another page, mobile app, or admin screen uses the same feature, it usually belongs in the data layer.

## Code Examples

### apps/shop/lib/product/product.constant.ts

```ts
import { Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class ProductInput extends via((field) => ({
  name: field(String),
  imageUrl: field(String),
})) {}

export class ProductObject extends via(ProductInput, (field) => ({
  stock: field(Int, { default: 0, min: 0 }),
})) {}

export class LightProduct extends via(
  ProductObject,
  ["name", "stock"] as const,
  (resolve) => ({}),
) {}

export class Product extends via(ProductObject, LightProduct, (resolve) => ({})) {}

export class ProductInsight extends via(Product, (field) => ({})) {}
```

### apps/shop/lib/product/product.document.ts

```ts
import { by, from, into } from "akanjs/document"; // [!code collapse:9]

import * as cnst from "../cnst";

export class ProductFilter extends from(cnst.Product, (filter) => ({
  query: {},
  sort: {},
})) {}

export class Product extends by(cnst.Product) {
  addStock(count: number) {
    this.stock += count;
    return this;
  }
}
// [!code collapse:2]
export class ProductModel extends into(Product, ProductFilter, cnst.product, () => ({})) {}
```

### apps/shop/lib/product/product.service.ts

```ts
import { serve } from "akanjs/service"; // [!code collapse:4]

import * as db from "../db";

export class ProductService extends serve(db.product, ({ use, service }) => ({})) {
  async addStock(productId: string, count: number) {
    const product = await this.getProduct(productId);
    return await product.addStock(count).save();
  }
}
```

### apps/shop/lib/product/product.document.ts

```ts
export class ProductFilter extends from(cnst.Product, (filter) => ({
  query: {
    byOwner: filter()
      .arg("ownerId", ID)
      .query((ownerId) => ({ owner: ownerId })),
  },
  sort: {},
})) {}
```

### apps/shop/lib/product/product.signal.ts

```ts
import { Admin } from "@libs/shared/srvkit"; // [!code collapse:19]
import { ID, Int } from "akanjs/base";
import { endpoint, internal, Public, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class ProductInternal extends internal(srv.product, ({ interval }) => ({})) {}

export class ProductSlice extends slice(
  srv.product,
  { guards: { root: Admin, get: Public, cru: Admin } },
  (init) => ({
    inPublic: init().exec(function () {
      return this.productService.queryAny();
    }),
  }),
) {}

export class ProductEndpoint extends endpoint(srv.product, ({ query, mutation }) => ({
  addStock: mutation(cnst.Product, { guards: [Admin] })
    .param("productId", ID)
    .param("count", Int)
    .exec(function (productId, count) {
      return this.productService.addStock(productId, count);
    }),
})) {}
```

### Server action: call addStock with fetch

```ts
import { fetch } from "@apps/shop/client";

export const addProductStock = async (productId: string, count: number) => {
  return await fetch.addStock(productId, count);
};
```

### Client zone: pass fetch.slice metadata to UI components

```ts
"use client";
import { type cnst, fetch, Product } from "@apps/shop/client";
import { Load, Model } from "akanjs/ui";

export const Card = ({ init }: CardProps) => {
  return (
    <>
      <Load.Units
        init={init}
        renderItem={(product) => (
          <Model.ViewWrapper modelId={product.id} slice={fetch.slice.product} key={product.id}>
            <Product.Unit.Card product={product} />
          </Model.ViewWrapper>
        )}
      />
      <Model.ViewEditModal
        slice={fetch.slice.product}
        renderTitle={(product: cnst.Product) => product.name}
        renderView={(product: cnst.Product) => <Product.View.General product={product} />}
        renderTemplate={() => <Product.Template.General />}
      />
    </>
  );
};
```

### Client form: read and change state with st

```ts
"use client";
import { fetch, st, usePage } from "@apps/shop/client";
import { Field } from "@libs/shared/ui";

export const General = () => {
  const productForm = st.use.productForm();
  const { l } = usePage();

  return (
    <>
      <Field.Text
        label={l("product.imageUrl")}
        value={productForm.imageUrl}
        onChange={st.do.setImageUrlOnProduct}
      />
      <Field.Text
        label={l("product.name")}
        value={productForm.name}
        onChange={st.do.setNameOnProduct}
      />
    </>
  );
};
```

### Server page: hand each promise to the section that renders it

```ts
import { fetch, Order, Product, usePage } from "@apps/shop/client";
import { ID } from "akanjs/base";
import { page } from "akanjs/client";
import { Load } from "akanjs/ui";

export default page()
  .param("shopId", ID, { desc: "The shop whose products and orders to show." })
  .render(({ shopId }) => {
    const { l } = usePage();
    const { productInitInShop, productListInShop } = fetch.initProductInShop(shopId);
    const { orderInitInShop } = fetch.initOrderInShop(shopId, { insight: false });

    return (
      <div className="space-y-4">
        <h1 className="font-bold text-3xl">{l("shop.modelName")}</h1>
        <Product.Zone.Card init={productInitInShop} />
        <Order.Zone.Card init={orderInitInShop} />
        <Load.Stream of={productListInShop}>
          {(productList) => <Product.Unit.Total count={productList.length} />}
        </Load.Stream>
      </div>
    );
  });
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

