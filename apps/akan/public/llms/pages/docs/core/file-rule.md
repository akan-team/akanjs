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
- Common Choices (#workflow)

## Content

File Rule

Folder names tell Akan what business area a file belongs to. File names tell Akan what role the file plays inside that business area. For example, product.document.ts describes stored product data, while Product.View.tsx describes how product data is shown on screen.

Think of a module as a small business department. A product module may know what fields a product has, how to save it, how users request it, and how it is shown in the admin screen. Each file handles one of those jobs.

Business meaning

A file suffix explains what kind of work the file does for the model.

Start small

You do not need every file. Add files only when the business feature needs them.

Module Files

These files describe the data, server logic, API surface, and state around a business model. If you are building products, orders, users, invoices, or reservations, these are the files you will touch most often.

The abstract file is not only for LLMs. It keeps domain knowledge beside the code, so people and agents can understand business invariants before changing implementation files.

The five UI suffixes are not five sizes of component either. Each one answers a different question: how the user edits one record, how one record looks in a list, how one record looks on its own page, how a page section is assembled, and what extra action the model offers. The first column of each row is which side of the client boundary the file lives on:

File

- model.abstract.md: Business intent, domain rules, workflows and agent notes beside the module code. — shared

- model.constant.ts: Constants, status values, default options, and shared model types. — shared

- model.dictionary.ts: Labels, field names, and text keys the model uses, such as the price label. — shared

- model.document.ts: Stored data shape, filters, and document model definition. — server

- model.service.ts: Server-side business logic, such as creating an order or applying a coupon. — server

- model.signal.ts: Public actions, slices, endpoints, and internal jobs that pages can call. — shared

- model.store.ts: Client or model state used across screens, such as selected filters or a cart. — client

- Model.Template.tsx: The create and edit form: reads st.use.productForm(), writes through generated setters. — client

- Model.Unit.tsx: One item in a list or grid, such as a row or card; takes the trimmed LightProduct. — server

- Model.Util.tsx: A domain UI helper named for the endpoint verb minus the model noun, like Refund. — client

- Model.View.tsx: One record in full detail: the full model, with fields a list never loads. — server

- Model.Zone.tsx: A composed page section: feeds the store to Load.Units or Load.View; Unit and View draw it. — client

The client boundary follows the suffix, not your judgment. Template, Zone, and Util always carry "use client" on line 1; Unit and View never do, so they render on the server and ship no JavaScript.

Naming Rule

Akan file names use two patterns. Business core files use the model name in lower camel case. UI files use the model name in PascalCase.

This makes a module easy to scan with your eyes. When you open lib/product/, every product.* file is business logic and every Product.* file is UI. You can immediately tell where to add a new query, screen component, or server action.

Business files

UI files

Do not declare arbitrary files inside a module folder outside these rules. For example, product.helper.ts or ProductComponents.tsx should be moved into the closest allowed role such as product.service.ts, Product.Util.tsx, or Product.Unit.tsx.

Facet Files And Barrels

Files under ui/ and webkit/ are usually exported through barrel files such as @apps/myapp/ui or @libs/shared/webkit. To keep imports predictable and easy to optimize, prefer one main export per file and make the file name match the export name.

This convention is especially helpful when a business grows. A storefront, admin app, and partner app can all import the same ProductCard without knowing where the implementation lives.

✅ Recommended

❌ Avoid

Use this for reusable visual components. Example: ProductCard.tsx should export ProductCard.

Use this for browser/client hooks and helpers. Example: usePaymentStatus.tsx should export usePaymentStatus.

A page imports by business name from the package entry point instead of a deep file path.

Module Differences

Not every folder type uses every file type. Database modules can have the full set. Service modules focus on behavior. Scalar modules focus on reusable value definitions.

Choose the file set by the business role of the folder. product is a thing you store, so it can have document and store files. _payment is something you do, so it usually focuses on service and signal files. money is a reusable value shape, so it stays small and definition-oriented.

- database: Database — lib/product/

- service: Service — lib/_payment/

- scalar: Scalar — lib/__scalar/money/

- Business files — model

  - .abstract.md

  - .constant.ts

  - .dictionary.ts

  - .document.ts

  - .service.ts

  - .signal.ts

  - .store.ts

- UI files — Model

  - .Template.tsx

  - .Unit.tsx

  - .Util.tsx

  - .View.tsx

  - .Zone.tsx

{num} files

Allowed in this module kind

Not allowed in this module kind

The abstract file is the one whose name changes: a service module drops the folder's underscore, so lib/_payment/ holds payment.abstract.md.

Common Choices

When you are not sure which file to create, start from the business question you are trying to answer.

For example, 'Can the customer see the order?' points to View. 'Can the customer cancel the order?' points to signal and service. 'What fields does an order save?' points to document.

Question

- Do we store this data? — model.document.ts

- Does the server process it? — model.service.ts

- Should a page call it? — model.signal.ts

- Does one record get its own page? — Model.View.tsx

- Is it one item in a list? — Model.Unit.tsx

- Does the user fill it in? — Model.Template.tsx

- Is it a domain UI action? — Model.Util.tsx

- Is it a large screen area? — Model.Zone.tsx

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

### page/store/products.tsx

```ts
import { ProductCard } from "@apps/myapp/ui";
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

