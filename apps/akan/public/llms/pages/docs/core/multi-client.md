# Multi Client

- Source: /docs/core/multi-client
- Mirror: /llms/pages/docs/core/multi-client.md
- Section: docs
- Category: Core Concepts
- Priority: P0

## Headings

- Multi Client (#multi-client)
- Route Config (#route-config)
- When To Use (#when-to-use)
- Page Structure (#page-structure)
- Local And Production (#local-production)
- CSR And Mobile Builds (#csr-mobile)

## Content

Multi Client

Akan can serve multiple web clients from one app by splitting pages with basePath. Each client gets its own first path segment during local development, but in production the matching domain can hide that segment and serve it as a separate site.

Multi web

Each basePath can behave like its own website.

Single backend

All clients still share the same app server, domain modules, and services.

Separate builds

CSR web and mobile apps can be prepared per basePath.

Route Config

Define clients in akan.config.ts with routes. The basePath names the client, and domains decide which production host should open that client.

The first page folder and the client boundary. For basePath: store, pages live under page/store.

Production domains that should open this basePath. When the domain matches, users see the site without the basePath segment.

When To Use

Use basePath when the business wants to operate separate client surfaces from one app. The codebase and backend stay together, but each client can have its own domain, entry page, build output, and app package.

Use basePath

Use it for surfaces that are sold, deployed, or accessed as separate products, even if they share the same domain logic and backend services.

Use normal routing

Use it for pages that are just sections inside the same client, such as account settings, dashboards, tabs, or grouped screens.

Customer-facing site and admin

A store site and an admin console often share products, orders, users, and permissions. Split them with basePath when they need different domains, layouts, or release targets.

Different customer groups

For example, a consumer client, partner portal, and internal staff tool can all use the same backend while presenting different home screens and navigation.

Separate mobile apps

If Android and iOS packages must be released separately per brand, region, or user type, each mobile target can point to a different basePath.

White-label or regional sites

When several sites share business rules but need different domains, names, or first screens, basePath keeps them separate without creating multiple apps.

Page Structure

When routes define base paths, every page file must be placed under one of those first folders. Pages directly under page/ are invalid because Akan cannot assign them to a client.

In local development, you open each client with its basePath, such as /store or /admin. After deployment, a configured domain can open that same client without showing the basePath in the URL.

Rule: once basePath is declared, pages outside page/basePath/ are not allowed. Akan raises an error instead of routing them.

Local And Production

The same app can feel different depending on where it runs. Locally, basePath is visible so developers can move between clients in one web server. In production, domains can map directly to each client.

Local development

Production domains

CSR And Mobile Builds

When the app is built, Akan can prepare CSR web output per basePath. Mobile targets can also point to a basePath, so Android and iOS apps can open the right client from the same backend.

This is the main idea: multi web and multi app clients, but one Akan app, one server runtime, and one backend domain model.

## Code Examples

### apps/myapp/akan.config.ts

```ts
const config = {
  routes: [
    { domains: { main: ["store.example.com"] }, basePath: "store" },
    { domains: { main: ["admin.example.com"] }, basePath: "admin" },
    { domains: {}, basePath: "partner" },
    { domains: {}, basePath: "demo" },
  ],
};
```

### page/

```bash
page/
├── store/
│   ├── _layout.tsx
│   ├── _index.tsx
│   └── products/
│       └── _index.tsx
├── admin/
│   ├── _layout.tsx
│   └── users.tsx
└── partner/
    ├── _layout.tsx
    └── (public)/
        └── signin.tsx
```

### Code

```bash
http://localhost:8282/store
http://localhost:8282/admin
http://localhost:8282/partner
```

### Code

```bash
https://store.example.com  -> store
https://admin.example.com  -> admin
https://partner-main.example.com -> partner
```

### Mobile targets

```ts
const config = {
  routes: [
    { domains: { main: ["store.example.com"] }, basePath: "store" },
    { domains: { main: ["admin.example.com"] }, basePath: "admin" },
  ],
  mobile: {
    appName: "Example App",
    appId: "com.example.app",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      store: {
        basePath: "store",
        appName: "Example Store",
        appId: "com.example.store",
      },
      admin: {
        basePath: "admin",
        appName: "Example Admin",
        appId: "com.example.admin",
      },
    },
  },
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

