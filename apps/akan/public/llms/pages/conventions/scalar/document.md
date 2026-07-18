# scalar.document.ts

- Source: /conventions/scalar/document
- Mirror: /llms/pages/conventions/scalar/document.md
- Section: conventions
- Category: Scalar
- Priority: P1

## Headings

- scalar.document.ts (#document-overview)
- Basic Wrapper (#basic-wrapper)
- Small Helper Example (#helper-example)
- When To Use It (#when-to-use)

## Content

scalar.document.ts

A scalar document file is optional. Add it when a scalar value needs a small method that reads its own fields and returns a useful result.

If the scalar only needs fields and labels, the constant and dictionary files may be enough.

Basic Wrapper

Import the constant file as `cnst`, then wrap the constant class with `by(cnst.Price)`. This gives the document class the same fields as the constant class.

Small Helper Example

A useful scalar document method is usually short. It reads the scalar fields and returns a display value, boolean, or small calculated result.

When To Use It

Use a scalar document method when the same display or calculation appears in multiple places. For example, `Price.getLabel()` can be reused in product cards, order summaries, and invoices.

Good: formatting a price label from `amount` and `currency`.

Good: summarizing an address from `city` and `street`.

Avoid: loading other records or calling a backend service from the scalar method.

## Code Examples

### price.document.ts

```ts
import { by } from "akanjs/document";

import * as cnst from "./price.constant";

export class Price extends by(cnst.Price) {}
```

### price.document.ts

```ts
import { by } from "akanjs/document";

import * as cnst from "./price.constant";

export class Price extends by(cnst.Price) {
  getLabel() {
    return `${this.amount.toLocaleString()} ${this.currency}`;
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

