# File Based Routing

- Source: /docs/core/routing
- Mirror: /llms/pages/docs/core/routing.md
- Section: docs
- Category: Core Concepts
- Priority: P0

## Headings

- File Based Routing (#file-based-routing)
- File Convention (#file-convention)
- Page File Shape (#page-module)
- Layout File Shape (#layout-module)
- Base Paths (#base-paths)
- Root Layout Exports (#root-layout-exports)

## Content

File Based Routing

Akan uses file-based routing. You create files under page/, and the folder structure becomes the page URL. Most pages also get a language parameter automatically, so the same file can serve localized URLs.

How files become routes

Page file

The index file becomes the route endpoint.

Layout file

The layout wraps pages below the same folder.

Route group

Parentheses organize files without adding a URL segment.

File-based

Folders and files decide the URL shape.

Locale-aware

Akan injects [lang] automatically.

Explicit files

Use page and layout files instead of hidden magic.

File Convention

A route file can be a page or a layout. _index.tsx renders the current segment, _layout.tsx wraps child segments, and route groups organize files without changing the URL.

Page for the folder it lives in.

Layout that wraps child pages below it.

Organizes files without adding a URL segment.

Single-file page for a path segment. project.tsx becomes /:lang/project.

Single-file dynamic page. [projectId].tsx becomes /:lang/:projectId.

Page File Shape

A page file must export a default component. It can also export optional helpers for page options, metadata, and loading UI.

The page component. This is required.

Client page options such as transition or mobile safe-area behavior.

Static metadata for the page.

Dynamic metadata that can use route params.

Fallback UI shown while the page is loading.

Use either head or generateHead, not both. Use head for fixed metadata and generateHead when the title or tags depend on params.

Layout File Shape

A layout file wraps child pages. Use it for shared headers, tabs, sidebars, guards, or page-level shells.

Layouts support default, head, generateHead, Loading, NotFound, and Error. Layout's head is used for child pages without head declaration, and the nearest layout fallback renders when a child route is missing or fails.

Layout-scoped 404 UI. It renders under the layout when a child route is missing or router.notFound() is called below it.

Layout-scoped server render error UI. It renders under the nearest layout when a child route throws during SSR.

Custom NotFound and Error exports are available on _layout.tsx files, not page files. If a layout does not export one, Akan walks up to the nearest parent layout fallback, then falls back to the framework system page.

Base Paths

When an app defines base paths in akan.config.ts, page files must live under one of those base path folders. This keeps multi-service or multi-domain apps explicit.

If base paths are configured, putting a page directly under page/ is invalid. Move it under page/<basePath>/ so Akan can tell which route group owns it.

Root Layout Exports

The root _layout.tsx can configure app-wide behavior. It is still a layout, but it may also export extra values for fonts, manifest, theme, realtime connection, analytics, and mobile-style rendering.

Registers app-wide fonts so pages can use them consistently.

Defines the web app manifest used for installable/PWA-like behavior.

Chooses the default theme policy, such as dark, light, system, or css.

Controls whether the client tries to reconnect to realtime runtime channels.

Controls whether the browser connects the client WebSocket runtime after load. The default is true. If false, message/pubsub calls warn in the browser console until fetch.instance.connect() is called.

Switches the outer page container style. Use mobile for app-like mobile shells.

Adds Google Analytics tracking for the app.

These extra exports are for root layouts only. Normal nested layouts should stay focused on default, head, generateHead, and Loading.

## Code Examples

### page/

```bash
page/
├── _layout.tsx
├── _index.tsx
├── (public)/
│   └── signin.tsx
│   └── signup.tsx
├── (user)/
│   └── project/
│       └── [projectId]/
│           ├── _layout.tsx
│           └── _index.tsx
└── robots.txt.tsx
```

### page/(user)/project/[projectId]/_index.tsx

```ts
import type { PageConfig } from "akanjs/client";

interface PageProps {
  params: { lang: string; projectId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

export default function Page({ params }: PageProps) {
  return <div>Project {params.projectId}</div>;
}

export const pageConfig = { transition: "stack" } satisfies PageConfig;

export function generateHead({ params }: PageProps) {
  return { title: `Project ${params.projectId}` };
}

export function Loading() {
  return <div>Loading...</div>;
}
```

### Static head example

```ts
export const head = {
  title: "Projects",
  description: "Browse your projects",
};
```

### page/(user)/project/[projectId]/_layout.tsx

```ts
interface LayoutProps {
  children: React.ReactNode;
  params: { projectId: string };
}

export default function Layout({ children, params }: LayoutProps) {
  return (
    <section>
      <nav>Project {params.projectId}</nav>
      {children}
    </section>
  );
}

export function Loading() {
  return <div>Loading project...</div>;
}

export function NotFound({ pathname }: { pathname: string }) {
  return <div>Project route not found: {pathname}</div>;
}

export function Error({ error }: { error?: unknown }) {
  return <div>Project failed to render.</div>;
}
```

### apps/myapp/akan.config.ts

```ts
const config = {
  routes: [
    { domains: { main: ["manager.myapp.com"] }, basePath: "manager" },
    { domains: { main: ["admin.myapp.com"] }, basePath: "admin" },
  ],
};
```

### page/

```bash
page/
├── manager/
│   └── _index.tsx
└── admin/
    └── _index.tsx
```

### page/_layout.tsx

```ts
import type { Font, LayoutProps, WebAppManifest } from "akanjs/client";

export const fonts: Font[] = [
  {
    name: "pretendard",
    faces: [{ src: "/fonts/pretendard.woff2", weight: "400" }],
  },
];

export const manifest: WebAppManifest = {
  name: "Akan App",
  shortName: "Akan",
  startUrl: "/",
  display: "standalone",
  themeColor: "#111827",
};

export const theme = "dark";
export const reconnect = true;
export const wsConnect = true;
export const layoutStyle = "web";
export const gaTrackingId = "G-XXXXXXXXXX";

export default function Layout({ children }: LayoutProps) {
  return <>{children}</>;
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

