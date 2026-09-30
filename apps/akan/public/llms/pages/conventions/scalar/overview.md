# Overview

- Source: /conventions/scalar/overview
- Mirror: /llms/pages/conventions/scalar/overview.md
- Section: conventions
- Category: Scalar
- Priority: P1

## Headings

- Scalar Overview (#scalar-overview)
- When To Use A Scalar (#when-to-use)
- Scalar Files (#file-map)
- Small Example (#small-example)

## Content

Overview

Scalar Overview

A scalar is a small, named group of fields that lives inside other models. Define it once, then embed it wherever the same fields repeat.

For example, a product, an order and an invoice all need a price. Instead of writing `amount` and `currency` three times, define a `Price` scalar once and embed it in all three.

Words used on this page

Term

- value object: A value defined only by its fields, like a price or an address, with no `id` of its own.

- embed: Putting a scalar inside another model as a field, so it is saved with that model.

- parent model: The model that holds the scalar, such as `Product` holding a `Price`.

- database module: A model with its own table, service, endpoints and screens, under `lib/<model>/`.

When To Use A Scalar

Ask whether the value only exists inside another record. If it does, it is a scalar; if it needs its own list, permissions or lifecycle, it is a database module.

When the value…

Scalar — lib/__scalar/

Database module — lib/<model>/

- A scalar fits

  - lives inside another record: Saved and loaded with its parent, with no `id` or `createdAt` of its own.

  - the same fields repeat: One group of fields appears in several models, like a price in products and orders.

  - an endpoint's input or result: A shape with no table behind it, like the `DocPage` list this docs app returns.

- It needs a database module

  - its own list page: People browse, search or page through the records.

  - its own permissions: Guards decide who may read or change each record.

  - its own service methods: Business operations such as `approve()` or `cancel()` run on it.

  - an independent lifecycle: It is created and removed on its own, not together with a parent.

Use this one

Not this one

Good Scalars

`Coordinate` in `libs/util` and `FileMeta` in `libs/shared` are real ones you can open.

Good Database Modules

Each has its own list, permissions and lifecycle, so each gets its own module.

Embedding looks like any other field. Import the scalar class and pass it to `field()`:

**Import by relative path.** A constant file may import another module's constant directly, as in `../__scalar/price/price.constant`.

**No default needed.** `field(Price)` starts filled with the defaults declared in `Price`.

**Lists and empty values work as usual.** `field([Price])` holds several, and `field(Price).optional()` starts as `null`.

**A scalar can hold another scalar.** `AccessLog` in `libs/util` embeds a `Coordinate` as its `location`.

Scalar Files

Each scalar is one folder, `lib/__scalar/<scalarName>/`. `akan create-scalar price` writes the four core files; add UI files only when the value needs reusable UI.

The four core files

File

- price.abstract.md: What the value means, its validation intent and reuse rules, plus notes for agents.

- price.constant.ts: One class with the fields, any enums, and helper methods both server and client can call.

- price.dictionary.ts: A label and a description for every field and enum value, written with `scalarDictionary`.

- price.document.ts: The server-side class, usually just `by(cnst.Price)`, while helpers live on the constant.

Optional UI files

- Price.Template.tsx: A client editor for the value inside a parent form, starting with "use client".

- Price.Unit.tsx: A server component that shows the value inside a parent card or detail page.

**No service, signal or store.** A scalar has no endpoint or client state of its own; the parent module loads and saves it.

**No View, Zone or Util.** Template and Unit are the only UI roles a scalar has.

**Keep all three .ts files.** The document stays beside the constant and dictionary even when it is only `by(cnst.Price)`.

Small Example

A scalar should make sense on its own. It defines only the value's shape; the parent module decides how to save, load and render it.

The constant is one class. `amount` uses `Float` because money has decimals:

The dictionary labels each field, and the document wraps the constant for the server:

Common mistakes

**Writing `Number`.** It is not a field type. Use `Float` for decimals and `Int` for counts.

**Giving a scalar a life of its own.** If it needs a list page, endpoints or its own permissions, make it a database module instead.

**Writing five classes.** A scalar is one `via((field) => ({ … }))` class, not the Input, Object, Light, full and Insight set a database model has.

## Code Examples

### apps/<app>/lib/product/product.constant.ts

```ts
import { via } from "akanjs/constant";
import { Price } from "../__scalar/price/price.constant";

export class ProductInput extends via((field) => ({
  name: field(String),
  price: field(Price),
})) {}
```

### apps/<app>/lib/

```bash
lib/
└── __scalar/
    └── price/
        ├── price.abstract.md
        ├── price.constant.ts
        ├── price.dictionary.ts
        ├── price.document.ts
        ├── Price.Template.tsx
        └── Price.Unit.tsx
```

### apps/<app>/lib/__scalar/price/price.constant.ts

```ts
import { Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(String, { default: "KRW" }),
})) {}
```

### apps/<app>/lib/__scalar/price/price.dictionary.ts · price.document.ts

```ts
// price.dictionary.ts
import { scalarDictionary } from "akanjs/dictionary";

import type { Price } from "./price.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Price", "가격"]).desc(["Amount and currency", "금액과 통화"]))
  .model<Price>((t) => ({
    amount: t(["Amount", "금액"]).desc(["Amount of money", "금액"]),
    currency: t(["Currency", "통화"]).desc(["Currency code", "통화 코드"]),
  }));

// price.document.ts
import { by } from "akanjs/document";

import * as cnst from "./price.constant";

export class Price extends by(cnst.Price) {}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

