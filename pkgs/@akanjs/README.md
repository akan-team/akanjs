# Akan.js Framework

> **⚠️ Important Notice**: This repository is currently a uni-directional repository that syncs the monorepo of the Akan team. It will be converted to a standalone project soon. Please stay tuned for updates.

## Introduction

Akan.js is a full-stack TypeScript framework that enables you to build complete, type-safe applications with minimal code. Write once and deploy simultaneously to web, mobile, server, database, and infrastructure.

### Why Akan.js?

- **Write Once, Deploy Everywhere**: Single codebase for backend, frontend web, Android, and iOS
- **Minimal Code, Maximum Output**: Abstracted technical complexity lets you focus on business logic
- **Full Type Safety**: End-to-end TypeScript with automatic type inference across all layers
- **Integrated Development**: Schema, service logic, API endpoints, state management, and UI components in one cohesive system

---

## Key Features

### Integral Interface

Akan.js provides a unified interface for building everything from database schema to UI components, eliminating the need to manage separate tools and configurations.

### Stable, Scalable, Safe

- **Type-Safe**: Complete type safety from database to UI
- **i18n**: Built-in internationalization with dictionary-based translations
- **Security**: Standardized authentication and authorization
- **File Management**: Integrated file upload and storage
- **Text Search**: Optimized search with Meilisearch integration
- **Auto Documentation**: Automatic API and model documentation
- **Admin Interface**: Generated admin panels for data management

### Application as a Service

Deploy server, database, web, and mobile apps simultaneously through Akan Cloud. Commit once, deploy and manage everything.

---

## Technology Stack

Akan.js integrates the following technologies:

| Layer          | Technologies                                    |
| -------------- | ----------------------------------------------- |
| **Web/Mobile** | Next.js, React, Capacitor, TailwindCSS, DaisyUI |
| **Server**     | NestJS, MongoDB (Mongoose), Redis, Meilisearch  |
| **Testing**    | Jest, Playwright, ESLint                        |
| **Deployment** | Docker, Kubernetes                              |

---

## Quick Start

### Prerequisites

- **Node.js** 20.x or higher
- **pnpm** 10.x or higher
- **Docker** (for local database)
- **Android Studio** (optional, for Android development)
- **Xcode** (optional, for iOS development)

### Installation

```bash
npx create-akan-workspace@latest
```

When prompted:

```
what is the name of your organization?: # e.g., mycompany
describe your first application to create.: # e.g., myapp
```

### Run Development Server

```bash
akan start myapp --open=true
```

This starts:

- **Next.js** (SSR) at `http://localhost:4200` - optimized for web
- **React** (CSR) at `http://localhost:4201` - optimized for mobile apps
- **NestJS Server** at `http://localhost:8080` - backend API

---

## Architecture Overview

### Workspace Structure (Monorepo)

Akan.js uses a monorepo structure where a single workspace contains multiple applications and shared libraries:

```
├── apps/                   # Application list
│   └── myapp/              # Individual application
│   └── otherapp/           # Another application
└── libs/                   # Library list
    ├── shared/             # Shared library (default)
    ├── util/               # Utility library (default)
    └── [other libs]/       # Custom libraries
```

- **Apps**: Standalone applications deployable to all platforms (web, mobile, server)
- **Libs**: Shared libraries providing reusable features across multiple apps

> **80:20 Rule**: A well-maintained workspace typically has ~80% of code in shared libraries and ~20% specific to each app.

### Application File Structure

```
└── apps/myapp/
    ├── app/                # File-based routing (Next.js App Router)
    ├── base/               # Base code (non-modularized)
    ├── common/             # Common code (modularized)
    ├── env/                # Environment variables
    ├── lib/                # Domain modules
    ├── nest/               # Server-side logic
    ├── next/               # Client-side logic (modularized)
    ├── public/             # Static assets
    ├── ui/                 # UI components (modularized)
    ├── akan.config.ts      # Application configuration
    ├── main.ts             # Backend entry point
    ├── client.ts           # Client-side barrel file
    └── server.ts           # Server-side barrel file
```

