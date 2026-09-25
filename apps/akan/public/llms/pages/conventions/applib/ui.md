# Components (ui/)

- Source: /conventions/applib/ui
- Mirror: /llms/pages/conventions/applib/ui.md
- Section: conventions
- Category: App & Library
- Priority: P1

## Headings

- UI Folder Overview (#ui-overview)
- Recommended Shape (#recommended-shape)
- Barrel And Optimized Import (#barrel-optimization)
- Composite Components (#composite-components)
- Practical Rules (#practical-rules)

## Content

Components (ui/)

UI Folder Overview

The ui folder contains reusable interface components for an app or library. App UI folders usually stay shallow, like @apps/myapp/ui, while libraries can expose shared components such as @libs/shared/ui.

App UI

Use for components that belong to one app, such as an admin header, landing hero, dashboard widget, or app-only interaction.

Library UI

Use for components shared by multiple apps, such as auth gates, responsive wrappers, editor pieces, or common form fields.

Recommended Shape

The recommended rule is simple: one file, one export, and file name equals export name. This keeps the barrel predictable and makes import optimization work well.

Barrel And Optimized Import

The ui folder is kept as a barrel folder. Pages import from the barrel, and Akan can optimize the import so a page only fetches the JavaScript bundle for the UI components it actually uses.

This matters in SSR. The server can render the page first, and the browser only hydrates the client components that are needed for that page instead of downloading a large shared UI bundle.

Composite Components

Some UI APIs are easier to use as a grouped object. In that case, use a folder with an index file and export one composite name from the library barrel, such as Only.Admin or Only.Web.

Practical Rules

Prefer one file, one export, and matching names such as AutoClose.tsx exporting AutoClose.

Keep app UI folders shallow unless a component is naturally a grouped API.

Import from the ui barrel, not from deep component paths, so Akan can optimize the import.

Use composite folders for APIs that read well as a namespace, such as Only.Web or Only.Admin.

## Code Examples

### apps/myapp/ui

```bash
apps/myapp/ui/
  AutoClose.tsx
  HomeHeader.tsx
```

### AutoClose.tsx

```ts
"use client";

import { useEffect } from "react";

interface AutoCloseProps {
  timeout?: number;
}

export const AutoClose = ({ timeout = 0 }: AutoCloseProps) => {
  useEffect(() => {
    setTimeout(() => window.close(), timeout);
  }, [timeout]);

  return null;
};
```

### index.ts

```ts
export { AutoClose } from "./AutoClose";
export { HomeHeader } from "./HomeHeader";
export { Metrics } from "./Metrics";
export { StepBox } from "./StepBox";
```

### page.tsx

```ts
import { AutoClose } from "@apps/myapp/ui";

export default function Page() {
  return <AutoClose timeout={1000} />;
}
```

### Only/Web.tsx

```ts
"use client";

import { st } from "@libs/shared/client";
import type { ReactNode } from "react";

interface WebProps {
  children: ReactNode;
}

export const Web = ({ children }: WebProps) => {
  const innerWidth = st.use.innerWidth();
  return innerWidth > 768 ? children : null;
};
```

### Only/index.tsx

```ts
import { Admin } from "./Admin";
import { Dev } from "./Dev";
import { Mobile } from "./Mobile";
import { Show } from "./Show";
import { User } from "./User";
import { Web } from "./Web";

export const Only = {
  Admin,
  Mobile,
  Show,
  User,
  Web,
  Dev,
};
```

### libs/shared/ui/index.ts

```ts
export { Only } from "./Only";
```

### page.tsx

```ts
import { Only } from "@libs/shared/ui";

export default function Page() {
  return <Only.Web>Desktop content</Only.Web>;
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

