# scalar.dictionary.ts

- Source: /conventions/scalar/dictionary
- Mirror: /llms/pages/conventions/scalar/dictionary.md
- Section: conventions
- Category: Scalar
- Priority: P1

## Headings

- scalar.dictionary.ts (#dictionary-overview)
- Basic Pattern (#basic-pattern)
- Builder Order (#builder-order)
- Language Order (#language-order)
- Enum Name Matching (#enum-matching)
- Small Custom Text (#custom-text)

## Content

scalar.dictionary.ts

A scalar dictionary gives translated labels to a scalar value. It normally describes the scalar name, field labels, and enum values.

Keep it smaller than a module dictionary. A scalar usually does not have query, sort, slice, endpoint, or signal labels.

Basic Pattern

Start with `scalarDictionary(["en", "ko"])`. Then add the scalar name with `.of()`, field labels with `.model()`, and enum labels with `.enum()` when the scalar has an enum.

Builder Order

names the scalar itself.

labels each field from the scalar constant.

labels enum values only when the scalar has an enum.

adds small scalar-specific text only when needed.

Language Order

The language array controls every translation tuple. If the dictionary starts with `["en", "ko"]`, write English first and Korean second everywhere.

Enum Name Matching

When a scalar constant uses `enumOf()`, the dictionary `.enum()` name must match the `enumOf()` name exactly.

Small Custom Text

Use `.translate()` only for short text that belongs to the scalar itself. If the text belongs to a page or action, keep it in the parent module dictionary.

## Code Examples

### price.dictionary.ts

```ts
import { scalarDictionary } from "akanjs/dictionary";

import type { Price } from "./price.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Price", "가격"]).desc(["Price value", "가격 값"]))
  .model<Price>((t) => ({
    amount: t(["Amount", "금액"]).desc(["Price amount", "가격 금액"]),
    currency: t(["Currency", "통화"]).desc(["Currency code", "통화 코드"]),
  }));
```

### language order

```ts
export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Price", "가격"]).desc(["Price value", "가격 값"]));
```

### price.constant.ts

```ts
export class Currency extends enumOf("currency", ["KRW", "USD"] as const) {}
```

### price.dictionary.ts

```ts
export const dictionary = scalarDictionary(["en", "ko"])
  .enum<Currency>("currency", (t) => ({
    KRW: t(["KRW", "원"]).desc(["Korean won", "한국 원"]),
    USD: t(["USD", "달러"]).desc(["US dollar", "미국 달러"]),
  }));
```

### price.dictionary.ts

```ts
export const dictionary = scalarDictionary(["en", "ko"])
  .translate({
    free: ["Free", "무료"],
  });
```

### PriceLabel.tsx

```ts
import { usePage } from "@apps/myapp/client";

export const PriceLabel = () => {
  const { l } = usePage();

  return (
    <div>
      <div>{l("price.amount")}</div>
      <div>{l("price.free")}</div>
    </div>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

