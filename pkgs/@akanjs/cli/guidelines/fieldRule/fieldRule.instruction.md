# Akan Field Rule Guideline

## Purpose
Use this whenever generating constants or scalar constants. It defines the current `via()` field helper style and field option rules.

## Ownership
- `field(Type)` defines a required public field.
- `field(Type, options)` defines a field with defaults, examples, validation, aggregation, or relation metadata.
- `field(Type).optional()` marks a nullable or optional business value when absence is valid.
- `field.hidden(Type).optional()` is for internal state that should not be treated as a normal public field.
- `field.secret(Type).optional()` is for sensitive values that should not be selected by default.
- Neither survives an endpoint response: both are stripped on the way out and hydration writes `null` over the key, while the generated type still declares the field — so a client holds a deliberate `null` behind a type that promises a value, and only `??` / `== null` catch it. A field a browser has to read is neither.
- `field.visual(Type)` is a field the page renders and an agent never sees (below).
- `field([Type])` defines arrays; provide empty array defaults when the app expects list operations.

## Field Types
- **Import from `akanjs/base`** (real classes/helpers, not globals): `Int`, `Float`, `ID`, `Any`, `Binary`, `Upload`,
  `ImageResult`, `enumOf`, and the `dayjs` factory. There is **no `JSON` scalar** — use `Any` for open/flexible
  payloads, and only when the content is genuinely flexible.
- **Use the JS globals directly (no import needed)**: `String`, `Boolean`, `Date`. They are monkey-patched to
  behave like scalars, so `field(String)` typechecks.
- **`Number` is not a valid field/body type.** `NumberConstructor` is intentionally not augmented, so
  `field(Number)` / `.body("x", Number)` fails to typecheck. Use `Int` for whole-number counts and quantities and
  `Float` only for values that need decimals.
- Runtime resolution of every scalar (globals included) goes through `PrimitiveRegistry` by `refName`
  (`pkgs/akanjs/base/primitiveRegistry.ts`).
- **`Binary`, `Upload` and `ImageResult` are never model fields.** The class build refuses `field(Binary)` naming
  the `File` model instead, because every non-base field lives in the `_doc` JSON column and bytes would sit there
  as base64 and ride every read of the row. How each travels on the wire: `transportRule` and `mcpRule`.
- Defaults are a literal for scalars and a thunk for anything constructed (`default: () => dayjs()`, so the value
  is created at runtime). Optional is the postfix `.optional()`.

## Masked And Visual Fields
- **A `field.hidden` / `field.secret` value reads `null` on the client, and the type still declares it.**
  `SignalContext.resolveReturn` skips both field types while it builds an endpoint's response, and hydration
  writes `null` over the key rather than leaving it absent — the first branch of the loop in
  `constant/getDefault.ts`, ahead of the field's own default. Every use of it typechecks, and the failure lands
  wherever it is finally dereferenced instead of where it was read. **Guard with `??` or `== null`**:
  `=== undefined`, a destructuring default and an optional parameter default all catch only a missing key and sail
  straight past this one. A projection (`pickById(id, { secret: true })`) widens the *server's* read, never the
  response. If a screen needs the value, the field is neither hidden nor secret; if it only needs to be cheap for a
  model rather than unseen, that is `field.visual`.
- **`field.visual(T)` is a field the page renders and an agent never sees** — a blur placeholder, a rendered HTML
  body, a serialized geometry. It stays an ordinary stored `property` (persistence, search, forms and the page
  response untouched) and is stripped wherever a value is masked for an AI caller: every in-page-agent read and
  every MCP result, along with the MCP readable schema. Unlike `hidden`/`secret` it is cost, not secrecy — nothing
  is refused over one. Reach for it whenever a field is bulky and useless to a model; that is cheaper than every
  tool learning to avoid it.
- `field.secret`, `field.hidden` and `resolve()` take no `text` search role (`queryRule`).

## Immutable Fields
- A document-path change to an `{ immutable: true }` field is refused with `base.error.immutableField` (400,
  `data.field`), which the client toasts in the user's language; query-level writes are not checked.

## Date Fields On An Instance
- **A model instance's `Date` fields are prototype accessors, not own properties.** `user.createdAt` is still a
  `Dayjs`, built on first read from a native `Date` the instance holds under a symbol. So `Object.keys(user)` and
  `{ ...user }` do **not** include them, while `"createdAt" in user`, `for...in`, `JSON.stringify(user)`,
  `plainFieldsOf(user)` (`akanjs/common`), `immerify`, and `deepObjectify` all do. To copy a model,
  `new cnst.X().set(user)`, never a spread.

## Image And File Fields
- **Do not declare `Upload` as a model field.** `Upload` is a signal-body-only primitive. Declare an image/file
  field as a relation to `File`: `image: field(File).optional()` for one, `images: field([File])` for many.
- The store then auto-generates an `upload<Field>On<Model>(fileList)` action that calls the framework upload
  mutation and polls file status until it leaves `"uploading"` (`pkgs/akanjs/store/action.ts`).
- Storage is wired through the `StorageAdaptor` DI role (default `BlobStorage`,
  `pkgs/akanjs/service/predefinedAdaptor/storage.adaptor.ts`); the reference implementation is the `file` module.
  Do not hand-roll data-URL fallbacks. `{ cascade: "removeRef" }` on the field removes the file with its owner
  (`queryRule`).

## Current Akan Patterns
- Use `String`, `Boolean`, `Date`, `Int`, `Float`, `ID`, scalar classes, model light classes, or enum classes as field types.
- Use `enumOf()` classes for categorical values that need type-safe values and dictionary entries.
- Use scalar classes for embedded reusable value objects such as price, address, coordinate, or file metadata.
- Use light model classes for embedded resolved references when the parent stores or exposes a compact related model.

## Codegen Rules
- Every generated field should have a clear business reason and a dictionary label/description unless it is hidden or secret.
- Use `example` values when the field appears in APIs or docs.
- Use `default` for stable empty states such as empty string, zero, false, empty list, or date factory.
- Use validation options only for domain invariants, not UI-only preferences.
- Do not create fields only because a UI might someday need them.

## Review Checklist
- The instruction points to current docs pages, not removed docs routes.
- Generated examples use current Akan builder APIs and scanner-friendly filenames.
- The output contract tells the model which file paths to return.
- The guide avoids broad framework essays when a concrete file rule is better.
