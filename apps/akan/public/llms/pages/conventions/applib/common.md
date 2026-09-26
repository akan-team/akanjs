# Common Utils (common/)

- Source: /conventions/applib/common
- Mirror: /llms/pages/conventions/applib/common.md
- Section: conventions
- Category: App & Library
- Priority: P1

## Headings

- Common Utility Overview (#common-overview)
- What Belongs In common/ (#what-belongs)
- Barrel And File Shape (#barrel-optimization)
- Using It On Both Sides (#server-client-usage)
- Practical Rules (#practical-rules)

## Content

Common Utils (common/)

Pure, isomorphic, zero-dependency; imports only sibling common/* and akanjs/base, not Err.

Touches window, navigator or Capacitor, or is a React hook.

Touches node:*, Bun, process.env, a secret, or a server SDK.

Renders JSX or defines a recipe, bound to no model; a model-bound component goes in its module.

A build-time or CLI-time AkanPlugin, registered in akan.config.ts.

Formatter

Formatting that a service's output and the UI share, such as bytes, money or short labels.

Validator

A validation or predicate that must give the same answer on the server and in the browser.

Random and string utility

A small generic helper: random codes, padding, shuffling or a short string transform.

Metadata builder

A small object or builder that describes a query, filter or display without running it.

Content transform

A pure transform of stored content, such as rich-editor JSON into plain text.

Both sides have it

A sibling file and `akanjs/base` are the only value imports a common file makes.

Standard JavaScript built-ins exist in Bun and in every browser.

Erased before bundling, so the type may come from any package.

Only the browser has it

Browser globals do not exist on the server.

The native-app bridge is browser-only, and a React hook needs a client component.

Only the server has it

Server runtime APIs that a browser bundle cannot load.

Server settings and secrets must never reach the browser bundle.

server SDK

A vendor client for payment, mail or storage.

Server

Browser

Common Utility Overview

Reach for it when both sides need the same formatting, validation, metadata or transform, so the two never disagree.

Which folder?

Folder

What Belongs In common/

Five kinds of helper usually live here. Each needs nothing but its arguments, so it gives the same answer on either side:

Kind

Barrel And File Shape

Using It On Both Sides

A common helper runs wherever it is imported: in Bun for a service, in the browser for a store or a client component. So it may use only what both sides have:

What the helper uses

Put it here

Not here

One helper, both sides

File

Runs on

Call

Practical Rules

Where a helper goes

Inside a common file

## Code Examples

### libs/util/common/index.ts

```ts
export * from "./isHttpUri";
export * from "./pad";
export * from "./randomCode";
export * from "./shortenUnit";
export * from "./validate";
```

### libs/shared/lib/user/user.service.ts

```ts
import { withRedirectQuery } from "@libs/shared/common";
import { randomCode, randomString } from "@libs/util/common";
```

### libs/shared/common/redirectQuery.ts

```ts
export const withRedirectQuery = (
  redirect: string,
  params: Record<string, string>,
) => {
  const queryIndex = redirect.indexOf("?");
  const path = queryIndex === -1 ? redirect : redirect.slice(0, queryIndex);
  const query = new URLSearchParams(
    queryIndex === -1 ? "" : redirect.slice(queryIndex + 1),
  );
  for (const [key, value] of Object.entries(params)) query.set(key, value);
  const search = query.toString();
  return search ? `${path}?${search}` : path;
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

