# scalar.constant.ts

- Source: /conventions/scalar/constant
- Mirror: /llms/pages/conventions/scalar/constant.md
- Section: conventions
- Category: Scalar
- Priority: P1

## Headings

- scalar.constant.ts (#constant-overview)
- Basic Shape (#basic-shape)
- Defaults And Optional Fields (#defaults-optional)
- Array Fields (#arrays)
- Enum Fields (#enum-fields)
- Small Helpers (#helper-methods)

## Content

scalar.constant.ts

A scalar constant defines the shape of a small reusable value. It should be simple enough to understand without reading a service, signal, or store file.

Most scalar constants need only `via()`, `field()`, optional defaults, and sometimes a small enum.

Basic Shape

Use `via((field) => ({ ... }))` and describe each value with `field(Type)`. The class name should describe the business value, not the parent model that happens to use it.

Defaults And Optional Fields

Add defaults when a value should have a stable initial state. Use `.optional()` when the parent model can exist without that field.

`currency` can default to a normal business value such as `KRW`.

`memo` can be optional because not every price needs a note.

Array Fields

Use an array field when the scalar naturally contains a repeated value. Keep the example small: a contact info value may have several emails.

Enum Fields

Use `enumOf()` when a field should only allow a fixed set of values. The enum name string is also used by the dictionary file, so keep it short and stable.

Small Helpers

A constant may include a small pure helper when the behavior belongs to the value itself. Keep it independent from server requests, database calls, and external services.

## Code Examples

### price.constant.ts

```ts
import { Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Price extends via((field) => ({
  amount: field(Float),
  currency: field(String),
})) {}
```

### price.constant.ts

```ts
export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(String, { default: "KRW" }),
  memo: field(String).optional(),
})) {}
```

### contactInfo.constant.ts

```ts
import { via } from "akanjs/constant";

export class ContactInfo extends via((field) => ({
  name: field(String),
  emails: field([String]),
})) {}
```

### price.constant.ts

```ts
import { enumOf, Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Currency extends enumOf("currency", ["KRW", "USD"] as const) {}

export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(Currency, { default: "KRW" }),
})) {}
```

### price.constant.ts

```ts
export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(Currency, { default: "KRW" }),
})) {
  isFree() {
    return this.amount === 0;
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