### Multi-Environment Support

```
apps/myapp/env/
├── env.client.debug.ts     # Debug client environment
├── env.client.develop.ts   # Development client environment
├── env.client.main.ts      # Production client environment
├── env.server.debug.ts     # Debug server environment
├── env.server.develop.ts   # Development server environment
└── env.server.main.ts      # Production server environment
```

---

## Domain-Driven Development

### Creating a Module

Modules are complete packages that handle everything related to one business domain. Create a module with:

```bash
akan create-module icecreamOrder
# Select your application when prompted
```

This generates a complete module structure:

```
lib/icecreamOrder/
├── icecreamOrder.constant.ts    # Types and schemas
├── icecreamOrder.dictionary.ts  # Translations (i18n)
├── icecreamOrder.document.ts    # Database document
├── icecreamOrder.service.ts     # Business logic
├── icecreamOrder.signal.ts      # API endpoints
├── icecreamOrder.store.ts       # State management
├── icecreamOrder.Template.tsx   # Form UI
├── icecreamOrder.Unit.tsx       # List/card item UI
├── icecreamOrder.Util.tsx       # Utility components
├── icecreamOrder.View.tsx       # Detail view UI
└── icecreamOrder.Zone.tsx       # Integration UI
```

---

## Model Definition (`model.constant.ts`)

Use the `via()` function to define type-safe schemas:

```typescript
import { enumOf, Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

// Define enums
export class OrderStatus extends enumOf("orderStatus", ["pending", "processing", "completed", "cancelled"] as const) {}

export class Topping extends enumOf("topping", ["strawberry", "mango", "oreo", "granola"] as const) {}

// Define input schema (for creating/updating)
export class IcecreamOrderInput extends via((field) => ({
  size: field(Int, { min: 50, max: 200 }),
  toppings: field([Topping]),
})) {}

// Define object schema (extends input with additional fields)
export class IcecreamOrderObject extends via(IcecreamOrderInput, (field) => ({
  status: field(OrderStatus, { default: "pending" }),
})) {}

// Define light model (selected fields for lists)
export class LightIcecreamOrder extends via(
  IcecreamOrderObject,
  ["size", "toppings", "status"] as const,
  (resolve) => ({})
) {}

// Define full model (includes resolved relations)
export class IcecreamOrder extends via(IcecreamOrderObject, LightIcecreamOrder, (resolve) => ({})) {}

// Define insight model (for analytics/summaries)
export class IcecreamOrderInsight extends via(IcecreamOrder, (field) => ({})) {}
```

---

## Dictionary (`model.dictionary.ts`)

The dictionary provides multilingual translations for your module:

```typescript
import { modelDictionary } from "@akanjs/dictionary";

import type { IcecreamOrder, IcecreamOrderInsight, OrderStatus, Topping } from "./icecreamOrder.constant";
import type { IcecreamOrderFilter } from "./icecreamOrder.document";
import type { IcecreamOrderEndpoint, IcecreamOrderSlice } from "./icecreamOrder.signal";

export const dictionary = modelDictionary(["en", "ko"])
  // Module name and description
  .of((t) =>
    t(["Icecream Order", "아이스크림 주문"]).desc([
      "Icecream order with customizable toppings",
      "맞춤 토핑이 가능한 아이스크림 주문",
    ])
  )
  // Model field translations
  .model<IcecreamOrder>((t) => ({
    size: t(["Size", "사이즈"]).desc(["Size of the icecream", "아이스크림 사이즈"]),
    toppings: t(["Toppings", "토핑"]).desc(["Selected toppings", "선택한 토핑"]),
    status: t(["Status", "상태"]).desc(["Order status", "주문 상태"]),
  }))
  // Enum translations
  .enum<OrderStatus>("orderStatus", (t) => ({
    pending: t(["Pending", "대기중"]).desc(["Order is pending", "주문 대기중"]),
    processing: t(["Processing", "처리중"]).desc(["Order is being processed", "주문 처리중"]),
    completed: t(["Completed", "완료"]).desc(["Order is completed", "주문 완료"]),
    cancelled: t(["Cancelled", "취소됨"]).desc(["Order is cancelled", "주문 취소됨"]),
  }))
  .enum<Topping>("topping", (t) => ({
    strawberry: t(["Strawberry", "딸기"]).desc(["Strawberry topping", "딸기 토핑"]),
    mango: t(["Mango", "망고"]).desc(["Mango topping", "망고 토핑"]),
    oreo: t(["Oreo", "오레오"]).desc(["Oreo topping", "오레오 토핑"]),
    granola: t(["Granola", "그래놀라"]).desc(["Granola topping", "그래놀라 토핑"]),
  }))
  .insight<IcecreamOrderInsight>((t) => ({}))
  .slice<IcecreamOrderSlice>((fn) => ({
    inPublic: fn(["Public Orders", "공개 주문"]).arg((t) => ({})),
  }))
  .endpoint<IcecreamOrderEndpoint>((fn) => ({}))
  .error({})
  .translate({});
```

