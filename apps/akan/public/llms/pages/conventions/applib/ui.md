# Components (ui/)

- Source: /conventions/applib/ui
- Mirror: /llms/pages/conventions/applib/ui.md
- Section: conventions
- Category: App & Library
- Priority: P1

## Headings

- UI Folder Overview (#ui-overview)
- Recommended Shape (#recommended-shape)
- Import From The Barrel (#barrel-optimization)
- Composite Components (#composite-components)
- Practical Rules (#practical-rules)

## Content

Components (ui/)

A folder's `index.ts` that re-exports its files, so callers import one path: `@apps/myapp/ui`.

The first line that makes a file a client component. Without it, a component renders on the server.

namespace component

Several components exported as one object, used as `Only.Web` or `Chart.Bar`.

sidecar

A camelCase helper or type file that serves one component, like `swipeCard.util.ts`.

Draws JSX or defines a look, bound to no model — ui/

landing hero · admin header

Belongs to one app, so it lives in `apps/<app>/ui`.

An auth gate or responsive wrapper several apps share, so it lives in `libs/<lib>/ui`.

Wraps a third-party package that pages and module files may not import directly.

A look several screens share. Not a component or a hook, but it lives in `ui/Recipe/`.

Goes somewhere else

a card for one order

It is bound to a model, so it is `Order.Unit.tsx` in `lib/order/`.

A hook or browser helper with no markup of its own.

One component per file, and the file name is the export name. PascalCase.

A sidecar in camelCase with a role suffix. Only its component imports it, by relative path.

A namespace component. You write this `index.tsx` yourself, with no "use client".

The "use client" + `lazy()` half of a heavy component, next to a server-safe `index.tsx`.

Tailwind-variant looks such as `panelRecipe`, one per file, re-exported from `Recipe/index.ts`.

Libs only. `:root` colors that must not follow the theme, used as `bg-[var(--kakao)]`.

The barrel. It is written for you, so never edit it by hand.

File in ui/

How to use it

`import { AutoClose } from "@apps/myapp/ui"`

`import { Only } from "@libs/shared/ui"`, then `<Only.Web>`.

`import { panelRecipe } from "@apps/myapp/ui"`, through `Recipe/index.ts`.

Not in the barrel. `SwipeCard.tsx` imports it as `./swipeCard.util`.

Mistake

Fix

"use client" on a component that only renders markup

Delete it unless the file uses a hook, handler, the store, a browser global or client-only package.

A card that takes one `Order` in `ui/`

Move it to `lib/order/Order.Unit.tsx`.

Importing a component by its file path

Use `@apps/myapp/ui`, not `@apps/myapp/ui/AutoClose`. The deep path fails lint.

Adding a line to `ui/index.ts` by hand

Leave it. Add, rename or delete the component file instead.

Building `Only = { … }` in a "use client" file

Build the object in a directive-free `index.tsx`.

An `async` component in `ui/`

Await in the page and pass the result down as a prop.

Importing a third-party package in a page or `*.Unit.tsx`

Wrap it in a lib `ui/` component and import that.

The same card classes copied into many files

Add one recipe in `ui/Recipe/` and call it everywhere.

UI Folder Overview

App UI

Components one app owns, such as an admin header, a landing hero, a dashboard widget or an app-only interaction. Keep the folder shallow.

Library UI

Components several apps share, such as auth gates, responsive wrappers, editor pieces or common form fields.

Words used on this page

Term

Does it belong in ui/?

Ask two questions: does it draw JSX or define a look, and does it take one model? Yes, then no, means ui/.

Code

Goes here

Not here

Recommended Shape

Entry

A server component by default

When it needs the browser

Import From The Barrel

What each kind of file in ui/ turns into at the import site:

Composite Components

A page imports the one name and picks a member:

Heavy components: the index_.tsx pair

Practical Rules

Common mistakes

Related pages

What Earns A Client Component

The five features that need "use client", and everything that does not.

Lazy Loading

The `index_.tsx` pair step by step, with a map widget.

App-Level Recipes

How to add a look to `ui/Recipe/` instead of copying classes.

Where a component that takes one model goes instead.

## Code Examples

### apps/myapp/ui

```bash
apps/myapp/ui/
├── AutoClose.tsx
├── HomeHeader.tsx
├── SwipeCard.tsx
├── swipeCard.util.ts
├── Only/
│   ├── index.tsx
│   └── Web.tsx
├── Recipe/
│   ├── index.ts
│   └── panel.ts
└── index.ts
```

### apps/myapp/ui/HomeHeader.tsx

```ts
import { cn } from "akanjs/client";
import type { ReactNode } from "react";

interface HomeHeaderProps {
  className?: string;
  title: ReactNode;
  right?: ReactNode;
}
export const HomeHeader = ({ className, title, right }: HomeHeaderProps) => {
  return (
    <header className={cn("flex justify-between py-4", className)}>
      <h1 className="font-bold text-2xl">{title}</h1>
      {right}
    </header>
  );
};
```

### apps/myapp/ui/AutoClose.tsx

```ts
"use client";
import { useEffect } from "react";

interface AutoCloseProps {
  timeout?: number;
}
export const AutoClose = ({ timeout = 0 }: AutoCloseProps) => {
  useEffect(() => {
    const timer = setTimeout(() => window.close(), timeout);
    return () => clearTimeout(timer);
  }, [timeout]);
  return null;
};
```

### apps/myapp/page/signin/done.tsx

```ts
import { AutoClose } from "@apps/myapp/ui";
import { page } from "akanjs/client";

export default page().render(() => <AutoClose timeout={1000} />);
```

### libs/shared/ui/Only/Web.tsx

```ts
"use client";
import { st } from "@libs/shared/client";
import type { ReactNode } from "react";

interface WebProps {
  children: ReactNode;
}
export const Web = ({ children }: WebProps) => {
  const innerWidth = st.use.innerWidth({ agent: false });
  return innerWidth > 768 ? children : null;
};
```

### libs/shared/ui/Only/index.tsx

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

### apps/myapp/page/_index.tsx

```ts
import { usePage } from "@apps/myapp/client";
import { HomeHeader } from "@apps/myapp/ui";
import { Only } from "@libs/shared/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();
  return (
    <Only.Web>
      <HomeHeader title={l.trans({ en: "Welcome", ko: "환영합니다" })} />
    </Only.Web>
  );
});
```

### libs/util/ui/Chart/index_.tsx

```ts
"use client";
import { Loading } from "akanjs/ui";
import { lazy } from "akanjs/webkit";

export const Bar = lazy(() => import("./Bar"), {
  ssr: false,
  loading: () => <Loading.Skeleton />,
});
export const Line = lazy(() => import("./Line"), {
  ssr: false,
  loading: () => <Loading.Skeleton />,
});
```

### libs/util/ui/Chart/index.tsx

```ts
import { Bar, Line } from "./index_";

export const Chart = { Bar, Line };
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

