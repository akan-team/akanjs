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

A scalar dictionary gives a scalar its labels in every language: the scalar's name, each field, and each enum value. Open it whenever you add a field or an enum value to the scalar's constant.

Words used on this page

Term

- label: The name a person reads, one string per language: `t(["Amount", "금액"])`.

- .desc(): A one-sentence explanation chained after a label.

- language tuple: One string per language, in the order `scalarDictionary(["en", "ko"])` lists them.

- key: The dotted path code reads a label by, such as `price.amount`.

Smaller than a module dictionary

A scalar is a value embedded in a model, so it has no list or API of its own to label. `scalarDictionary` therefore has no query, sort, slice, or endpoint stage at all.

Stage

model — modelDictionary

scalar — scalarDictionary

service — serviceDictionary

- What a scalar labels

  - .of(): The name of the scalar or model itself.

  - .model(): One label per field of the constant.

  - .enum(): One label per value of an `enumOf()` enum.

- Messages every kind has

  - .error(): Error messages thrown with `new Err()`.

  - .translate(): Any other short text.

- Only for a stored list or an API

  - .insight(): Summary numbers of a list, such as its count.

  - .query() · .sort(): The filters and sort orders of a list.

  - .slice(): The data views a client store loads.

  - .endpoint(): Signal endpoints and their arguments.

has this stage

no such stage

**Pick the builder by module kind.** `modelDictionary` for `lib/<model>`, `scalarDictionary` for `lib/__scalar/<scalar>`, `serviceDictionary` for `lib/_<service>`.

Basic Pattern

Start from `scalarDictionary(["en", "ko"])` and chain one stage per kind of label. A scalar with one enum and one extra phrase looks like this:

**Export one const named `dictionary`.** Every model, scalar and service dictionary in the workspace uses this name.

**Import the constant with `import type`.** The dictionary uses the constant only as type arguments, so a type-only import is all it needs.

**Give every label a `.desc()`, even one that repeats it.** English labels are Title Case; Korean labels are the plain domain term.

**No enum and no extra text? Stop after `.model()`.** `libs/shared/lib/__scalar/restrictInfo/restrictInfo.dictionary.ts` is exactly `.of()` and `.model()`.

Builder Order

Write the stages in this order and skip the ones you have nothing for. Each stage fills one set of keys that components read with `l()`.

- .of(): The scalar itself: its name and its description.

- .model<Price>(): Every field of the constant, and leaving one out is a type error.

- .enum<Currency>("currency"): Every value of one enum, under the enum's own name.

- .error({}): Error messages thrown with `new Err()`, rarely needed in a scalar. — Example: `new Err("price.error.<key>")`

- .translate({}): Any other short text that belongs to the scalar. — Example: `l("price.free")`

**The order is a convention, not a check.** Every stage returns the same builder, so any order compiles. Keep this one so a reader finds each stage where they expect it.

**Enum labels live under the enum's name.** Read `l("currency.KRW")`, not `l("price.currency.KRW")`. The latter is not a key, so it fails to typecheck.

**Some labels show up with no code of yours.** The `Constant.Doc` model explorer shows the `.of()` description and each field's `.desc()`.

Language Order

The array passed to `scalarDictionary()` sets the order of every language tuple in the file. With `["en", "ko"]`, write English first and Korean second, everywhere:

Each position in a tuple belongs to one language:

Language

- "en": First in every tuple: `"Price"` and `"Price value"`.

- "ko": Second in every tuple: `"가격"` and `"가격 값"`.

**Every dictionary here uses `["en", "ko"]`.** Model, scalar and service dictionaries in this workspace all put English first.

**A swapped tuple is not an error.** Both entries are strings, so `["가격", "Price"]` compiles and shows Korean on the English page.

**A language you did not write falls back.** A locale missing from the array reads the app's default locale, then the bare key. With no argument, `scalarDictionary()` is English only.

Enum Name Matching

An enum the constant declares with `enumOf()` gets its labels from `.enum()`, and the two names must match exactly. Here the constant declares `currency` and uses it for a field:

The dictionary labels it under the same name, with the enum class as the type argument:

One name, four places

Where

- enumOf("currency", …): Declares the enum and its name in `price.constant.ts`.

- .enum<Currency>("currency", …): Labels every value under the same name in `price.dictionary.ts`.

- l("currency.KRW"): Reads the label of one value in a component.

- items={cnst.Currency}: `Field.ToggleSelect` labels its buttons from the same keys, with no extra code.

**One `.enum()` call per enum.** `apps/akan/lib/__scalar/docPage/docPage.dictionary.ts` chains two, for `docSection` and `docPriority`.

**Always pass the enum class as the type argument.** With `.enum<Currency>("currency", …)`, a misspelled name or a missing value is a type error. Without it, a misspelled name compiles, the labels land under it, and the screen shows `currency.KRW` as is.

Small Custom Text

`.translate()` holds short text that belongs to the scalar itself. Text that belongs to a page or an action stays in the parent module's dictionary. Add each phrase as a key and a language tuple:

Components read it by the scalar's name, the same way as a field label:

**Keys sit beside the field labels.** `free` is read as `price.free`, just like `price.amount`.

**Pick a key no field uses.** `.translate({ amount: … })` would replace the `amount` field label, because both are `price.amount`.

**Reading a label adds no client boundary.** `usePage()` works in a server component, so `PriceLabel` needs no `"use client"`.

## Code Examples

### apps/myapp/lib/__scalar/price/price.dictionary.ts

```ts
import { scalarDictionary } from "akanjs/dictionary";

import type { Currency, Price } from "./price.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Price", "가격"]).desc(["Price value", "가격 값"]))
  .model<Price>((t) => ({
    amount: t(["Amount", "금액"]).desc(["Price amount", "가격 금액"]),
    currency: t(["Currency", "통화"]).desc(["Currency code", "통화 코드"]),
  }))
  .enum<Currency>("currency", (t) => ({
    KRW: t(["KRW", "원"]).desc(["Korean won", "한국 원"]),
    USD: t(["USD", "달러"]).desc(["US dollar", "미국 달러"]),
  }))
  .translate({
    free: ["Free", "무료"],
  });
```

### .of()

```ts
l("price.modelName")
l("price.modelDesc")
```

### .model<Price>()

```ts
l("price.amount")
l("price.amount.desc")
```

### .enum<Currency>("currency")

```ts
l("currency.KRW")
l("currency.KRW.desc")
```

### apps/myapp/lib/__scalar/price/price.dictionary.ts

```ts
export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Price", "가격"]).desc(["Price value", "가격 값"]));
```

### apps/myapp/lib/__scalar/price/price.constant.ts

```ts
import { enumOf, Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Currency extends enumOf("currency", ["KRW", "USD"] as const) {}

export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(Currency, { default: "KRW" }),
})) {}
```

### apps/myapp/lib/__scalar/price/price.dictionary.ts

```ts
import { scalarDictionary } from "akanjs/dictionary";

import type { Currency } from "./price.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .enum<Currency>("currency", (t) => ({
    KRW: t(["KRW", "원"]).desc(["Korean won", "한국 원"]),
    USD: t(["USD", "달러"]).desc(["US dollar", "미국 달러"]),
  }));
```

### apps/myapp/lib/__scalar/price/price.dictionary.ts

```ts
export const dictionary = scalarDictionary(["en", "ko"])
  .translate({
    free: ["Free", "무료"],
  });
```

### apps/myapp/ui/PriceLabel.tsx

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