### Using Translations in Components

```tsx
import { usePage } from "@myapp/client";

export const OrderForm = () => {
  const { l } = usePage();

  return (
    <form>
      <h2>{l("icecreamOrder.modelName")}</h2>

      <label>{l("icecreamOrder.size")}</label>
      <input type="number" placeholder={l("icecreamOrder.desc.size")} />

      <label>{l("icecreamOrder.toppings")}</label>
      {/* Topping selection */}

      <span>{l("orderStatus.pending")}</span>
    </form>
  );
};
```

---

## Signal (`model.signal.ts`)

Signals define API endpoints connecting client and server:

```typescript
import { ID, Int } from "@akanjs/base";
import { slice, endpoint, mergeSignals } from "@akanjs/signal";

import * as cnst from "../cnst";
import type * as db from "../db";

// Define slices for data access patterns
export class IcecreamOrderSlice extends slice(
  cnst.icecreamOrderSrv,
  { guards: { get: "public", cru: "user" } },
  ({ query, mutation }) => ({
    inPublic: query()
      .search("status", cnst.OrderStatus)
      .exec(function (status) {
        return this.icecreamOrderService.findByStatus(status);
      }),
  })
) {}

// Define custom endpoints
export class IcecreamOrderEndpoint extends endpoint(cnst.icecreamOrderSrv, ({ query, mutation }) => ({
  getOrderStats: query(cnst.IcecreamOrderInsight).exec(function () {
    return this.icecreamOrderService.getStats();
  }),

  createOrder: mutation(cnst.IcecreamOrder)
    .body("input", cnst.IcecreamOrderInput)
    .exec(function (input) {
      return this.icecreamOrderService.create(input);
    }),
})) {}

// Merge all signals
export class IcecreamOrderSignal extends mergeSignals(IcecreamOrderSlice, IcecreamOrderEndpoint) {}
```

---

## Store (`model.store.ts`)

Stores manage client-side state using Zustand:

```typescript
import { store } from "@akanjs/store";
import * as cnst from "../cnst";
import { fetch } from "../sig";

// Price configuration
const PRICE_PER_CC = 0.05; // $0.05 per cc
const TOPPING_PRICE = 0.5; // $0.50 per topping

export class IcecreamOrderStore extends store(fetch.icecreamOrderGql, {
  // Custom state (simple setters like setSelectedSize are auto-generated)
  selectedSize: 100 as number,
  totalPrice: 0 as number,
}) {
  // Business logic: Calculate total price based on size and toppings
  calculateTotalPrice() {
    const form = this.get().icecreamOrderForm;
    const basePrice = form.size * PRICE_PER_CC;
    const toppingsPrice = form.toppings.length * TOPPING_PRICE;
    this.set({ totalPrice: basePrice + toppingsPrice });
  }

  // Business logic: Validate and submit order
  async submitOrder() {
    const form = this.get().icecreamOrderForm;

    // Validation
    if (form.size < 50) throw new Error("Minimum size is 50cc");
    if (form.toppings.length === 0) throw new Error("Please select at least one topping");

    // Submit via API
    const order = await fetch.createIcecreamOrder({ input: form });
    this.addIcecreamOrderInPublic(order);
    this.resetIcecreamOrderForm();
    return order;
  }

  // Business logic: Apply discount for large orders
  applyBulkDiscount() {
    const { totalPrice, selectedSize } = this.get();
    if (selectedSize >= 200) {
      this.set({ totalPrice: totalPrice * 0.9 }); // 10% discount
    }
  }
}
```

