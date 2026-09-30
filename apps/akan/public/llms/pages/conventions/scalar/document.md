# scalar.document.ts

- Source: /conventions/scalar/document
- Mirror: /llms/pages/conventions/scalar/document.md
- Section: conventions
- Category: Scalar
- Priority: P1

## Headings

- scalar.document.ts (#document-overview)
- The Whole File (#basic-wrapper)
- Helpers Go On The Constant (#helper-example)
- When You Use It (#when-to-use)

## Content

scalar.document.ts

`price.document.ts` is the server-side class of a scalar. It is one line that wraps the constant class, and it stays that way.

`akan create-scalar price` writes it together with the other core files. Keep it even when the scalar needs nothing but fields and labels.

Words used on this page

Name

- cnst.Price: The constant class that server and browser both load: fields, defaults and helpers.

- by(cnst.Price): Builds a server-side class with the same fields as the constant class.

- db.Price: The value's type in server code: its stored fields, without methods.

The Whole File

Import the constant file as `cnst` and wrap its class with `by(cnst.Price)`. The document class then has the same fields as the constant class:

**Same name as the constant class.** The `price/` folder exports `Price`, which wraps `cnst.Price`.

**Import the sibling file.** The path is `./price.constant` in the same folder.

**The body stays empty.** `by()` already copies every field, and helpers go on the constant class, as the next section shows.

**Only server code may import this file.** A value import from `ui/`, `webkit/`, `page/`, `common/`, `*.store.ts`, `*.constant.ts` or any `.tsx` fails lint. Use `cnst.Price` there; `import type` is still allowed.

Helpers Go On The Constant

A helper that reads the scalar's fields, such as a label, a flag or a small calculation, belongs on the constant class. The document class keeps only the wrapper.

What you write

constant

dictionary

document

- The value itself, for server and browser

  - Fields and defaults: The value's shape, such as `amount: field(Float, { default: 0 })`.

  - enumOf(…): Enum classes such as `Currency`, declared above the scalar class.

  - Helper methods: Display, predicate and small calculation methods such as `getLabel()`.

- Labels

  - Labels and descriptions: An `[en, ko]` label and description for every field and enum value.

- Server only

  - by(cnst.Price): The one-line wrapper that gives server code the `db.Price` type.

Lives in this file

Not here

So a price label is a short method on `Price` in the constant file:

**Keep it short.** Read the fields and return a display value, a boolean or a small calculated result.

**Unlike a database module.** A `model.document.ts` holds chain methods such as `approve()`; a scalar's document holds none.

**Never add a method to the document class.** Nothing turns a stored price into a `Price` document, so the method has no instance to run on, and browser code cannot import it at all.

When You Use It

You rarely edit this file, but server code uses its type. A service method that takes a scalar value types it as `db.<Scalar>`:

**`db.LeaveInfo` is data only.** It lists the stored fields of the `LeaveInfo` scalar and no methods.

**Browser code uses `cnst.LeaveInfo`.** The `db` types stay on the server side.

Where each need goes

Reach for a helper when the same display or calculation shows up in several places. Anything that loads data stays in a service.

When you need…

File

Example

- A service method that takes or returns the value — leaveInfo.document.ts — Example: `leaveInfo: db.LeaveInfo`

- One price label reused in product cards, order summaries and invoices — price.constant.ts — Example: `price.getLabel()`

- An address summary built from `city` and `street` — address.constant.ts — Example: `address.getSummary()`

- A calculation across two values, such as a distance — coordinate.constant.ts — Example: `Coordinate.getDistanceKm(a, b)`

- Loading other records or calling a backend service — <model>.service.ts — Example: `this.userModel.getUser(userId)`

Common mistakes

**Writing `getLabel()` in the document class.** Move it to the constant class, which server and browser code can both import.

**Deleting the file because it is one line.** Server code gets `db.Price` from it, so it stays beside the constant and dictionary.

**Loading records inside a helper.** A helper only reads its own fields; a query or a service call belongs in the parent module's service.

Read next

- scalar.constant.ts — Where helper methods live, with instance and `static` examples.

- model.document.ts — A database module's document, where chain methods do belong.

## Code Examples

### apps/<app>/lib/__scalar/price/price.document.ts

```ts
import { by } from "akanjs/document";

import * as cnst from "./price.constant";

export class Price extends by(cnst.Price) {}
```

### apps/<app>/lib/__scalar/price/price.constant.ts

```ts
import { Float } from "akanjs/base";
import { via } from "akanjs/constant";

export class Price extends via((field) => ({
  amount: field(Float, { default: 0 }),
  currency: field(String, { default: "KRW" }),
})) {
  getLabel() {
    return `${this.amount.toLocaleString()} ${this.currency}`;
  }
}
```

### libs/shared/lib/user/user.service.ts

```ts
import { serve } from "akanjs/service";

import * as db from "../db";

export class UserService extends serve(db.user, () => ({})) {
  async setLeaveInfo(userId: string, leaveInfo: db.LeaveInfo) {
    const user = await this.userModel.getUser(userId);
    return await user.set({ leaveInfo }).save();
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

