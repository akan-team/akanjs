# PWA

- Source: /cheatsheet/dev/pwa
- Mirror: /llms/pages/cheatsheet/dev/pwa.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- PWA (#overview)
- When To Use PWA (#when-to-use)
- Static Manifest File (#static-manifest)
- Layout Manifest Object (#layout-manifest)
- Required Assets (#assets)
- Tips (#tips)

## Content

PWA

A PWA (Progressive Web App) runs in the browser but can be installed and launched like an app. The browser adds the icon, the app window without a toolbar, and the install prompt.

When it helps.

Users open the same web app again and again, and a home-screen or desktop launcher saves them time.

Typical apps.

Admin tools, field-work apps, internal dashboards, lightweight commerce apps and content apps.

Where it starts.

A web app manifest that tells the browser the app's name, icon, start URL, display mode and colors.

Add It In Three Steps

Put the icons in `apps/<app>/public/`. That folder is served from the site root, so `public/icon-192x192.png` loads as `/icon-192x192.png`.

Declare the manifest in one of two ways: a static `manifest.json` linked from `.head()`, or `rootLayout().manifest({...})`.

Deploy, check that every URL in the manifest loads, then test installation.

Two Ways To Declare It

- Static JSON File — apps/<app>/public/manifest.json

  - Keys — Standard snake_case, exactly what the browser reads.

  - Linked by — A `<link rel="manifest">` you write in `.head()`.

  - Pick it when — Designers or operators need to review the JSON directly.

- .manifest() Object — apps/<app>/page/_layout.tsx

  - Keys — camelCase, converted to snake_case for you.

  - Linked by — A `data:` URL link Akan adds to the head, so no file is served.

  - Pick it when — You want TypeScript help and app metadata in one place.

When To Use PWA

A PWA makes a web app easier to come back to. It does not replace every native app, but it is a strong first choice when shipping on the web fast matters and the app needs no deep device APIs.

Situation

PWA alone

Native too

- Good fit

  - Daily workflow: Users return to the same flow every day: office tasks, approvals, reports or checklists.

  - No app store first: One deployed web app covers desktop and mobile before any app-store release.

- Be careful

  - Deep native features: The core of the product needs device features the browser does not expose.

  - Heavy background work: The app has to do heavy work while it is not on screen.

  - App-store presence: Being listed in the app stores is a hard requirement.

Applies

Does not apply

In the three careful cases, plan a native wrapper or a native app next to the PWA.

Static Manifest File

Use this when you already have a `manifest.json` or want to edit the exact JSON the browser reads. First, put the file in `public/`:

Then link it from `.head()` of the root `_layout.tsx`:

Standard keys.

The file is served as is, so write the browser's own snake_case keys such as `short_name` and `start_url`.

A real URL.

`public/manifest.json` is served at `/manifest.json`, so you can open it in the browser to check it.

Layout Manifest Object

`rootLayout().manifest({...})` keeps the manifest in app code instead of a separate JSON file. Write the keys in camelCase:

camelCase in, snake_case out.

`shortName`, `startUrl` and `themeColor` reach the browser as the standard `short_name`, `start_url` and `theme_color`, at every depth.

No file to serve.

The object becomes a `<link rel="manifest">` in the head whose `href` is a `data:` URL, so there is no `/manifest.json` to open.

Root layout only.

`.manifest()` is a `rootLayout()` stage, so it goes in the app's (or a base path's) root `_layout.tsx`.

Keys You Can Write

The argument is typed as `WebAppManifest` from `akanjs/client`. Every key is optional.

- name (string): Full app name shown in the install dialog and the app list.

- shortName (string): Short name shown under the home-screen icon.

- description (string): One-line description of the app.

- startUrl (string): The page the installed app opens first.

- scope (string): The URLs that stay inside the installed app window.

- display ("fullscreen" | "standalone" | "minimal-ui" | "browser"): How the window opens; `standalone` hides the browser toolbar.

- displayOverride (string[]): Display modes to try in order before `display`.

- orientation (string): Default screen orientation, such as `portrait`.

- themeColor (string): Color of the title bar and system UI around the app.

- backgroundColor (string): Background of the splash screen shown while the app loads.

- lang (string): Language of text values such as `name` and `description`, for example `ko`.

- dir ("ltr" | "rtl" | "auto"): Text direction of those same text values.

- icons (WebAppManifestIcon[]): App icons; each entry takes `src`, plus optional `sizes`, `type` and `purpose`.

- categories (string[]): Categories that describe the app, such as `business`.

- screenshots (WebAppManifestIcon[]): Images for richer install dialogs, in the same shape as `icons`.

- [key: string] (unknown): Any other member, such as `shortcuts` or `id`, passes through with its keys converted.

Required Assets

Before testing installation, make sure every URL in the manifest loads on the deployed app. These are the ones to check first:

File or key

- /icon-192x192.png, /icon-512x512.png: Good first sizes for install prompts; Chrome needs at least one icon of 144px or larger.

- startUrl: The page the installed app opens at launch, so it must load on the deployed app.

- scope: Limits which URLs belong to the installed app window.

- display: "standalone": Opens the app without the normal browser toolbar.

Tips

Start simple.

Ship one minimal manifest first. Add `screenshots`, `categories` or `shortcuts` once installation works.

Under a base path.

Set `startUrl` and `scope` to that path instead of `/`. A base path's root `_layout.tsx` with no `.manifest()` of its own uses the app root's.

Pick one method.

With both, the page carries two `<link rel="manifest">` tags and the browser reads only the first.

Test over HTTPS.

Browsers offer installation only on HTTPS or localhost. Chrome DevTools → Application → Manifest shows what the browser parsed and why it will not install.

Read next

- Root Layout Stages — Every stage only the root layout takes, next to `.manifest()`.

- Base Paths — How one app serves several services under separate page folders.

- Mobile Setup — Build the same app as a native iOS and Android app with the @akanjs/native runtime.

## Code Examples

### apps/myapp/public/manifest.json

```ts
{
  "name": "My Akan App",
  "short_name": "MyApp",
  "description": "A simple Akan app",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0C1E3E",
  "background_color": "#ffffff",
  "icons": [
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### apps/myapp/page/_layout.tsx

```ts
import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .head(
    <>
      <title>My Akan App</title>
      <link rel="icon" href="/favicon.ico" />
      <link rel="manifest" href="/manifest.json" />
    </>,
  )
  .render(({ children }) => children);
```

### apps/myapp/page/_layout.tsx

```ts
import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .manifest({
    name: "My Akan App",
    shortName: "MyApp",
    description: "A simple Akan app",
    startUrl: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    themeColor: "#0C1E3E",
    backgroundColor: "#ffffff",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  })
  .head(<title>My Akan App</title>)
  .render(({ children }) => children);
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

