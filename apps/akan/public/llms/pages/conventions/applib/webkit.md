# Web Utils (webkit/)

- Source: /conventions/applib/webkit
- Mirror: /llms/pages/conventions/applib/webkit.md
- Section: conventions
- Category: App & Library
- Priority: P1

## Headings

- Webkit Overview (#webkit-overview)
- What Belongs In Webkit (#what-belongs)
- Barrel, Optimized Import, And Shape (#barrel-optimization)
- Practical Rules (#practical-rules)

## Content

Web Utils (webkit/)

Webkit Overview

The webkit folder contains reusable code needed during web rendering. It is similar to srvkit, but it is for browser-side or web-rendering logic instead of server-only logic.

Use it for render maps, browser helpers, web hooks, and wrappers around browser libraries. Pages can then import from the webkit barrel instead of carrying complex logic directly.

What Belongs In Webkit

Render maps

Static maps used during rendering, such as status colors, badges, icons, labels, or page display options.

Browser helpers

Small browser actions such as downloading a file, reading cookies, opening a share link, or copying text.

Web hooks

Reusable browser hooks for notifications, messaging, viewport state, permission checks, or browser APIs.

External web wrappers

Wrappers around browser libraries so pages do not import vendor packages directly.

Routing/account helpers

Web helpers that read account state or route users during rendering.

Barrel, Optimized Import, And Shape

The webkit folder is a barrel folder like ui. Export web helpers from index.ts, then import from the barrel. Akan can optimize imports so the page includes only the webkit files it actually uses.

Prefer one file, one export, and file name equals export name. This keeps the barrel predictable and helps optimized imports stay precise.

Practical Rules

Use webkit for web-rendering logic that is not itself a reusable UI component.

Use srvkit for server-only code, and webkit for browser or web-rendering code.

Import from the webkit barrel instead of deep paths so optimized import can work.

Keep file names and export names aligned, such as downloadFile.ts exporting downloadFile.

## Code Examples

### webkit/downloadFile.ts

```ts
"use client";

import { saveAs } from "file-saver";

export const downloadFile = async (url: string, filename: string) => {
  const res = await window.fetch(url, { method: "GET" });
  saveAs(await res.blob(), filename);
};
```

### webkit/index.ts

```ts
export { downloadFile } from "./downloadFile";
```

### page.tsx

```ts
import { downloadFile } from "@libs/shared/webkit";

export function DownloadButton() {
  return <button onClick={() => downloadFile("/invoice.pdf", "invoice.pdf")}>Download</button>;
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

