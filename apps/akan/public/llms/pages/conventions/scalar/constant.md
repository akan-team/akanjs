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

A scalar constant declares the shape of a small value that other models embed, such as a price or an address. You open it when that value gains, loses or changes a field.

Keep it simple enough to read without opening a service, signal or store. Most need only `via()`, `field()`, a few defaults and optional fields, and sometimes one small enum.

Words used on this page

Term

- scalar: A small value object saved inside another model, such as a price, an address or a coordinate.

- parent model: The model that embeds the scalar, such as a `Product` holding a `Price`.

- via(): Turns a list of fields into a class, imported from `akanjs/constant`.

- field(Type): Declares one value and its type, plus options such as a default.

- enumOf(): Declares a fixed list of allowed values, imported from `akanjs/base`.

One class, not five

A module constant declares five classes because its model keeps records of its own. A scalar keeps none, so its file is one class plus its enums:

- model.constant.ts — lib/<model>/<model>.constant.ts

  - Five classes: `XInput → XObject → LightX → X → XInsight`.

  - Gets the base fields `id`, `createdAt`, `updatedAt` and `removedAt`.

  - Saved as a record of its own.

- scalar.constant.ts — lib/__scalar/<scalar>/<scalar>.constant.ts

  - One `via()` class, plus its enums.

  - No base fields at all.

  - Saved as part of the parent model's record.

Basic Shape

Pass `via()` a function that returns one `field(Type)` per value, then extend the result as an exported class:

**The class is the folder name in PascalCase.** `__scalar/price/` exports `Price`, and `__scalar/contactInfo/` exports `ContactInfo`.

**Name the value, not the model that uses it.** `Price` fits a product, an order and an invoice alike; `ProductPrice` would tie it to one of them.

**`via` comes from `akanjs/constant`; `Int`, `Float`, `ID`, `Any` and `enumOf` from `akanjs/base`.** `String`, `Boolean` and `Date` are globals and need no import.

Field types

Pick the type by what the value is. The last two rows are classes from your own code:

Type

Use for

- String, Boolean, Date: Text, true or false, and a point in time.

- Int: Whole numbers such as counts and quantities.

- Float: Numbers with decimals, such as an amount or a longitude.

- ID: The id of another record, such as `fileId`.

- Any: A truly open payload, for when explicit fields cannot describe it.

- Map: String keys to values, with the value type named in a required `{ of: String }`.

- Currency: An `enumOf()` class from the same file: one of a fixed set of values.

- Coordinate: Another scalar, imported from its own constant and nested as a value.

**`Number` and `Binary` are not field types.** Write numbers as `Int` or `Float`, because `field(Number)` does not typecheck. Bytes cannot be stored in a field, so reference the `File` model instead.

Defaults And Optional Fields

Give a field a default when it needs a sensible starting value. Mark it `.optional()` when the parent model is complete without it:

**`currency` defaults to an everyday value, `"KRW"`,** so a new price starts filled in.

**`memo` is optional** because not every price needs a note.

What a new value starts as

A field with neither a default nor `.optional()` is required. How you write a field decides what a new value starts as and whether the parent model saves with it empty:

- field(String) (default ""): Required, so the parent model's form will not save while it is empty.

- field(Float) (default 0): Required, but `0` counts as a value and saves, and `field(Int)` works the same way.

- field(Boolean) (default false): Required, but `false` counts as a value and saves.

- field(String, { default: "KRW" }) (default "KRW"): Required, but it starts filled, and clearing it blocks the save.

- field(String).optional() (default null): Optional, and an empty string is saved as `null`.

- field([String]) (default []): An empty list is valid, so it saves.

**A literal for a plain value, a function for anything built.** Write `default: 0` as is, but `default: () => dayjs()` for a date, so each new value gets its own time.

**`default: ""` makes a String field optional too.** `note: field(String, { default: "" })` accepts an empty note.

Array Fields

Wrap the type in brackets when the value naturally holds a repeated item. A small example: a contact can have several emails, so `emails` is `field([String])`:

**An array starts as `[]`.** A new `ContactInfo` has an empty `emails` list, never `null`.

**Any field type can be an array** — `[Int]`, an enum such as `[Currency]`, or another scalar such as `[Coordinate]`.

**Bound the count with `minlength` and `maxlength`.** On an array they limit how many items the parent model's form may save.

**Need several of the scalar itself? Put the array on the parent.** The parent model writes `contacts: field([ContactInfo])`, and the scalar stays one contact.

Enum Fields

Use `enumOf()` when a field may hold only one of a fixed set of values. Declare the enum in the same file, above the scalar:

**Name the enum after its class, in camelCase.** `Currency` is `"currency"`, and `LeaveType` in `libs/shared` is `"leaveType"`.

**The dictionary repeats that name.** `price.dictionary.ts` labels the values in `.enum<Currency>("currency", …)`, where a different string is a type error.

**Keep it short, stable and unique.** Components read labels as `l("currency.KRW")`, so renaming it breaks them, and no other model or enum should share it.

**End the value list with `as const`.** Without it every value widens to `string`, and `default: "KRW"` is no longer checked against the list.

Small Helpers

A small method can live on the class when the behavior belongs to the value itself. Keep it pure: no server request, no database call, no external service.

The whole file, with the enum and one helper:

**An instance method reads one value.** A scalar inside a model instance is built as its class, so `product.price.isFree()` works.

**A `static` method works across several values.** `Coordinate.getDistanceKm(a, b)` in `libs/util` measures between two coordinates.

What a constant file cannot contain

The same file runs on the server and in the browser, so lint holds it to the rules of both:

Not allowed

Why, and what to write

- import dayjs from "dayjs": A third-party package, so import a re-export instead, such as `dayjs` from `akanjs/base`.

- *.service.ts, *.document.ts, srvkit/, db: Server-only code, whose work belongs in the service.

- *.store.ts, ui/, st: Client-only code, whose work belongs in the store and components.

- #private: Not allowed in a constant file, so write a TypeScript `private` method instead.

- //!: The comment ships to the browser inside the bundle, so write `// FIXME:` instead.

Read next

- scalar.dictionary.ts — Label every field and enum value you declared here.

- Every field option — `min`, `max`, `example`, `validate` and the rest, in the `akanjs/constant` reference.

- Scalar Overview — When a value should be a scalar and when a model of its own.

- model.constant.ts — The five-class constant a stored model uses.

## Code Examples

### apps/myapp/lib/__scalar/price/price.constant.ts

```ts
import { Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Price extends via((field) => ({
  amount: field(Float),
  currency: field(String),
})) {}
```

### apps/myapp/lib/__scalar/price/price.constant.ts

```ts
import { Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(String, { default: "KRW" }),
  memo: field(String).optional(),
})) {}
```

### apps/myapp/lib/__scalar/contactInfo/contactInfo.constant.ts

```ts
import { via } from "akanjs/constant";

export class ContactInfo extends via((field) => ({
  name: field(String),
  emails: field([String]),
})) {}
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

### apps/myapp/lib/__scalar/price/price.constant.ts

```ts
import { enumOf, Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Currency extends enumOf("currency", ["KRW", "USD"] as const) {}

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

