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
- Signal To UI (#signal-to-ui)
- Fetch And Store Instances (#fetch-and-st)
- Common Decisions (#common-decisions)

## Content

Data Layer

The data layer is the path from business data definition to server logic and screen usage. If you are building products, orders, users, reservations, or invoices, this is where the business shape becomes real application behavior.

Akan keeps this flow close to the model folder. For example, a product feature can define what a product is, how it is stored, how stock and price rules work, and how pages load product data from one module.

What data exists

How data is stored

What the business does

What pages can call

How client state is kept

How users see the data

You do not need every layer on day one. A simple read-only feature may start with constant and document, then add service or signal when the business behavior grows.

Model Shape

The constant file is the design sheet of a business object. It answers questions such as: What fields does a product have? Which values are allowed? Which fields should be shown in a lightweight list?

In the product example, the model keeps catalog information such as name, description, image URL, price, stock, and sale status. This is the shared source that the server and client can both understand.

Fields that can be submitted when creating or updating data.

The base object shape used to build other model views.

A smaller view for lists, cards, and embedded references.

Document And Service

The document file turns the model shape into stored data. It defines the database-facing model and the filter shape used when the application searches or sorts records.

The service file is where business behavior lives. In this simple example, the document knows how to increase its own stock, and the service decides which product should be loaded and saved.

Signal To UI

Signal is the layer that makes server behavior available to pages. A slice is useful when the page needs a list or dashboard view. An endpoint is useful when the page needs to run a specific action, such as adding product stock.

Use it for data views such as public list, admin list, dashboard, or search result.

Use it for actions such as cancel order, approve request, send message, or complete payment.

Use it for server-side jobs such as schedules, intervals, queues, or maintenance work.

Fetch And Store Instances

After signal is declared, Akan exposes app-specific client helpers from @apps/<app>/client. The two names you will see most often are fetch and st.

Use fetch when you need to call server data or pass slice metadata into Akan UI components. Use st when a client component needs to read current state or run a store action.

Generated request instance. It calls endpoints, initializes slices, loads views, and exposes fetch.slice.* metadata.

Generated client store instance. It provides st.use.* hooks for reading state and st.do.* actions for changing state.

This pattern is useful when a page, action, or server-side helper needs to run a business operation. The generated fetch instance calls the server endpoint and returns the typed result.

fetch.slice.product is not the product data itself. It is slice metadata that tells Akan UI components which model slice should be viewed, edited, refreshed, or removed.

In client components, st.use.* reads the current store value and st.do.* runs the generated action. This keeps form state and business actions consistent across screens.

st is for client components. If a component uses st.use.* or st.do.*, mark it with "use client". Server pages should usually load initial data with fetch instead.

Common Decisions

When you are not sure where to put code, start with the business question. The data layer is easier to design when each file answers one kind of question.

What fields does it have?

Which fields are text searchable?

How is it stored or searched?

What business rule should run?

What should a page call?

What should users see?

What state is shared on the client?

Keep page files focused on user experience. If the rule would still matter when another page, mobile app, or admin screen uses the same feature, it usually belongs in the data layer.

## Code Examples

### apps/shop/lib/product/product.constant.ts

```ts
import { enumOf, Int } from "akanjs/base";
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

### apps/shop/lib/product/product.signal.ts

```ts
import { Admin } from "@libs/shared/srvkit"; // [!code collapse:17]
import { endpoint, internal, Public, slice } from "akanjs/signal";

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
  addStock: mutation()
    .param("productId", String)
    .param("count", Int)
    .exec(function (productId, count) {
      return this.productService.addStock(productId, count);
    }),
})) {}
```

### Server action: call addStock with fetch

```ts
import { fetch } from "@apps/shop/client";

export const addProductStock = async (productId: string, quantity: number) => {
  const { product } = await fetch.addStock({
    productId,
    quantity,
  });

  return product;
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

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

