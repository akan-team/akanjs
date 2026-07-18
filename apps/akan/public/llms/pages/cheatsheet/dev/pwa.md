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

A PWA, or Progressive Web App, is a web app that can feel closer to an installed app. It still runs through the browser, but it can use install metadata, app icons, standalone display, and other browser features to create a more app-like experience.

Use it when users repeatedly open the same web app and benefit from a home-screen or desktop launcher.

It is useful for admin tools, field-work apps, internal dashboards, lightweight commerce apps, and content apps.

Start PWA support by telling the browser what your app is: its name, icon, start URL, display mode, and colors.

When To Use PWA

Think of PWA as a way to make a web app easier to return to. It is not a replacement for every native app, but it is a strong first choice when web deployment speed matters and the app does not need deep device-specific APIs.

Good fit: users need quick access to the same workflow every day, such as office tasks, approvals, reports, or checklists.

Good fit: you want one deployed web app to cover desktop and mobile without app-store distribution first.

Be careful: if the product depends on deep native features, heavy background work, or strict app-store presence, plan a native wrapper or native app too.

Static Manifest File

Use this when you already have a `manifest.json` file or want to edit the exact JSON that the browser reads.

Layout Manifest Object

Akan can also read a `manifest` export from the root layout. The object is converted into a manifest link for the document head.

Write author-facing keys in camelCase, such as `shortName`, `startUrl`, and `themeColor`.

Akan converts them to standard manifest keys like `short_name`, `start_url`, and `theme_color`.

This is convenient when the manifest belongs to app code instead of a standalone JSON file.

Required Assets

Before testing installation, make sure every URL in the manifest is reachable from the deployed app.

`/icon-192x192.png` and `/icon-512x512.png` are good first icon sizes for browser install prompts.

`startUrl` is the page that opens when the installed app starts.

`scope` limits which URLs belong to the installed app window.

`display: "standalone"` makes the app open without the normal browser toolbar.

Tips

Start with one simple manifest, then add screenshots, categories, or shortcuts after installation works.

If your app is served under a base path, set `startUrl` and `scope` to that path instead of `/`.

Use the static JSON file when designers or operators need to review the manifest directly.

Use the layout object when you want TypeScript help and app metadata in one place.

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
import type { LayoutProps } from "akanjs/client";

export const head = (
  <>
    <title>My Akan App</title>
    <link rel="icon" href="/favicon.ico" />
    <link rel="manifest" href="/manifest.json" />
  </>
);

export default function Layout({ children }: LayoutProps) {
  return <>{children}</>;
}
```

### apps/myapp/page/_layout.tsx

```ts
import type { LayoutProps, WebAppManifest } from "akanjs/client";

export const manifest: WebAppManifest = {
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
};

export const head = <title>My Akan App</title>;

export default function Layout({ children }: LayoutProps) {
  return <>{children}</>;
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

