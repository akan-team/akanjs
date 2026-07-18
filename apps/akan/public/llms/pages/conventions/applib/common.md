# Common Utils (common/)

- Source: /conventions/applib/common
- Mirror: /llms/pages/conventions/applib/common.md
- Section: conventions
- Category: App & Library
- Priority: P1

## Headings

- Common Overview (#common-overview)
- What Belongs In Common (#what-belongs)
- Barrel, Optimized Import, And Shape (#barrel-optimization)
- Server And Client Usage (#server-client-usage)
- Practical Rules (#practical-rules)

## Content

Common Utils (common/)

Common Overview

The common folder contains logic that can run in both server and client environments. Use it for pure helpers, shared formatting, validation, metadata builders, and transforms that should not depend on browser-only or server-only APIs.

Use srvkit for server-only logic, webkit for browser or web-rendering logic, and common for cross-runtime logic shared by services, signals, pages, and components.

What Belongs In Common

Formatters

Formatting logic used in both service output and UI display, such as bytes, packets, money, or short labels.

Validators

Validation or predicate helpers that should behave the same on the server and in the browser.

Random/string utilities

Small deterministic or generic helpers such as random codes, padding, shuffling, or short string transforms.

Metadata builders

Small objects or builder classes that describe query, filter, or display metadata without binding to one runtime.

Content transforms

Pure transforms that convert stored content into another shape, such as extracting plain text from editor JSON.

Barrel, Optimized Import, And Shape

The common folder is also a barrel folder like ui and webkit. Export shared helpers from index.ts, then import from the barrel. Akan can optimize imports so pages include only the common helpers they actually use.

Prefer one file, one export, and file name equals export name. This keeps cross-runtime helpers easy to find and easy to optimize.

Server And Client Usage

A common helper can be used from both service code and page/client code. Keep the helper free from window, document, Bun, fs, process.env, or vendor SDK assumptions unless those APIs are available in both runtimes.

Practical Rules

Use common when the same logic must work in both service/signal code and page/component code.

Use srvkit instead when the helper needs server-only APIs.

Use webkit instead when the helper needs browser-only APIs.

Keep common helpers small, pure, and imported from the barrel.

## Code Examples

### common/randomCode.ts

```ts
export const randomCode = (length = 6) => {
  return Math.floor(Math.random() * 10 ** length)
    .toString()
    .padStart(length, "0");
};
```

### common/index.ts

```ts
export { randomCode } from "./randomCode";
```

### order.service.ts

```ts
import { randomCode } from "@libs/util/common";

export class OrderService extends serve(db.order, () => ({})) {
  createOrderCode() {
    return randomCode(8);
  }
}
```

### page.tsx

```ts
import { randomCode } from "@libs/util/common";

export function PreviewCode() {
  return <span>{randomCode(8)}</span>;
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

