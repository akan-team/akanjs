# Folder Rule

- Source: /docs/core/folder-rule
- Mirror: /llms/pages/docs/core/folder-rule.md
- Section: docs
- Category: Core Concepts
- Priority: P0

## Headings

- Folder Rule (#folder-rule)
- Workspace Rule (#workspace-rule)
- App/Library Folder Rule (#app-lib-folder-rule)
- Module Folder Rule (#module-folder-rule)
- Growth Path (#growth-path)

## Content

Folder Rule

Akan folders are designed around business ownership. When you add a new feature, first ask a simple question: is this a page customers visit, business data the app owns, shared UI, or server-only integration code?

Find ownership

If only one product uses it, put it in that app. If several products share it, move it to a library.

Keep pages separate

Screens such as /orders or /admin/users go under page/. Reusable components and logic go elsewhere.

Model the business

Business nouns such as user, order, product, and invoice usually become folders under lib/.

Which folder does this file go in

Who uses it?

one product

several products

What does the file do?

a URL a user visits

data the business stores

something the business does

reusable markup

browser API or React hook

node, Bun, or a secret

pure and isomorphic

Workspace Rule

At the workspace root, choose the folder by how widely the code is used. A single product goes to apps/. Shared product code goes to libs/. Framework code goes to pkgs/.

A business product that can run by itself. Examples: customer web, admin portal, brand site, or mobile-backed service.

Reusable product code shared by several apps. Examples: user account, billing, file upload, social features, security, admin features, etc.

Code with special purpose, used or published as npm packages. Examples: payment gateway, robot control code, etc.

Generated folders such as .akan/ and dist/ are build outputs, and you normally do not edit them by hand.

Use pkgs/ only when the code should feel like a separate installable package. Ordinary one-app business logic belongs in apps/, and shared product logic usually belongs in libs/ first.

App/Library Folder Rule

An app is where a product becomes visible to users. A library is where reusable business capabilities live. They look similar because both can have domain modules, UI, assets, and server helpers.

Each folder has an admission test rather than a theme, and the first column says which side of the client boundary its code runs on. A client folder ships to the browser, so nothing secret may reach one; a shared folder is read from both sides, so it must stay pure and environment-safe. A file that fails every test does not belong in the app or library root at all.

Folder

- page/: A screen the user visits. When a feature has its own URL, put the page here. Example: page/orders.tsx serves /orders. — client

- lib/: Business data and the rules that go with it. When a feature owns something you save, make it a module folder. Example: lib/order/ holds the order data and its behavior. — shared

- ui/: Pieces of screen you reuse across pages and that are not tied to one model. Example: a card or a chart used in several places. — client

- webkit/: Code that needs the browser or a device feature, or a React hook. Example: a clipboard helper, a camera hook. — client

- common/: Small pure helpers both sides use. Example: date formatting, string utilities. — shared

- srvkit/: Connections to outside services. Example: a payment API client, a mail sender. — server

- env/: Settings that differ per environment. Example: local and production API hosts. — shared

- plugin/: Code that changes how the app builds or runs. Example: a plugin that generates image sizes at build time. — shared

- native/: Its own native plugins, one folder per plugin id. Example: native/label-printer/ with its page API, Kotlin and Swift. — client

- public/: Files served as they are, with no processing. Example: images, fonts, robots.txt. — client

- private/: An asset folder the server reads at runtime and never serves to the browser. Example: an ONNX model file, a fixed JSON dataset. — server

- script/: Developer scripts you run by hand against a running app. Example: filling the database with test data. — server

When you are unsure, ask what the file does: screen goes to page/, reusable visual piece goes to ui/, saved business data goes to lib/<model>/, and private server integration goes to srvkit/ or lib/_<service>/.

Module Folder Rule

Inside lib/, folder names describe the kind of business concept you are building. Use a normal folder for data your business owns, an underscore folder for a capability or integration, and __scalar for reusable value shapes.

Use this for nouns your business owns and saves. Keep model.abstract.md here for business intent, domain rules, workflows, and agent notes.

Use this for actions, workflows, or integrations. The folder keeps the underscore, but the abstract file drops it, such as lib/_payment/payment.abstract.md.

Use this for reusable value shapes shared by models. Keep scalar.abstract.md here when validation meaning or reuse rules need explanation.

A simple rule of thumb: if you can say 'this is a thing we store', use lib/<model>/. If you can say 'this is something we do', use lib/_<service>/.

For external integrations, keep raw vendor clients in srvkit/ and business-facing workflows in lib/_<service>/. For example, paymentGateway.ts calls the vendor API, while lib/_payment creates a payment for an order.

Growth Path

Folder choice can change as the business grows. Start close to the product, then move code outward only when sharing or packaging becomes real.

Start here when the feature belongs to one product. This keeps early business code easy to find.

Move here when two or more apps need the same business model, UI, or service flow.

Move here only when the code should stand alone with its own package boundary.

## Code Examples

### Commerce app example

```bash
apps/commerce/
├── page/
│   ├── store/          # customer storefront pages
│   └── admin/          # admin console pages
├── lib/
│   ├── product/        # product data and behavior
│   ├── order/          # order data and behavior
│   └── _payment/       # payment workflow
├── ui/
│   └── DisplayCard.tsx
├── srvkit/
│   └── paymentGateway.ts
└── public/
    └── brand-logo.svg
```

### Workspace

```bash
.
├── apps/   # runnable applications
├── libs/   # shared product libraries
└── pkgs/   # Akan framework packages and tools
```

### apps/myapp/

```bash
apps/myapp/
├── akan.config.ts
├── main.ts
├── page/
├── lib/
├── ui/
├── common/
├── webkit/
├── env/
├── plugin/
├── native/
├── public/
├── srvkit/
├── private/
├── script/
├── client.ts
└── server.ts
```

### libs/shared/

```bash
libs/shared/
├── akan.config.ts
├── lib/
├── page/
├── ui/
├── env/
├── public/
├── srvkit/
├── private/
├── common/
├── webkit/
├── plugin/
├── native/
├── client.ts
├── server.ts
└── index.ts
```

### lib/

```bash
lib/
├── user/             # database module
│   └── user.abstract.md
├── project/          # database module
├── _payment/         # service module
│   └── payment.abstract.md
├── _notification/    # service module
└── __scalar/
    ├── address/
    └── money/
        └── money.abstract.md
```

### Code movement

```bash
apps/commerce/lib/order/
  # used only by commerce

libs/order/
  # reused by commerce, admin, and partner apps

pkgs/order-sdk/
  # installable or publishable as a standalone package
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