### Using Store in Components

```tsx
import { st, cnst } from "@myapp/client";

export const OrderPage = () => {
  // Access form state
  const icecreamOrderForm = st.use.icecreamOrderForm();

  // Access custom state
  const selectedSize = st.use.selectedSize();

  return (
    <div>
      <Field.ToggleSelect
        label="Size"
        items={[50, 100, 200].map((size) => ({ label: `${size}cc`, value: size }))}
        value={icecreamOrderForm.size}
        onChange={st.do.setSizeOnIcecreamOrder}
      />

      <Field.MultiToggleSelect
        label="Toppings"
        items={cnst.Topping}
        value={icecreamOrderForm.toppings}
        onChange={st.do.setToppingsOnIcecreamOrder}
      />
    </div>
  );
};
```

---

## Component Architecture

### Template Components (`model.Template.tsx`)

Form components for creating or editing:

```tsx
"use client";
import { cnst, st, usePage } from "@myapp/client";
import { Layout, Field } from "@akanjs/ui";

interface OrderEditProps {
  className?: string;
}

export const General = ({ className }: OrderEditProps) => {
  const icecreamOrderForm = st.use.icecreamOrderForm();
  const { l } = usePage();

  return (
    <Layout.Template className={className}>
      <Field.ToggleSelect
        label={l("icecreamOrder.size")}
        items={[50, 100, 200].map((size) => ({ label: `${size}cc`, value: size }))}
        value={icecreamOrderForm.size}
        onChange={st.do.setSizeOnIcecreamOrder}
      />
      <Field.MultiToggleSelect
        label={l("icecreamOrder.toppings")}
        items={cnst.Topping}
        value={icecreamOrderForm.toppings}
        onChange={st.do.setToppingsOnIcecreamOrder}
      />
    </Layout.Template>
  );
};
```

### Unit Components (`model.Unit.tsx`)

Card or list item components:

```tsx
import { clsx, ModelProps } from "@akanjs/client";
import { cnst, usePage } from "@myapp/client";

export const Card = ({ icecreamOrder }: ModelProps<"icecreamOrder", cnst.LightIcecreamOrder>) => {
  const { l } = usePage();

  return (
    <div className="rounded-xl bg-gradient-to-br from-pink-100 to-pink-200 p-6 shadow-md">
      <div className="flex items-center gap-2">
        <span className="font-mono">#{icecreamOrder.id.slice(-4)}</span>
        <span
          className={clsx("rounded px-2 py-1 text-xs font-semibold", {
            "bg-green-100 text-green-700": icecreamOrder.status === "pending",
            "bg-blue-100 text-blue-700": icecreamOrder.status === "processing",
            "bg-purple-100 text-purple-700": icecreamOrder.status === "completed",
          })}
        >
          {l(`orderStatus.${icecreamOrder.status}`)}
        </span>
      </div>
      <div className="mt-2">
        <span>{icecreamOrder.size}cc</span>
        <span> • {icecreamOrder.toppings.length} toppings</span>
      </div>
    </div>
  );
};
```

### View Components (`model.View.tsx`)

Full page or section components.

### Zone Components (`model.Zone.tsx`)

Layout containers integrating multiple components with data loading.

---

## Page Implementation

Create pages using Next.js App Router:

