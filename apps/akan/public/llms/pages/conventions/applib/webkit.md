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

A folder's `index.ts` that re-exports every file in it, so callers import the folder path.

Marks a file as client code. A server component cannot call its functions or read its values.

server component

A page, `Unit` or `View`. It renders on the server and reaches the browser as HTML only.

Pure, isomorphic, zero-dependency; imports only sibling `common/*` and `akanjs/base`, not `Err`.

libs/util/common/isHttpUri.ts // camelCase file, filename equals the single export

Touches `window`, `navigator` or Capacitor, or is a React hook.

libs/util/webkit/useGeoLocation.tsx // use<Thing>.tsx — .tsx even with no JSX

Touches `node:*`, `Bun`, `process.env`, a secret, or a server SDK.

libs/util/srvkit/cloudflareApi.ts // camelCase file, PascalCase class

Renders JSX or defines a recipe, bound to no model; a model-bound component goes in its module.

apps/akan/ui/BrowserMockup.tsx // PascalCase component, camelCase sidecar

A build-time or CLI-time `AkanPlugin`, registered in `akan.config.ts`.

Server

Client

No "use client" — server and client

Render map

A shared table from an enum value to a recipe variant name or icon, never to class strings.

Account helper

Reads the signed-in account and sends a guest away, like `getSelf` in `_layout.tsx`.

"use client" — client components only

Browser helper

A small browser action: copy text, download a file, read a cookie, open a share link.

Web hook

A reusable hook over a browser API: viewport, permissions, notifications, messaging.

Vendor wrapper

Hides a browser package behind your own function, so pages never import it.

A React hook. The file is `.tsx` even when it holds no JSX.

Every other helper, wrapper or map. One export per file, named like the file.

libs/shared/webkit/downloadFile.ts // exports downloadFile

Value

Type

Files that render

Allowed; a server component still calls only exports without "use client".

Module components and stores import from the barrel, like `@libs/util/webkit`.

Server and shared files

Server code runs in Bun with no DOM, so it may only name a webkit type.

Contract files load on the server too, so the same rule holds.

Server-only helpers and adaptors never reach into browser code.

Shared files run on both sides, so they reach neither `webkit/` nor `srvkit/`.

Webkit Overview

Pages and components then import one name from the webkit barrel instead of carrying the logic themselves.

Words used on this page

Term

Which folder?

Folder

What Belongs In Webkit

Kind

Can use it

Cannot use it

One status-to-badge table that several modules share:

Account and routing helper

A helper that reads the signed-in account and sends a guest to the sign-in page:

One browser action that pages would otherwise repeat:

A hook that subscribes to a browser event and cleans up after itself:

Barrel And File Names

File name

A component then imports the helper by its barrel path:

Practical Rules

Six rules cover almost every webkit file:

Who can import webkit/

Importing file

Allowed

Fails lint

Related pages

Where server-only code goes.

Pure helpers that run on both sides.

Components that are not bound to one model.

The hooks and helpers the framework itself ships.

## Code Examples

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

