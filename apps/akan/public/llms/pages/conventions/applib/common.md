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

Server

Browser

Common Utility Overview

`common/` holds code that behaves the same on the server and in the browser: small, pure helpers that need no runtime of their own. A service, a signal, a store, a page and a `*.constant.ts` file can all import the same helper.

Reach for it when both sides need the same formatting, validation, metadata or transform, so the two never disagree.

Which folder?

Code outside `lib/` goes in one of five folders. Choose by what the code touches, not what it is for; the `srvkit/` and `webkit/` pages open with this same table.

Folder

- common/: Pure, isomorphic, zero-dependency; imports only sibling common/* and akanjs/base, not Err.

- webkit/: Touches window, navigator or the native bridge (akanjs/client/native), or is a React hook.

- srvkit/: Touches node:*, Bun, process.env, a secret, or a server SDK.

- ui/: Renders JSX or defines a recipe, bound to no model; a model-bound component goes in its module.

- plugin/: A build-time or CLI-time AkanPlugin, registered in akan.config.ts.

What Belongs In common/

Five kinds of helper usually live here. Each needs nothing but its arguments, so it gives the same answer on either side:

Kind

- Formatter: Formatting that a service's output and the UI share, such as bytes, money or short labels.

- Validator: A validation or predicate that must give the same answer on the server and in the browser.

- Random and string utility: A small generic helper: random codes, padding, shuffling or a short string transform.

- Metadata builder: A small object or builder that describes a query, filter or display without running it.

- Content transform: A pure transform of stored content, such as rich-editor JSON into plain text.

**Two are hypothetical, three are real.** `formatBytes` and `isWebUrl` sit in a sample app; the other three are files in this workspace.

**A constant file may import `common/`, never `ui/`, `webkit/` or `srvkit/`.** `summary.constant.ts` is loaded on both sides, so the `getQueryMeta` builder it calls has to live in `common/`.

Barrel And File Shape

Like `ui/`, `webkit/` and `srvkit/`, `common/` is a barrel folder: its `index.ts` re-exports every helper in it. Its one-line entries look like this:

So a caller imports the folder, never a single file — `@libs/<lib>/common` or `@apps/<app>/common`:

**One file, one export.** `randomCode.ts` exports `randomCode`, so a helper is found by its name.

**Only camelCase file names reach the barrel.** A dotted name such as `queryMeta.helper.ts`, and every test file, stays private to the folder.

**Siblings import each other by relative path.** `randomCode.ts` imports `./pad`, not its own barrel.

**`index.ts` is generated.** Add, rename or delete a helper file; never edit the index by hand.

Using It On Both Sides

A common helper runs wherever it is imported: in Bun for a service, in the browser for a store or a client component. So it may use only what both sides have:

What the helper uses

common/

webkit/

srvkit/

- Both sides have it

  - ./<sibling> · akanjs/base: A sibling file and `akanjs/base` are the only value imports a common file makes.

  - URL · Intl · Math · JSON: Standard JavaScript built-ins exist in Bun and in every browser.

  - import type: Erased before bundling, so the type may come from any package.

- Only the browser has it

  - window · document · navigator: Browser globals do not exist on the server.

  - akanjs/client/native · React hook: The native-app bridge is browser-only, and a React hook needs a client component.

- Only the server has it

  - node:* · fs · Bun: Server runtime APIs that a browser bundle cannot load.

  - process.env · secret: Server settings and secrets must never reach the browser bundle.

  - server SDK: A vendor client for payment, mail or storage.

Put it here

Not here

One helper, both sides

`withRedirectQuery` adds query params to a redirect URL that may already carry some. It needs only `URLSearchParams` and string methods:

The user module in `libs/shared/lib/user/` calls it on both sides, along with two `@libs/util/common` helpers:

File

Runs on

Call

- user.service.ts — Server — `withRedirectQuery(signupRedirect, { userId: user.id })`

- user.service.ts — Server — `randomCode(6)`

- user.store.ts — Browser — `router.push(withRedirectQuery(redirect, { userId }))`

- User.Util.tsx — Browser — `pad(phoneCodeRemain.minute, 2)`

**One import for both.** The service and the store import the same name from `@libs/shared/common`; nothing changes per side.

**The two sides cannot drift.** The service builds the signup redirect and the store builds the next step's URL with one function, so they agree on the query format.

Practical Rules

Where a helper goes

**Both sides need it → `common/`.** Service or signal code and page or component code run the same logic.

**Needs a server-only API → `srvkit/`.**

**Needs a browser-only API → `webkit/`.**

**Never beside a model, never in `base/`.** A helper file does not go inside `lib/<model>/`, and there is no `base/` folder; shared utilities go in that app's or lib's own `common/`.

Inside a common file

**Small, pure, imported from the barrel.** One job per helper, no side effects, and callers use the folder path.

**Return, do not throw.** `Err` cannot be imported into `common/`, so return a sentinel such as `null` or `false` and let the service or store decide.

**Write `// FIXME:`, not `//!`.** `common/` ships to the browser, and a `//!` comment survives minification.

**A common file imports neither side.** Lint rejects a value import from the client side (a store, a module component, `ui/`, `webkit/`, `akanjs/client`) and from the server side (a service, document, signal, dictionary, `srvkit/`, `akanjs/server`). `import type` is erased before bundling, so a type from either side stays legal.

## Code Examples

### common/

```ts
libs/util/common/isHttpUri.ts
// camelCase file, filename equals the single export
```

### webkit/

```ts
libs/util/webkit/useSpeech.tsx
// use<Thing>.tsx — .tsx even with no JSX
```

### srvkit/

```ts
libs/util/srvkit/cloudflareApi.ts
// camelCase file, PascalCase class
```

### ui/

```ts
apps/akan/ui/BrowserMockup.tsx
// PascalCase component, camelCase sidecar
```

### plugin/

```ts
libs/util/plugin/pushNotification.plugin.ts
// <name>.plugin.ts
```

### Formatter

```ts
// apps/koyo/common/formatBytes.ts
export const formatBytes = (bytes: number) => {
  if (bytes < 1) return "0B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  return `${(bytes / 1024 ** idx).toFixed(1)}${units[idx]}`;
};
```

### Validator

```ts
// apps/koyo/common/isWebUrl.ts
export const isWebUrl = (value: string) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};
```

### Random and string utility

```ts
// libs/util/common/randomCode.ts
import { pad } from "./pad";

export const randomCode = (length = 6) =>
  pad(Math.floor(Math.random() * 10 ** length), length);
```

### Metadata builder

```ts
// libs/shared/lib/summary/summary.constant.ts
import { getQueryMeta } from "@libs/shared/common";

activeUser: field(Int, { default: 0 }).meta(
  getQueryMeta<UserFilter>("user").query("byStatuses").args([["active"]]),
),
```

### Content transform

```ts
// libs/shared/common/richEditor.ts
export class RichEditor {
  static richTextToPlain(content: unknown): string {
    const walk = (node: unknown): string => {
      if (!node || typeof node !== "object") return "";
      const { type, text, children } = node as ContentNode;
      if (typeof text === "string") return text;
      const inner = Array.isArray(children) ? children.map(walk).join("") : "";
      return type === "paragraph" ? `${inner}\n` : inner;
    };
    return walk((content as { root?: unknown } | null)?.root).trim();
  }
}
```

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