```tsx
// apps/myapp/app/[lang]/orders/page.tsx
import { Load, Model } from "@akanjs/ui";
import { cnst, fetch, IcecreamOrder, usePage } from "@myapp/client";

export default function Page() {
  const { l } = usePage();

  return (
    <Load.Page
      of={Page}
      loader={async () => {
        const { icecreamOrderInitInPublic } = await fetch.initIcecreamOrderInPublic();
        const icecreamOrderForm: Partial<cnst.IcecreamOrderInput> = {};
        return { icecreamOrderInitInPublic, icecreamOrderForm };
      }}
      render={({ icecreamOrderInitInPublic, icecreamOrderForm }) => (
        <div>
          <div className="flex items-center gap-4 pb-5">
            <h1 className="text-5xl font-bold">{l("icecreamOrder.modelName")}</h1>
            <Model.New
              className="btn btn-primary"
              sliceName="icecreamOrderInPublic"
              renderTitle="name"
              partial={icecreamOrderForm}
            >
              <IcecreamOrder.Template.General />
            </Model.New>
          </div>
          <IcecreamOrder.Zone.Card className="space-y-2" init={icecreamOrderInitInPublic} />
        </div>
      )}
    />
  );
}
```

---

## CLI Commands

### Workspace & Application

```bash
# Create new workspace
akan create-workspace

# Create new application
akan create-application myapp

# Start development server
akan start myapp --open

# Build for production
akan build myapp

# Start backend only
akan start-backend myapp

# Start frontend only
akan start-frontend myapp
```

### Module Development

```bash
# Create a new module (with AI assistance)
akan create-module userProfile --ai

# Create a scalar data model
akan create-scalar address

# Generate components
akan create-view
akan create-unit
akan create-template
```

### Mobile Development

```bash
# Build and run iOS
akan build-ios myapp
akan start-ios myapp --open

# Build and run Android
akan build-android myapp
akan start-android myapp --open
```

### Database Operations

```bash
# Start local database
akan dbup

# Stop local database
akan dbdown

# Backup database
akan dump-database myapp --environment main

# Restore database
akan restore-database myapp --source develop --target debug
```

---

## Multi-Platform Support

### Web Applications

SSR with Next.js (http://localhost:4200):

```tsx
// apps/myapp/app/[lang]/page.tsx
export default function Page() {
  return <div className="flex h-screen items-center justify-center text-2xl">Hello Akan.js! 🎉</div>;
}
```

### Mobile Applications

CSR with Capacitor (http://localhost:4201 for development):

```bash
# Build iOS app
akan build-ios myapp
npx cap open ios    # Open in Xcode

# Build Android app
akan build-android myapp
npx cap open android  # Open in Android Studio
```

### Server Entry Point

```typescript
// apps/myapp/main.ts
import { Logger } from "@akanjs/common";

const bootstrap = async () => {
  // Server initialization
  Logger.info("Hello Akan.js! 🎉");
};

void bootstrap();
```

---

## Best Practices

### File Naming Conventions

- **Module Files**: `moduleName.constant.ts`, `moduleName.service.ts`, etc.
- **Component Files**: `ModuleName.View.tsx`, `ModuleName.Unit.tsx`, etc.
- **Utility Files**: `moduleName.util.ts`

### Code Organization

- Group files by domain/module, not by technical function
- Keep related code together in the same directory
- Use absolute imports for cross-module dependencies

### State Management

- Use stores for global state shared between components
- Use React's local state for component-specific state
- Keep API data fetching in signal hooks

### Error Handling

- Use the `Revert` class for business logic errors
- Include proper error messages in dictionaries
- Handle errors at the UI level for better UX

---

## Troubleshooting

### API Connection Issues

1. Verify backend is running (`akan start-backend myapp`)
2. Check environment variables in `env/` files
3. Inspect network requests in browser developer tools
4. Ensure signal files are properly imported

### Type Errors

1. Run type checking: `akan lint myapp`
2. Ensure models are properly defined in constant files
3. Check import paths for correctness

### Build Failures

1. Check console errors for specific issues
2. Verify dependencies in `package.json`
3. Clear cache and rebuild

---

## Further Resources

- [Official Documentation](https://akanjs.com/docs)
- [GitHub Repository](https://github.com/akan-team/akanjs)
- [Community Discord](https://discord.gg/akanjs)

---

<p align="center">
  <strong>Built with ❤️ by the Akan.js team</strong>
</p>
