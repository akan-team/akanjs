# Overview

- Source: /conventions/scalar/overview
- Mirror: /llms/pages/conventions/scalar/overview.md
- Section: conventions
- Category: Scalar
- Priority: P1

## Headings

- Scalar Overview (#scalar-overview)
- When To Use Scalar (#when-to-use)
- Scalar Files (#file-map)
- Small Example (#small-example)

## Content

Overview

Scalar Overview

A scalar is a small reusable value object. Use it when the same group of fields appears inside multiple domain models.

For example, a product, order, and invoice may all need a price value. Instead of rewriting `amount` and `currency` every time, define a `Price` scalar once and embed it wherever it is needed.

When To Use Scalar

Use a scalar when the value is stored as part of another model. Use a normal module model when the data needs its own list page, permissions, service methods, or independent lifecycle.

Good scalar examples: Price, Address, ContactInfo, Coordinate, FileMeta.

Good module model examples: Product, Order, User, Post, Ticket.

Scalar Files

Scalar files live under `lib/__scalar/<scalarName>`. Start with abstract, constant, dictionary, and document files. Add Template or Unit files only when the scalar needs reusable UI.

explains value meaning, validation intent, reuse rules, and agent notes.

defines the scalar fields and enum values.

adds labels and descriptions for the scalar fields.

optionally adds small value helper methods.

renders a reusable editor for the scalar inside a parent form.

renders a reusable display for the scalar inside a parent card or detail page.

Small Example

A scalar should be easy to understand on its own. The example below defines only the value shape; the parent module decides how to save, load, and render it.

## Code Examples

### product.constant.ts

```ts
import { via } from "akanjs/constant";
import { Price } from "../__scalar/price/price.constant";

export class ProductInput extends via((field) => ({
  name: field(String),
  price: field(Price),
})) {}
```

### Code

```bash
lib/
└── __scalar/
    └── price/
        ├── price.abstract.md
        ├── price.constant.ts
        ├── price.dictionary.ts
        ├── price.document.ts
        ├── price.Template.tsx
        └── price.Unit.tsx
```

### price.constant.ts

```ts
import { Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(String, { default: "KRW" }),
})) {}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

