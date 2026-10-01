# Multi Client

- Source: /docs/core/multi-client
- Mirror: /llms/pages/docs/core/multi-client.md
- Section: docs
- Category: Core Concepts
- Priority: P0

## Headings

- When To Split (#when-to-use)
- Multi Client (#multi-client)
- Route Config (#route-config)
- Page Structure (#page-structure)
- Local And Production (#local-production)
- CSR And Mobile Builds (#csr-mobile)

## Content

Multi Client

When To Split

Your app has grown a second audience. The storefront and the admin console want different domains, different first screens, maybe different mobile packages — but the same products, the same orders, the same permissions. Creating a second app would duplicate all of that. Splitting the pages with basePath does not.

The test is whether the surfaces are sold, deployed, or reached as separate products. If they are, split them; if one is a section of the other, a route group is enough:

Situation

- A customer storefront and an admin console — They share products, orders, users, and permissions, but need different domains, layouts, and release targets.

- A consumer client, a partner portal, and an internal tool — One backend, three audiences. Each gets its own home screen and navigation without a second app.

- Android and iOS packages released per brand, region, or user type — A native target points at a basePath, so each package opens its own client from the same backend.

- White-label or regional sites on shared business rules — Different domains, names, and first screens over the same domain models — the case basePath exists for.

- Account settings, dashboards, tabs, grouped screens — These are sections inside one client. A route group such as (user) organizes them without adding a URL segment.

- A section that only some signed-in users may open — Authorization is a guard and a layout gate, not a deployment boundary. Splitting on it buys nothing and costs a domain.

normal routing

Akan can serve multiple web clients from one app by splitting pages with basePath. Every route sits under the locale, so locally a client is the segment right after it — /en/store — but in production the matching domain hides that segment and serves the client as a separate site.

One app, many clients

Akan App

single server and backend

store web

admin web

partner web

demo web

Multi web

Each basePath can behave like its own website.

Single backend

All clients still share the same app server, domain modules, and services.

Separate builds

CSR web and mobile apps can be prepared per basePath.

Route Config

Define clients in akan.config.ts with routes. The basePath names the client, and domains decide which production host should open that client.

- basePath (string): The client this route opens and its first page folder: basePath store lives in page/store.

- domains (Record<branch, string[]>, default {}): Hosts per branch that open this basePath; a matching host hides the basePath segment.

Page Structure

When routes define base paths, every page file must be placed under one of those first folders. Pages directly under page/ are invalid because Akan cannot assign them to a client.

In local development, you open each client with the locale followed by its basePath, such as /en/store or /ko/admin. After deployment, a configured domain can open that same client without showing the basePath in the URL.

Rule: once basePath is declared, pages outside page/basePath/ are not allowed.

Local And Production

The same app can feel different depending on where it runs. Locally, basePath is visible so developers can move between clients in one web server. In production, domains can map directly to each client.

Local development

Production domains

partner declares no domain of its own, and still has one. Akan derives <basePath>-<branch>.<serveDomain> for every basePath on every branch it knows, so partner-main.example.com and partner-develop.example.com exist without being written down.

A mapped domain serves its own client only. On store.example.com, /en/admin/users is looked up inside store, on a reload and a client-side navigation alike, so link to another client through its own domain.

Locally the site root has no page of its own, so Akan answers it with a list of every basePath in the build instead of a 404. Deployed hosts never see that list; the matching domain opens its client directly.

CSR And Mobile Builds

When the app is built, Akan can prepare CSR web output per basePath. Native targets can also point to a basePath, so Android and iOS apps can open the right client from the same backend.

Build outputs

One Akan app builds CSR web output per basePath and an Android and iOS app per target, and all three talk to one server and backend.

A target's basePath must name one the routes declared.

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
http://localhost:8282/en/store
http://localhost:8282/en/admin
http://localhost:8282/en/partner
```

### Code

```bash
https://store.example.com  -> store
https://admin.example.com  -> admin
https://partner-main.example.com -> partner
```

### Native targets

```ts
const config = {
  routes: [
    { domains: { main: ["store.example.com"] }, basePath: "store" },
    { domains: { main: ["admin.example.com"] }, basePath: "admin" },
  ],
  native: {
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

