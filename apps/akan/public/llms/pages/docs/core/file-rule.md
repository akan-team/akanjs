# File Rule

- Source: /docs/core/file-rule
- Mirror: /llms/pages/docs/core/file-rule.md
- Section: docs
- Category: Core Concepts
- Priority: P0

## Headings

- File Rule (#file-rule)
- Module Files (#module-files)
- Naming Rule (#naming-rule)
- Facet Files And Barrels (#facet-files)
- Module Differences (#module-differences)
- Codegen And Choices (#workflow)

## Content

File Rule

Folder names tell Akan what business area a file belongs to. File names tell Akan what role the file plays inside that business area. For example, product.document.ts describes stored product data, while Product.View.tsx describes how product data is shown on screen.

Think of a module as a small business department. A product module may know what fields a product has, how to save it, how users request it, and how it is shown in the admin screen. Each file handles one of those jobs.

Business meaning

A file suffix explains what kind of work the file does for the model.

Scanner friendly

Akan scans these suffixes and connects models, services, signals, and UI pieces.

Start small

You do not need every file. Add files only when the business feature needs them.

You can start with only one or two files. For example, a simple read-only catalog may only need product.document.ts and Product.View.tsx at first.

Module Files

These files describe the data, server logic, API surface, and state around a business model. If you are building products, orders, users, invoices, or reservations, these are the files you will touch most often.

For example, an order feature may keep order status values in order.constant.ts, saved order fields in order.document.ts, payment completion logic in order.service.ts, and page-callable actions in order.signal.ts.

The abstract file is not only for LLMs. It keeps domain knowledge beside the code, so people and agents can understand business invariants before changing implementation files.

Business intent, domain rules, workflows, and agent notes kept next to the module code. Example: order cancellation rules or status transition policy.

Constants, status values, default options, and shared model types. Example: order status such as pending, paid, shipped.

Labels, field names, and text keys used by the model. Example: product name, price, stock labels.

Stored data shape, filters, and document model definition. Example: what fields an invoice saves and how it can be queried.

Server-side business logic. Example: create an order, apply a coupon, calculate shipping, or complete payment.

Public actions, slices, endpoints, and internal jobs that pages can call. Example: load order list or request OCR.

Client or model state used across screens. Example: selected filters, cart state, or temporary form state.

UI Files

UI files describe how a model appears on screen. They use PascalCase because they export React components or UI groups.

A business model usually appears in several screen sizes: a small badge, a list row, a detail card, an admin panel, and sometimes a full dashboard section. UI files help you keep those screen pieces close to the model they represent.

Use it for display components, such as ProductCard, OrderSummary, UserProfile, or InvoicePreview.

Use it for small reusable units inside the model UI, such as status badges, price rows, or avatar blocks.

Use it for repeated screen templates or layout patterns, such as a standard admin detail layout.

Use it for UI-level actions or helper components, such as remove buttons, edit modal triggers, or upload controls.

Use it for larger areas, such as admin screens, list/detail zones, tab content, or dashboard sections.

Naming Rule

Akan file names use two patterns. Business core files use the model name in lower camel case. UI files use the model name in PascalCase.

This makes a module easy to scan with your eyes. When you open lib/product/, every product.* file is business logic and every Product.* file is UI. You can immediately tell where to add a new query, screen component, or server action.

Business files

UI files

Do not declare arbitrary files inside a module folder outside these rules. For example, product.helper.ts or ProductComponents.tsx should be moved into the closest allowed role such as product.service.ts, Product.Util.tsx, or Product.Unit.tsx.

The suffix is not just style. Akan scans these suffixes to understand what files exist in each module.

Facet Files And Barrels

Files under ui/ and webkit/ are usually exported through barrel files such as @apps/myapp/ui or @libs/shared/webkit. To keep imports predictable and easy to optimize, prefer one main export per file and make the file name match the export name.

This convention is especially helpful when a business grows. A storefront, admin app, and partner app can all import the same ProductCard without knowing where the implementation lives.

✅ Recommended

❌ Avoid

Use this for reusable visual components. Example: ProductCard.tsx should export ProductCard.

Use this for browser/client hooks and helpers. Example: usePaymentStatus.tsx should export usePaymentStatus.

A barrel file re-exports many files from one entry point. Akan can analyze configured barrel imports and rewrite imports to the exact source file, so importing from @apps/myapp/ui can stay convenient without always pulling the entire barrel into the bundle.

In day-to-day product work, this means your page can import by business name instead of deep file path. You write a clean import, and Akan keeps the build focused on the exact files that are used.

This is why one file, one main export is recommended. It helps the barrel analyzer map ProductCard to ui/ProductCard.tsx clearly.

Module Differences

Not every folder type uses every file type. Database modules can have the full set. Service modules focus on behavior. Scalar modules focus on reusable value definitions.

Choose the file set by the business role of the folder. product is a thing you store, so it can have document and store files. _payment is something you do, so it usually focuses on service and signal files. money is a reusable value shape, so it stays small and definition-oriented.

Can use abstract, constant, dictionary, document, service, signal, store, Template, Unit, Util, View, and Zone.

Can use abstract, dictionary, service, signal, store, Template, Unit, Util, View, and Zone. The abstract filename drops the folder underscore, such as payment.abstract.md in lib/_payment/.

Can use abstract, constant, dictionary, document, Template, Unit, Util, View, and Zone.

Codegen And Choices

Akan scans module files and generates helper indexes around them. This lets application code import model features through stable module exports instead of manually wiring every file.

For a product team, this removes repeated wiring work. When a module grows from a document into views, units, and zones, Akan can keep the module entry organized as long as the file names follow the convention.

This is why naming matters. If Product.View.tsx is renamed randomly, Akan cannot recognize it as the View file for the Product module.

Common Choices

When you are not sure which file to create, start from the business question you are trying to answer.

For example, 'Can the customer see the order?' points to View. 'Can the customer cancel the order?' points to signal and service. 'What fields does an order save?' points to document.

Do we store this data?

Does the server process it?

Should a page call it?

Does it show data?

Is it a small UI action?

Is it a large screen area?

## Code Examples

### lib/product/

```bash
lib/product/
├── product.abstract.md
├── product.constant.ts
├── product.dictionary.ts
├── product.document.ts
├── product.service.ts
├── product.signal.ts
├── product.store.ts
├── Product.Template.tsx
├── Product.Unit.tsx
├── Product.Util.tsx
├── Product.View.tsx
└── Product.Zone.tsx
```

### lib/bizCard/

```bash
BizCard.View.tsx      # how a biz card is displayed
BizCard.Unit.tsx      # small reusable UI pieces
BizCard.Template.tsx  # repeated layout or template
BizCard.Util.tsx      # UI actions or helpers
BizCard.Zone.tsx      # large screen areas such as admin/list/detail
```

### Code

```bash
product.abstract.md
product.constant.ts
product.dictionary.ts
product.document.ts
product.service.ts
product.signal.ts
product.store.ts
```

### Code

```bash
Product.Template.tsx
Product.Unit.tsx
Product.Util.tsx
Product.View.tsx
Product.Zone.tsx
```

### Code

```ts
// ui/ProductCard.tsx
export const ProductCard = () => {
  return <div>Product</div>;
}

// webkit/usePaymentStatus.tsx
export const usePaymentStatus() {
  return { status: "ready" };
}
```

### Code

```ts
// ui/components.tsx
export const ProductCard = () => {}
export const OrderBadge = () => {}
export const PriceText = () => {}

// hard to know which import belongs to which file
```

### barrel import

```ts
// ui/index.ts
export * from "./ProductCard";
export * from "./OrderBadge";

// page/store/products.tsx
import { ProductCard } from "@apps/myapp/ui";
```

### Generated UI index idea

```ts
import * as Unit from "./Product.Unit";
import * as Util from "./Product.Util";
import * as View from "./Product.View";
import * as Zone from "./Product.Zone";

export const Product = { Unit, Util, View, Zone };
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

