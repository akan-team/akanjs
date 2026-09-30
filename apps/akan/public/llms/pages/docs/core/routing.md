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
- Chain Stages (#chain-stages)
- Layout File Shape (#layout-module)
- Root Layout Stages (#root-layout-exports)
- Google Analytics (#google-analytics)
- Base Paths (#base-paths)
- Library Pages (#library-pages)
- Dev Only Routes (#dev-only-routes)

## Content

File Based Routing

Akan uses file-based routing. You create files under page/, and the folder structure becomes the page URL. Every route also sits under a locale segment that Akan injects for you, so the same file serves every language you ship.

From folder to URL

(user) adds no segment

Akan injects the locale

File-based

Folders and files decide the URL shape.

Locale-aware

Akan injects the locale segment automatically and hands it to every route as lang.

Explicit files

Use page and layout files instead of hidden magic.

File Convention

A route file is a page, a layout, or an overrides manifest. Everything under page/ must be a .tsx route module — no helper file, no logic file, no filename starting with an uppercase letter.

File

- folder/_index.tsx: The page for the folder it sits in: project/_index.tsx serves /:lang/project.

- folder/_layout.tsx: Wraps every page below its folder. The root one is a rootLayout() chain.

- folder/_overrides.tsx: A logic-free manifest of UI overrides for the subtree: one export default override({ … }).

- path.tsx: A segment as one file: project.tsx serves /:lang/project. Never an uppercase first letter.

- [param].tsx: A dynamic segment as one file: [projectId].tsx serves /:lang/:projectId.

- (group)/: Organizes files without adding a URL segment, such as (user) or (public).

- [lang]/: Never written: Akan injects the locale.

- robots.txt.tsx: The one route outside the locale: it serves /robots.txt, not /:lang/robots.txt.

_index.tsx, _layout.tsx and _overrides.tsx are the only reserved names an underscore may introduce.

Page File Shape

A page file exports a single page() chain and nothing else. Each route setting is one stage of the chain: .param() and .search() declare the values the page reads, .config() tunes the route, .head() and .loading() set the head tags and the loading fallback, and .render() returns the component. The render callback receives the declared values flat, already typed.

Heads are not merged — the nearest .head() wins, so restate what you still need (such as the favicon link). Give <title> one string child, a template literal when it includes a value, and skip the hreflang alternates since Akan adds one per locale. A page() chain must be the module's only export, and the names in .param() and .prompt() are string literals.

Chain Stages

There are fifteen stages, and the three chains share most of them. page() adds .prompt(); layout() adds .notFound() and .error(); rootLayout() is a layout that also carries the app-wide stages. The three columns mark which builder each stage is legal on.

Stage

- Every chain

  - .param: Declares one [x] path segment, typed; a value the type refuses answers not-found. — (name, Type)

  - .search: An optional query key; [String] reads a list, and a value the type refuses is dropped. — (key, Type)

  - .config: Client frame behaviour such as transition and devOnly; child pages inherit a layout's. — ({ … })

  - .head: The route's <head> as JSX (title, meta, link), or a function of the args that returns it. — (jsx | fn)

  - .loading: Fallback UI while the route loads; every .search() value reads undefined inside it. — (fn)

- page() only

  - .prompt: Publishes the screen as an MCP prompt: .param() args are required, .search() optional. — (name, desc)

- layout() and rootLayout()

  - .notFound: 404 UI rendered inside the layout when a child route is missing; takes raw route props. — (fn)

  - .error: SSR error UI under the nearest layout when a child throws; raw props, error and digest. — (fn)

- rootLayout() only

  - .fonts: Registers app-wide fonts; optimize subsets a font and serves it from /_akan/fonts. — ([…])

  - .manifest: The web app manifest (name, startUrl, icons…) for installable, PWA-like behaviour. — ({ … })

  - .theme: The document's default theme (dark, light, system); an empty string is honoured. — (name)

  - .reconnect: The connection-lost overlay only, not reconnection; off unless you set it. — (on)

  - .wsConnect: Connects the WebSocket on load (default true); false waits for fetch.instance.connect(). — (on)

  - .layoutStyle: The outer page container style, web or mobile. Use mobile for app-like shells. — (style)

- Ends the chain

  - .render: The component, ending the chain; gets lang, the declared args, and children on a layout. — (fn)

required

{num} stages

Available on this chain

Not on this chain

On rootLayout(), the app-wide stages must come before .param() and .search(). Those two stages return a layout type rather than the chain's own type, so .theme() and its siblings are gone from what follows them — rootLayout().theme("dark").param("orgId", ID) compiles and the reverse order does not.

lang is never declared. Every route sits under the locale, and the value reaches every stage as lang. A page must declare every [x] segment of its path; a layout may leave some undeclared.

Layout File Shape

A layout file wraps child pages. Use it for shared headers, tabs, sidebars, guards, or page-level shells. Its own .head() covers child pages that declare none, and its .notFound() and .error() are the fallback for everything below it.

Layouts wrap the page

The root layout wraps every layout below it, each layout wraps the pages under its folder, and the page renders innermost.

The .notFound() and .error() stages exist on layout(), not on page(). If a layout declares neither, Akan walks up to the nearest parent layout fallback, then falls back to the framework system page.

Root Layout Stages

The root _layout.tsx of an app, or of a basePath, is a rootLayout() chain. It is still a layout, but it also carries the app-wide stages for fonts, manifest, theme, realtime connection, and mobile-style rendering. The stylesheet import stays the first line of the file.

Each of these is one row of the Chain Stages table above, and only .fonts(), .manifest(), .theme(), .reconnect(), .wsConnect() and .layoutStyle() are exclusive to this file. Everything else here — .config(), .head(), .loading(), .notFound(), .error(), .render() — is the ordinary layout surface.

Google Analytics

Akan has no analytics stage. Which tags load, in which environment and behind which consent banner are the app's decisions, so a tag is an ordinary client component that the root layout renders. The one below loads gtag.js once for the whole app.

Base Paths

When an app defines base paths in akan.config.ts, page files must live under one of those base path folders. This keeps multi-service or multi-domain apps explicit.

If base paths are configured, putting a page directly under page/ is invalid. Move it under page/<basePath>/ so Akan can tell which route group owns it.

Library Pages

A library can ship routes from its own page folder. An app opts in with syncPageLibs, and a library route keeps its own path.

Apps with base paths get the library routes under every base path.

Dev Only Routes

.config({ devOnly: true }) keeps a route out of akan build. It still serves under akan start and is still typechecked, but nothing about it reaches production: no bundle, no route manifest entry, no URL.

On a _layout file, devOnly removes every route under that directory too, so a whole dev-only section can be marked once. Write it as a literal true or false.

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
│           ├── _overrides.tsx
│           └── _index.tsx
└── robots.txt.tsx
```

### page/(user)/project/[projectId]/_index.tsx

```ts
import { ID } from "akanjs/base";
import { page } from "akanjs/client";

export default page()
  .param("projectId", ID, { desc: "The project to open." })
  .search("tab", String, { desc: "Which tab opens first." })
  .config({ transition: "stack" })
  .head(({ projectId }) => (
    <>
      <title>{`Project ${projectId}`}</title>
      <meta name="description" content="Project workspace" />
    </>
  ))
  .loading(() => <div>Loading...</div>)
  .render(({ projectId, tab }) => {
    return (
      <div>
        Project {projectId} ({tab ?? "overview"})
      </div>
    );
  });
```

### Static head example

```ts
import { page } from "akanjs/client";

export default page()
  .head(
    <>
      <title>Projects</title>
      <meta name="description" content="Browse your projects" />
      <meta property="og:title" content="Projects" />
      <meta property="og:image" content="/og/projects.png" />
      <meta name="twitter:card" content="summary_large_image" />
      <link rel="canonical" href="https://example.com/projects" />
    </>,
  )
  .render(() => <div>Projects</div>);
```

### page/(user)/project/[projectId]/_layout.tsx

```ts
import { ID } from "akanjs/base";
import { layout } from "akanjs/client";

export default layout()
  .param("projectId", ID)
  .loading(() => <div>Loading project...</div>)
  .notFound(({ pathname }) => <div>Project route not found: {pathname}</div>)
  .error(() => <div>Project failed to render.</div>)
  .render(({ children, projectId }) => {
    return (
      <section>
        <nav>Project {projectId}</nav>
        {children}
      </section>
    );
  });
```

### page/_layout.tsx

```ts
import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .fonts([
    {
      name: "pretendard",
      default: true,
      paths: [{ src: "/fonts/pretendard.woff2", weight: 400 }],
    },
  ])
  .manifest({
    name: "Akan App",
    shortName: "Akan",
    startUrl: "/",
    display: "standalone",
    themeColor: "#111827",
  })
  .theme("dark")
  .reconnect(true)
  .wsConnect(true)
  .layoutStyle("web")
  .head(
    <>
      <title>Akan App</title>
      <link rel="icon" href="/favicon.ico" />
    </>,
  )
  .render(({ children }) => children);
```

### ui/Analytics.tsx

```ts
"use client";
import { useEffect } from "react";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

interface AnalyticsProps {
  measurementId: string;
}
export const Analytics = ({ measurementId }: AnalyticsProps) => {
  useEffect(() => {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag() {
      // biome-ignore lint/complexity/noArguments: gtag.js reads only an Arguments object off dataLayer, never an array
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", measurementId);
  }, [measurementId]);
  return <script async src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} />;
};
```

### page/_layout.tsx

```ts
import "./styles.css";
import { Analytics } from "@apps/myapp/ui";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .theme("dark")
  .head(<title>My App</title>)
  .render(({ children }) => (
    <>
      <Analytics measurementId="G-XXXXXXXXXX" />
      {children}
    </>
  ));
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

### apps/myapp/akan.config.ts

```ts
const config = {
  // true: every lib dependency that has a page folder
  // ["shared"]: only the libs listed
  // false (default): nothing is synced
  syncPageLibs: ["shared"],
};
```

### library route mapping

```bash
# Source in a library
libs/shared/page/login/_index.tsx

# Browser request
/login
```

### page/(dev)/playground/_index.tsx

```ts
import { page } from "akanjs/client";

export default page()
  .config({ devOnly: true })
  .render(() => <div>Component playground</div>);
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

