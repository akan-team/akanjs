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

Workspace Rule

At the workspace root, choose the folder by how widely the code is used. A single product goes to apps/. Shared product code goes to libs/. Framework code goes to pkgs/.

A business product that can run by itself. Examples: customer web, admin portal, brand site, or mobile-backed service.

Reusable product code shared by several apps. Examples: user account, billing, file upload, social features, security, admin features, etc.

Code with special purpose, used or published as npm packages. Examples: payment gateway, robot control code, blockchain integration code, etc.

Generated folders such as .akan/ and dist/ are build outputs. They help Akan run fast, but you normally do not edit them by hand.

Use pkgs/ only when the code should feel like a separate installable package. Ordinary one-app business logic belongs in apps/, and shared product logic usually belongs in libs/ first.

App/Library Folder Rule

An app is where a product becomes visible to users. A library is where reusable business capabilities live. They look similar because both can have domain modules, UI, assets, and server helpers.

Client

Runs in the browser or client app. Keep secrets out of this type.

Server

Runs on the server. Good for private API calls, scripts, and protected logic.

Shared

Can be used from both server and client. Keep it pure and environment-safe.

Put pages here when a user can visit them by URL. Examples: home, sign in, product detail, admin dashboard. A library can hold one too, and apps that opt in with syncPageLibs serve its routes.

Put business concepts here. Examples: user, product, order, invoice, payment, notification.

Put reusable visual components here. Examples: Header, ProductCard, DatePicker, EmptyState.

Put shared code that both server and client can access. Examples: formatters, validators, constants, and pure utilities.

Put browser/client helpers here. Examples: hooks for notifications, device APIs, local storage, or web-only behavior.

Environment adapters and environment-specific files generated or used by Akan.

Put static files here. Examples: logos, icons, fonts, downloadable PDFs, sample images.

Put server-only helpers here. Examples: payment API clients, cloud SDK wrappers, private scripts.

Put implementation-only code here when it should not become part of the public app or library API.

Put development scripts here when you run them while the Akan server is running.

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
│   └── ProductCard.tsx
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

