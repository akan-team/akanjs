---
description: Route files under page/: the one chain, params, heads, guards and lib pages.
paths:
  - "{apps,libs}/**/page/**"
---

# Akan Page Routing

Full contract — guards, apps, heads, CSR root layouts, typed params, lib pages, `devOnly`: `pageRule`.

- `page/` holds `.tsx` route modules only: `<routeName>.tsx` or `_index.tsx`, `_layout.tsx`, `_overrides.tsx` — no
  other `_*.tsx`, helpers, `.ts` / `.js` files, or uppercase filenames. `[id]` is a dynamic segment, `(group)` a
  route group.
- **A route file exports one chain** — `page()`, `layout()` in a `_layout.tsx`, `rootLayout()` in a root
  `_layout.tsx` — and every setting is a stage (`.param`, `.search`, `.config`, `.guard`, `.head`, `.loading`;
  `.notFound` / `.error` on layouts; `.fonts` / `.theme` / `.manifest` / … on the root; `.prompt` / `.app` on a page).
  A named export beside it fails the build.
- **Name every `[x]` segment with `.param("x", Type)`** and read query keys only via `.search("k", Type)`; values
  arrive typed. `lang` is never declared — every stage receives it. A client filter writes its key back with
  `router.replace(href, { shallow: true })`, which keeps the page on screen.
- `.head()` takes JSX or a function returning it — never a metadata object; deeper heads replace by tag identity,
  and a canonical link / `og:url` comes only from the page's own `.head()`. A 404's title is the `<title>` a layout's
  `.notFound()` returns at its top: `.notFound(() => <><title>Not found</title>…</>)`, except below a `.loading()`.
- In a CSR bundle a root layout's own markup is hidden: what a person must see from it renders through
  `createPortal(…, document.body)`.
- `_overrides.tsx` is one `export default override({ Slot: AppComponent })` (`akanjs/ui`), no logic, no
  `"use client"`. The legacy `export default async function Page` shape is never written anew.
- `libs/<lib>/page` reaches an app through `syncPageLibs`, linked into the generated `page/(libs)/(<lib>)`; edit the
  lib source, never the link. `.config({ devOnly: true })` (a literal) keeps a route out of `akan build`.

```tsx
export default page()
  .param("orgId", ID)
  .config({ transition: "stack" })
  .guard(() => signedIn())
  .render(({ orgId }) => {
    const { l } = usePage();
    const { taskInitInOrg } = fetch.initTaskInOrg(orgId);
    return <Task.Zone.Card init={taskInitInOrg} prefix={`/org/${orgId}`} />;
  });
```

- `.render()` gets the declared args flat and typed (no `PageProps`, no `loader=` prop). Order: `usePage()`, fetch,
  return; auth is the chain's `.guard()`, which runs before anything renders. Hand `fetch.init*` / `view*` / `edit*` fields to sections unawaited; await only what the shell reads
  (title, redirect, link id) in one `Promise.all`.
- **A route never writes while it renders**: a `fetch.<mutation>()` in a stage or a component it renders throws
  `base.error.mutationInRender`, since opening a link would perform it. Send it from a user action;
  `{ duringRender: true }` only for a write harmless to repeat and safe for anyone to trigger (`ssrRule`).
- Gate auth with `.guard(() => signedIn())` (`@libs/shared/webkit`; a new workspace has that lib only with
  `create-workspace --libs true`) at `_layout.tsx`, and repeat it on a page that needs more; it is a courtesy, the
  endpoint guards are the gate. `getSelf({ unauthorize })` in a body still works. `async` only when the body awaits;
  the callback is not a React component, so it takes no name and no return type. No `useState`, `useEffect`, or
  comments in page files.

- **SSR auth-gated pages: guard at the layout.** `.guard(() => signedIn())` on the `_layout.tsx` chain answers a
  real 307 before any of it renders, so nested pages never render for signed-out users; a check in `.render()`
  after awaited I/O redirects in-page, as an HTTP 200. `signedIn()` comes from `@libs/shared/webkit`, which a new
  workspace has only with `create-workspace --libs true`.
