# akanjs/constant

- Source: /references/akanjs/constant
- Mirror: /llms/pages/references/akanjs/constant.md
- Section: references
- Category: AkanJS Reference
- Priority: P0

## Headings

- akanjs/constant (#akanjs-constant)
- via (#via)
- field (#field)
- field.visual / field.hidden / field.secret (#field.visual / field.hidden / field.secret)
- resolve (#resolve)
- getDefault (#getDefault)
- DocumentModel / DefaultOf / QueryOf (#DocumentModel / DefaultOf / QueryOf)
- crystalize / purify (#crystalize / purify)
- serialize / deserialize (#serialize / deserialize)
- ConstantRegistry (#ConstantRegistry)

## Content

akanjs/constant

`akanjs/constant` is Akan's schema layer. Every `.constant.ts` file is built from two of its exports: `via`, which declares a class, and `field`, the builder `via` hands you.

Everything else supports those two. From `getDefault` on, the entries are helpers you mostly read rather than call.

Export

- via: Declares every constant class. What you pass decides which class it is.

- field: The builder `via` hands you. Each call declares one stored field.

- field.visual, field.hidden, field.secret: Variants of `field` that keep a value away from agents, the client, or default reads.

- resolve: Declares a field the server computes for each response instead of storing it.

- getDefault: Builds the blank object a new record or form starts from.

- DocumentModel, DefaultOf, QueryOf, PurifiedModel, ProtoFile, ProtoLightFile: Types for the stored shape, the default shape, a query, a purified value, and a file.

- crystalize, makePurify: Turn raw data into model values, and a model back into a checked plain object.

- serialize, deserialize: Convert values to and from the payload that crosses a boundary.

- ConstantRegistry: Finds model classes, refNames and enums at runtime.

Words Used on This Page

Term

- refName: The camelCase name a module is registered under, such as `banner`.

- scalar: A value object with no table of its own. Other documents embed it whole.

- relation: A field whose type is another database model. It stores that document's id.

- projection: A read option that names the fields to load, such as `{ password: true }`.

The Five Classes of a Module

A database module declares these five classes, always in this order. The banner module is the example throughout this page:

Class

- BannerInput: The fields a caller sends to create or update a banner.

- BannerObject: The Input plus fields the server keeps, and `id`, `createdAt`, `updatedAt`, `removedAt`.

- LightBanner: Only the fields a list needs. Display and predicate methods live here.

- Banner: The full model: every field, plus the ones `resolve` computes.

- BannerInsight: Numbers about a whole list. It starts with `count` and is written even when empty.

**The order is fixed.** `enumOf` classes go on top, then Input, Object, Light, full and Insight. Write the Insight class even when it is empty.

**Shared logic goes on Light.** The server and the client both hold the Light class, so `isNew()` or `canWrite(user)` belongs there, not in a util module.

**A scalar is a single class.** `via((field) => ({ … }))` alone declares it. It lives under `lib/__scalar/<name>/`.

via

`via` is one overloaded function, not a namespace: there is no `via.model` or `via.scalar`. What you pass decides which class you get.

Arguments

Declares

- (field) => ({ … }) — `BannerInput`, or a scalar. A lone builder callback is either one.

- BannerInput, (field) => ({ … }) — `BannerObject`: the Input's fields plus the ones you add.

- BannerObject, ["title", …] as const, (resolve) => ({ … }) — `LightBanner`: only the named fields, plus any `resolve` fields.

- BannerObject, LightBanner, (resolve) => ({ … }) — `Banner`: Object and Light merged, plus any `resolve` fields.

- Banner, (field) => ({ … }) — `BannerInsight`: `count` plus the fields you add.

The banner module from `libs/shared`, shortened:

**The callback's parameter names the builder.** Input, Object and Insight get `field`. Light and full get `resolve`, because they only add computed fields.

**Write the Light tuple `as const`.** The field names Light picks are always a literal tuple.

**Pass a lib's class last to extend it.** Every form takes more classes after its own arguments, so an app adds fields to a lib's model by passing the lib's class at the end.

field

`field` is the builder `via` hands to Input, Object and Insight callbacks. Each call declares one stored field: the type first, the options second.

Types

Write

- field(String) — One value: `String`, `Boolean`, `Date`, `ID`, `Int`, `Float` or `Any`.

- field([String]) — An array. Brackets nest up to three deep, as in `[[Float]]`.

- field(File) — A relation to another model's document, stored as its id.

- field(Coordinate) — A scalar, embedded whole inside this document.

- field(ProductStatus) — An enum class declared with `enumOf`.

- field(Map, { of: String }) — A map with string keys. `of` names the value type and is required.

- field<T>(Any) — An open value. The type argument keeps it typed in TypeScript.

**A number is `Int` or `Float`.** `field(Number)` does not typecheck.

**Bytes are never a field.** `Binary` and `Upload` belong to signals; store a file as `field(File)`.

A product input that uses most of them:

Options

The second argument is an options object. `nullable`, `select`, `enum` and `meta` are not options: `.optional()`, `field.secret`, the `enumOf` type and `.meta()` set them.

Value and Checks

- default (T | ((doc: { id: string }) => T)): The starting value. A function runs again for every record.

- validate ((value, model) => boolean): Your own check, run by `purify` and on every document save. `false` rejects the value.

- immutable (boolean, default false): Changing it in a document save throws. Query-level writes skip the check.

- of: The value type of a `Map` field, such as `String` or a scalar. Required for `Map`.

- visual (boolean, default false): The same as declaring it with `field.visual`.

- accumulate (query object): Insight fields only: the condition this counter counts. `{}` counts every match.

Search and Relations

- text ("title" | "desc" | "tag" | "thumb" | "filter"): Adds the field to full-text search in that role. `thumb` is kept for display, never matched.

- cascade ("removeRef" | "removeWith" | "removeWithAny"): Removes related documents together. The value says which side follows which.

- ref (string): The refName an `ID` field points at, as in `{ ref: "org", cascade: "removeWith" }`.

- refPath (string): The field naming which model the id points at: an `enumOf`, or a `String` with `removeWithAny`.

**`text` needs a string.** `title`, `desc` and `tag` take `String`; `thumb` and `filter` also take an `ID` or a relation. A `Map` or a nested array takes no role.

**`cascade` names a direction.** `removeRef` goes on the owner's relation, `removeWith` on the child's reference to its owner. The wrong one removes the wrong documents.

Docs and Samples Only

These describe the field for the schema docs, the API explorer and `sampleOf()`. Nothing enforces them, so put a rule that must hold in `validate`.

- min (number): A lower bound shown in the schema docs. `sampleOf()` uses it as the sample.

- max (number): An upper bound, used the same way as `min`.

- minlength (number): A shortest length for the schema docs. On an array, `purify` does check the item count.

- maxlength (number): A longest length, handled the same way as `minlength`.

- type ("email" | "password" | "url"): Makes `sampleOf()` produce a realistic email, password or URL.

- example (T): A sample value for the schema docs and the API explorer's example requests.

- refType ("child" | "parent" | "relation"): A label the schema docs show on a relation.

Chained Methods

Method

- .optional(): Allows `null`. Without a `default`, the field starts at `null`.

- .meta(obj): Attaches free-form metadata. A summary counter uses it to name the list it counts. — Example: `field(Int, { default: 0 }).meta(getQueryMeta<UserFilter>("user").query("byStatuses").args([["active"]]))`

**Give a per-record default as a function.** `default: dayjs()` freezes the moment the module loaded, and a literal `{}` is one object every record shares. Write `() => dayjs()` and `() => ({})`.

field.visual / field.hidden / field.secret

Three variants of `field`. All three are stored like any other field; they differ only in where the value can go afterwards. Below, Read is a server read with no projection, and Draft is the saved form draft.

Field

Read

Page

Agent — MCP

Draft

Search

- Sent to the page

  - field: An ordinary field. Every side reads it.

  - field.visual: Drawn on the page, stripped from everything an agent reads.

- Kept on the server

  - field.hidden: Server code reads it. The client gets `null`.

  - field.secret: Read only through a projection that names it.

The value can reach it

Never reaches it

A profile with one of each:

**visual is about cost, not secrecy.** A blur placeholder or a rendered HTML body is data the screen needs but no question is answered from. Storage, search, forms and the page are untouched.

**hidden still claims to be a string.** Its type says `string`, unlike secret's `string | null`, yet the client reads `null`.

**secret is not even loaded.** Only a projection that names it reads it, as in `pickById(id, { password: true })`, and then only the named fields come back. The endpoint response leaves it out even then.

**Neither takes a `text` role.** The search index is plaintext, so `text` on hidden or secret is a type error.

**Guard hidden and secret values with `??` or `== null`.** On the client the key is present and `null`, so `=== undefined`, a destructuring default and an optional-parameter default all miss it.

resolve

`resolve` is the builder Light and full callbacks receive. It declares a field that is never stored: the server computes it each time it builds a response.

Declare it on the model:

Then compute it with a `resolveField` of the same name in the module's Internal class. It receives the stored order, here one with `unitPrice` and `quantity` fields:

**Every `resolve` field needs its `resolveField`.** The Internal's type lists each one, so leaving one out fails the typecheck.

**Optional on both sides.** `resolve(Int).optional()` pairs with `resolveField(Int, { nullable: true })`.

**`this` reaches the services.** Write `exec` with a `function`, as in an endpoint, and call `this.orderService` when the value needs a lookup.

**No `text` role.** A computed value is never in the search index, so `resolve` does not accept one.

getDefault

`getDefault` builds the blank object a new record or form starts from. You usually call it through the model as `Model.getDefault()`.

Starts at

- `field.hidden` · `field.secret` — `null`, always.

- `default: () => …` — What the function returns, run again on each call.

- An array field — A fresh copy of its `default`, or `[]` without one.

- Any other `default` — That value itself, shared by every object built from it.

- `.optional()` with no `default` — `null`

- An embedded scalar — That scalar's own default object.

- A relation — `null`

- Any other type — The type's empty value, such as `""`, `0` or `false`.

Both ways of calling it, in a test:

**`Model.getDefault()` is built once.** The first call builds the object and later calls return a shallow copy, so a `() => dayjs()` default keeps its first value there.

**The field map runs every function again.** `getDefault(Model[FIELD_META])` calls each `default` function on every call.

DocumentModel / DefaultOf / QueryOf

Type helpers that documents, stores and tests use to name a model's other shapes. Import them as types only:

Type

- DocumentModel<T>: The stored shape. Relations become id strings, and a list of them `string[]`. — Example: `type BannerDoc = DocumentModel<cnst.Banner>;`

- DefaultOf<T>: What `getDefault()` returns. Methods are dropped, and relation fields may be `null`. — Example: `type BannerDefault = DefaultOf<cnst.Banner>;`

- QueryOf<T>: An opaque query descriptor, typed `any`. A slice's `exec` returns one. — Example: `type BannerQuery = QueryOf<BannerDoc>;`

- PurifiedModel<T>: What `purify` returns. Relations become ids; dates keep the `Dayjs` type.

- ProtoFile, ProtoLightFile: The shape of a `File` and a `LightFile`, for UI code that takes a file prop.

**A `QueryOf` does not chain.** You cannot call `.sort()` or `.limit()` on what a slice returns. Pass `{ sort, page, limit }` to the store's `init` fetch instead.

crystalize / purify

These two move a value between raw data and a model instance, in opposite directions. You reach them through the model rather than by name.

crystalize — raw to model

Converts one field's raw value: a date string to `Dayjs`, a nested object to its class. The constructor and `set()` use the same converters.

purify — model to plain

Checks every field (required, enum, `validate`, array length) and turns relations into ids. Returns `null` when a check fails.

In practice you build with the constructor and check with the model's purify:

**`purify` is not a named export.** Every class carries it as the static `Model.purify`; `makePurify(Model)` builds the same function.

**An empty required string fails.** A required `String` or `ID` left at `""` does not pass, which is why the first `purify` above is `null`.

**The store runs it before it sends.** A generated create or update action purifies the form with the Input class and sends nothing when the result is `null`.

**Copy a model with `new cnst.X().set(x)`, never a spread.** Date fields are accessors on the prototype, so `{ ...banner }` and `Object.keys(banner)` leave them out.

serialize / deserialize

These convert between runtime values and the payload that crosses a document or transport boundary.

serialize — runtime to payload

Walks the model's fields: `Dayjs` becomes `Date`, and a `Map` becomes a plain object.

deserialize — payload to runtime

Parses each primitive, so a date string becomes `Dayjs`, and goes into embedded scalars.

Call

- serialize(ref, arrDepth, value, type?, opts): Default `type` is `"object"`; `"input"` sends relations as ids. `opts` is `{ nullable?, key? }`.

- deserialize(ref, arrDepth, value, opts): `opts` is `{ nullable?, key?, enum?, convertFn? }`. With `enum`, a value outside it throws.

- ConstantRegistry.serialize, ConstantRegistry.deserialize: The short form, `(ref, value, nullable?)`. Takes a primitive, `Map` or model; `[Ref]` for a list.

A date on its way out and back:

**To `deserialize`, a database model is a relation.** Only primitives and scalars are converted; a model's value comes back as given. Build the instance with `new cnst.X(value)`.

**A missing required value throws.** Both refuse `null` and `undefined` unless `nullable` is set or the type is `Any`.

ConstantRegistry

`ConstantRegistry` ties model classes to their refName at runtime. Every module's classes, its scalars and its enums are registered here.

Static method

- getRefName(Model): The model's refName. Throws for an unknown class unless `{ allowEmpty: true }` is given. — Example: `ConstantRegistry.getRefName(cnst.Banner); // "banner"`

- getModelName(Model): The class name for its role, such as `BannerInput` or `LightBanner`. — Example: `ConstantRegistry.getModelName(cnst.LightBanner); // "LightBanner"`

- getModelRef(refName, modelType?): The class for a refName and role. With no role it finds a primitive such as `"Int"`. — Example: `ConstantRegistry.getModelRef("banner", "light");`

- getDatabase(refName), getScalar(refName): A module's registered entry: its five classes, or a scalar's one. Throws unless `allowEmpty`.

- has(Model): Whether the class is registered.

- isFull, isLight, isObject, isInsight, isScalar: Which role a class plays.

- serialize, deserialize: The short forms from the `serialize` / `deserialize` section above.

## Code Examples

### libs/shared/lib/banner/banner.constant.ts

```typescript
import { dayjs, enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

import { File } from "../file/file.constant";

export class BannerStatus extends enumOf("bannerStatus", ["active", "displaying"] as const) {}

export class BannerInput extends via((field) => ({
  title: field(String, { text: "title" }).optional(),
  image: field(File, { text: "thumb" }).optional(),
  href: field(String),
  from: field(Date, { default: () => dayjs() }),
})) {}

export class BannerObject extends via(BannerInput, (field) => ({
  status: field(BannerStatus, { default: "active", text: "filter" }),
})) {}

export class LightBanner extends via(
  BannerObject,
  ["title", "image", "href", "status"] as const,
  (resolve) => ({}),
) {}

export class Banner extends via(BannerObject, LightBanner, (resolve) => ({})) {}

export class BannerInsight extends via(Banner, (field) => ({})) {}
```

### apps/myapp/lib/product/product.constant.ts

```typescript
import { Any, enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

import { File } from "../file/file.constant";

export class ProductStatus extends enumOf("productStatus", ["draft", "onSale"] as const) {}

export class ProductInput extends via((field) => ({
  name: field(String, { minlength: 2, maxlength: 80, text: "title" }),
  price: field(Int, {
    default: 0,
    min: 0,
    validate: (price) => (price ?? 0) >= 0,
  }),
  tags: field([String], { text: "tag" }),
  cover: field(File, { cascade: "removeRef" }).optional(),
  status: field(ProductStatus, { default: "draft" }),
  spec: field<{ weightG: number }>(Any, { default: () => ({ weightG: 0 }) }),
})) {}
```

### apps/myapp/lib/profile/profile.constant.ts

```typescript
import { via } from "akanjs/constant";

export class ProfileInput extends via((field) => ({
  nickname: field(String, { text: "title" }),
  renderedBio: field.visual(String).optional(),
  loginProvider: field.hidden(String),
  password: field.secret(String, { type: "password", minlength: 8 }).optional(),
})) {}
```

### apps/myapp/lib/order/order.constant.ts

```typescript
import { Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class Order extends via(OrderObject, LightOrder, (resolve) => ({
  totalPrice: resolve(Int),
})) {}
```

### apps/myapp/lib/order/order.signal.ts

```typescript
import { Int } from "akanjs/base";
import { internal } from "akanjs/signal";

import * as srv from "../srv";

export class OrderInternal extends internal(srv.order, ({ resolveField }) => ({
  totalPrice: resolveField(Int).exec(function (order) {
    return order.unitPrice * order.quantity;
  }),
})) {}
```

### libs/shared/lib/banner/banner.test.ts

```typescript
import { expect, test } from "bun:test";
import { FIELD_META } from "akanjs/base";
import { getDefault } from "akanjs/constant";

import * as cnst from "../cnst";

test("a new banner starts active", () => {
  expect(cnst.Banner.getDefault().status).toBe("active");
  expect(getDefault<cnst.Banner>(cnst.Banner[FIELD_META]).status).toBe("active");
});
```

### libs/shared/lib/banner/banner.test.ts

```typescript
import { expect, test } from "bun:test";
import { dayjs } from "akanjs/base";

import * as cnst from "../cnst";

test("a banner needs an href to purify", () => {
  const banner = new cnst.BannerInput({ from: dayjs() });
  expect(cnst.BannerInput.purify(banner)).toBeNull();
  banner.set({ href: "/sale" });
  expect(cnst.BannerInput.purify(banner)?.href).toBe("/sale");
});
```

### libs/shared/lib/banner/banner.test.ts

```typescript
import { expect, test } from "bun:test";
import { dayjs } from "akanjs/base";
import { ConstantRegistry } from "akanjs/constant";

test("a date crosses as Date and comes back as Dayjs", () => {
  const sent = ConstantRegistry.serialize(Date, dayjs("2026-09-24"));
  expect(sent instanceof Date).toBe(true);
  expect(dayjs.isDayjs(ConstantRegistry.deserialize(Date, sent))).toBe(true);
});
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Respect server/client subpath boundaries when importing Akan APIs.

