# Web Utils (webkit/)

- Source: /conventions/applib/webkit
- Mirror: /llms/pages/conventions/applib/webkit.md
- Section: conventions
- Category: App & Library
- Priority: P1

## Headings

- Webkit Overview (#webkit-overview)
- What Belongs In Webkit (#what-belongs)
- Barrel And File Names (#barrel-optimization)
- Practical Rules (#practical-rules)

## Content

Web Utils (webkit/)

Webkit Overview

`webkit/` holds browser code that several screens reuse but that is not a component. It is the browser-side twin of `srvkit/`, which holds server-only code.

Pages and components then import one name from the webkit barrel instead of carrying the logic themselves.

Words used on this page

Term

- barrel: A folder's `index.ts` that re-exports every file in it, so callers import the folder path.

- "use client": Marks a file as client code. A server component cannot call its functions or read its values.

- server component: A page, `Unit` or `View`. It renders on the server and reaches the browser as HTML only.

Which folder?

Pick the folder by what the code touches, not by what it is for. The `common/`, `webkit/` and `srvkit/` pages all open with this table.

Folder

- common/: Pure, isomorphic, zero-dependency; imports only sibling `common/*` and `akanjs/base`, not `Err`.

- webkit/: Touches `window`, `navigator` or the native bridge (`akanjs/client/native`), or is a React hook.

- srvkit/: Touches `node:*`, `Bun`, `process.env`, a secret, or a server SDK.

- ui/: Renders JSX or defines a recipe, bound to no model; a model-bound component goes in its module.

- plugin/: A build-time or CLI-time `AkanPlugin`, registered in `akan.config.ts`.

What Belongs In Webkit

Five kinds of code live here. Whether the file starts with `"use client"` decides who can use it:

Kind

Server — page · Unit · View

Client — "use client"

- No "use client" — server and client

  - Render map: A shared table from an enum value to a recipe variant name or icon, never to class strings.

  - Account helper: Reads the signed-in account and sends a guest away, like `getSelf` in `_layout.tsx`.

- "use client" — client components only

  - Browser helper: A small browser action: copy text, download a file, read a cookie, open a share link.

  - Web hook: A reusable hook over a browser API: viewport, permissions, notifications, messaging.

  - Vendor wrapper: Hides a browser package behind your own function, so pages never import it.

Can use it

Cannot use it

**Leave `"use client"` off anything a server component reads.** On the server, each export of a `"use client"` file becomes a placeholder: calling it throws, and a map key reads as `undefined`. That is why render maps and account helpers carry no directive.

Render map

One status-to-badge table that several modules share:

**Move it here on the second use.** A lookup one module uses stays an `as const` map at the top of that file. It moves to `webkit/` when a second module needs it.

**Class strings go in a recipe instead.** A table whose values are classes is a variant axis, so it moves to a recipe in `ui/Recipe/`, not here.

**The label comes from the dictionary.** The map holds only the look; the text is `l("icecreamOrderStatus.active")`, so nothing user-facing is hard-coded.

**`satisfies` checks every status.** A status added to the enum without a variant here is a type error.

Account and routing helper

A helper that reads the signed-in account and sends a guest to the sign-in page:

**No `"use client"`.** `_layout.tsx` calls it on the server, so a guest is redirected before any HTML is sent.

**`router.redirect`, not `router.replace`.** `redirect` works on both sides, while `replace` only moves a browser tab: on the server the page would render signed-out.

**`libs/shared` already ships one.** Use `getSelf({ unauthorize: "/signin" })` and `getMe` from `@libs/shared/webkit` when the app mounts that lib.

Browser helper

One browser action that pages would otherwise repeat:

**`"use client"` because it touches `navigator`.** Only a client component, such as an `onClick` handler, can call it.

**Check `@libs/shared/webkit` first.** It already ships `downloadFile`, `downloadData` for a JSON export and `addFileUntilActive`, which uploads a file and waits until it is ready.

Web hook

A hook that subscribes to a browser event and cleans up after itself:

**Return a named object, never a tuple.** Callers write `const { width } = useViewportWidth()`.

**Check the hooks that already exist.** `akanjs/webkit` ships `useDebounce`, `useThrottle`, `useInterval` and `useEscapeKey`, and wraps the native runtime and browser APIs in `useCamera` and `useGeoLocation`. `@libs/util/webkit` adds `usePushNotification` and `useSpeech`.

**Only for real state.** If the width only shows or hides markup, a responsive class such as `md:hidden` keeps both branches on the server.

Vendor wrapper

The `downloadFile` helper in `libs/shared` wraps `file-saver`:

**Pages and module files never import a vendor package.** A third-party import in `page/**`, a `*.Zone.tsx` or a `*.store.ts` fails lint, so they import `downloadFile` instead.

**A vendor component goes in `ui/`.** `webkit/` exports camelCase functions, hooks and maps. A wrapped component is a PascalCase file in `ui/`, like `libs/util/ui/QRCode.tsx` around `qrcode.react`.

Barrel And File Names

`webkit/` is a barrel folder like `ui/`: every file is re-exported from one entry. Name each file after the one thing it exports:

File name

- use<Thing>.tsx: A React hook. The file is `.tsx` even when it holds no JSX. — Example: `libs/util/webkit/useSpeech.tsx`

- <camelName>.ts: Every other helper, wrapper or map. One export per file, named like the file. — Example: `libs/shared/webkit/downloadFile.ts // exports downloadFile`

A component then imports the helper by its barrel path:

**Barrel path only.** Write `@libs/shared/webkit` or `@apps/koyo/webkit`. A deeper path such as `@libs/shared/webkit/downloadFile` fails lint in pages and module files.

**The button owns the click.** It needs `"use client"` for the `onClick`, and `Button` shows a spinner while the returned promise is pending.

**The page never sees `file-saver`.** It renders `<DownloadButton />`; the vendor stays behind `webkit/`.

Practical Rules

Six rules cover almost every webkit file:

**Logic in `webkit/`, components in `ui/`.** Web-rendering logic that is not itself a reusable UI component goes here.

**Browser code in `webkit/`, server-only code in `srvkit/`.** Anything that touches `node:*`, `Bun`, `process.env` or a secret belongs in `srvkit/`.

**Import from the barrel.** `@libs/shared/webkit`, never a path inside it.

**File name equals export name.** `downloadFile.ts` exports `downloadFile`.

**`"use client"` only where the browser is needed.** Hooks, browser APIs and browser packages need it; anything a server component reads must not have it.

**No `//!` comments.** Bun keeps them through minification, so they ship to every visitor. Write `// FIXME:` instead.

Who can import webkit/

Server and shared files may name a webkit type with `import type`, but never import a value:

Importing file

Value — import { x }

Type — import type { X }

- Files that render

  - page/ · ui/: Allowed; a server component still calls only exports without "use client".

  - <Model>.*.tsx · *.store.ts: Module components and stores import from the barrel, like `@libs/util/webkit`.

- Server and shared files

  - *.service.ts · *.document.ts: Server code runs in Bun with no DOM, so it may only name a webkit type.

  - *.signal.ts · *.dictionary.ts: Contract files load on the server too, so the same rule holds.

  - srvkit/: Server-only helpers and adaptors never reach into browser code.

  - common/ · *.constant.ts: Shared files run on both sides, so they reach neither `webkit/` nor `srvkit/`.

Allowed

Fails lint

**`webkit/` cannot import server code either.** A value import of `srvkit/`, a `*.service.ts`, `*.document.ts`, `*.signal.ts` or `*.dictionary.ts`, a server entrypoint, or the `db` / `srv` / `sig` / `dict` / `option` / `useServer` barrels fails lint. Read models from `cnst` through the client entrypoint, and use `import type` when only a type is needed.

Related pages

Where server-only code goes.

Pure helpers that run on both sides.

Components that are not bound to one model.

The hooks and helpers the framework itself ships.

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

### apps/koyo/webkit/icecreamOrderStatusVariant.ts

```ts
import type { cnst } from "@apps/koyo/client";
import type { BadgeVariants } from "akanjs/ui";

export const icecreamOrderStatusVariant = {
  active: "info",
  processing: "warning",
  served: "success",
  finished: "neutral",
  canceled: "error",
} as const satisfies {
  [key in cnst.IcecreamOrderStatus["value"]]: BadgeVariants["variant"];
};
```

### apps/koyo/webkit/getSignedInUser.ts

```ts
import type { Self } from "@libs/shared/common";
import { getAccount, router } from "akanjs/client";

export const getSignedInUser = () => {
  const self = getAccount<{ self?: Self }>().self;
  if (!self) router.redirect("/signin");
  return self;
};
```

### apps/koyo/webkit/copyText.ts

```ts
"use client";

export const copyText = (value: string) => {
  return navigator.clipboard.writeText(value);
};
```

### apps/koyo/webkit/useViewportWidth.tsx

```ts
"use client";

import { useEffect, useState } from "react";

export const useViewportWidth = () => {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const sync = () => setWidth(window.innerWidth);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return { width };
};
```

### libs/shared/webkit/downloadFile.ts

```ts
"use client";
import { saveAs } from "file-saver";

export const downloadFile = async (url: string, filename: string) => {
  const res = await window.fetch(url, { method: "GET" });
  saveAs(await res.blob(), filename);
};
```

### apps/koyo/ui/DownloadButton.tsx

```ts
"use client";

import { usePage } from "@apps/koyo/client";
import { downloadFile } from "@libs/shared/webkit";
import { Button } from "akanjs/ui";

export const DownloadButton = () => {
  const { l } = usePage();
  return (
    <Button onClick={() => downloadFile("/invoice.pdf", "invoice.pdf")}>
      {l.trans({ en: "Download", ko: "다운로드" })}
    </Button>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

