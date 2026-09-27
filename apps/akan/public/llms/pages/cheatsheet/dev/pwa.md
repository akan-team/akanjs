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

Static JSON File

Keys

Standard snake_case, exactly what the browser reads.

Linked by

Pick it when

Designers or operators need to review the JSON directly.

.manifest() Object

camelCase, converted to snake_case for you.

You want TypeScript help and app metadata in one place.

PWA alone

Native too

Good fit

Daily workflow

Users return to the same flow every day: office tasks, approvals, reports or checklists.

No app store first

One deployed web app covers desktop and mobile before any app-store release.

Be careful

Deep native features

The core of the product needs device features the browser does not expose.

Heavy background work

The app has to do heavy work while it is not on screen.

App-store presence

Being listed in the app stores is a hard requirement.

Full app name shown in the install dialog and the app list.

Short name shown under the home-screen icon.

One-line description of the app.

The page the installed app opens first.

The URLs that stay inside the installed app window.

How the window opens; `standalone` hides the browser toolbar.

Display modes to try in order before `display`.

Default screen orientation, such as `portrait`.

Color of the title bar and system UI around the app.

Background of the splash screen shown while the app loads.

Language of text values such as `name` and `description`, for example `ko`.

Text direction of those same text values.

App icons; each entry takes `src`, plus optional `sizes`, `type` and `purpose`.

Categories that describe the app, such as `business`.

Images for richer install dialogs, in the same shape as `icons`.

Any other member, such as `shortcuts` or `id`, passes through with its keys converted.

Good first sizes for install prompts; Chrome needs at least one icon of 144px or larger.

The page the installed app opens at launch, so it must load on the deployed app.

Limits which URLs belong to the installed app window.

Opens the app without the normal browser toolbar.

Root Layout Stages

Base Paths

How one app serves several services under separate page folders.

Mobile Setup

Build the same app as a native iOS and Android app with the @akanjs/native runtime.

A PWA (Progressive Web App) runs in the browser but can be installed and launched like an app. The browser adds the icon, the app window without a toolbar, and the install prompt.

When it helps.

Users open the same web app again and again, and a home-screen or desktop launcher saves them time.

Typical apps.

Admin tools, field-work apps, internal dashboards, lightweight commerce apps and content apps.

Where it starts.

A web app manifest that tells the browser the app's name, icon, start URL, display mode and colors.

Add It In Three Steps

Deploy, check that every URL in the manifest loads, then test installation.

Two Ways To Declare It

When To Use PWA

A PWA makes a web app easier to come back to. It does not replace every native app, but it is a strong first choice when shipping on the web fast matters and the app needs no deep device APIs.

Situation

Applies

Does not apply

In the three careful cases, plan a native wrapper or a native app next to the PWA.

Static Manifest File

Standard keys.

A real URL.

Layout Manifest Object

camelCase in, snake_case out.

No file to serve.

Root layout only.

Keys You Can Write

Required Assets

Before testing installation, make sure every URL in the manifest loads on the deployed app. These are the ones to check first:

File or key

Tips

Start simple.

Under a base path.

Pick one method.

Test over HTTPS.

Browsers offer installation only on HTTPS or localhost. Chrome DevTools → Application → Manifest shows what the browser parsed and why it will not install.

Read next

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

