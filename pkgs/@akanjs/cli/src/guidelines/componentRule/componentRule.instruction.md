# Component Rule Instruction for Akan.js Framework

## Table of Contents

1. [Component Architecture](#component-architecture)
2. [Component Types](#component-types)
3. [File Naming Conventions](#file-naming-conventions)
4. [Utility Functions](#utility-functions)
5. [Best Practices](#best-practices)
6. [Complete Examples](#complete-examples)

---

## Component Architecture

Akan.js framework uses a modular component architecture that separates UI elements by responsibility. Each feature or model in your application should follow a consistent pattern with standardized component types.

### Core Structure

Every component in Akan.js follows this fundamental structure:

```tsx
import { clsx } from "@akanjs/client";
import { ModelType } from "@your-app/client";

interface ComponentProps {
  className?: string;
  // Feature-specific props
}

export const Component = ({ className, ...props }: ComponentProps) => {
  return <div className={clsx("base-classes", className)}>{/* Component content */}</div>;
};
```

### Directory Organization

Features are organized in a consistent structure:

```
{apps,libs}/
└── project-name/
    └── lib/
        └── feature-name/
            ├── FeatureName.Unit.tsx
            ├── FeatureName.View.tsx
            ├── FeatureName.Template.tsx
            ├── FeatureName.Util.tsx
            ├── FeatureName.Zone.tsx
            ├── featureName.constant.ts
            ├── featureName.service.ts
            ├── featureName.signal.ts
            ├── featureName.store.ts
            └── index.ts
```

---

## Component Types

Akan.js components are categorized into five main types, each with a specific responsibility:

### 1. Unit Components (\*.Unit.tsx)

- **Purpose**: Display individual items in lists or cards
- **Responsibility**: Compact display of model data
- **Props**: Model data + navigation/action props
- **Example Usage**: List items, cards, thumbnails

```tsx
export const Card = ({ model, href }: ModelProps<"model", ModelType>) => {
  return (
    <Link href={href} className="rounded-lg shadow-sm hover:shadow-lg">
      <div className="p-4">
        <h3 className="font-medium">{model.title}</h3>
        <p className="opacity-75">{model.description}</p>
      </div>
    </Link>
  );
};
```

### 2. View Components (\*.View.tsx)

- **Purpose**: Display detailed model information
- **Responsibility**: Comprehensive view of a single model
- **Props**: Full model object and contextual data
- **Example Usage**: Detail pages, modals with complete model information

```tsx
export const General = ({ model, className }: { model: ModelType; className?: string }) => {
  return (
    <div className={clsx("space-y-4 p-4", className)}>
      <h1 className="text-2xl font-bold">{model.title}</h1>
      <div className="flex gap-2 text-sm opacity-75">
        <span>{model.category}</span>
        <span>{new Date(model.createdAt).toLocaleDateString()}</span>
      </div>
      <p className="whitespace-pre-wrap">{model.content}</p>
    </div>
  );
};
```

### 3. Template Components (\*.Template.tsx)

- **Purpose**: Create/edit forms for models
- **Responsibility**: Input gathering and form state management
- **Props**: Form state handlers (typically from store)
- **Example Usage**: Create/edit forms, wizards, step-by-step flows

```tsx
export const General = () => {
  const form = st.use.modelForm();

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm opacity-75">Title</label>
        <Input
          value={form.title ?? ""}
          onChange={st.do.setTitleOnModel}
          placeholder="Enter title"
          className="w-full rounded-md p-2"
        />
      </div>

      <div>
        <label className="text-sm opacity-75">Content</label>
        <Input.TextArea
          value={form.content ?? ""}
          onChange={st.do.setContentOnModel}
          placeholder="Enter content"
          className="h-32 w-full rounded-md p-2"
        />
      </div>
    </div>
  );
};
```

### 4. Util Components (\*.Util.tsx)

- **Purpose**: Utility components specific to a feature
- **Responsibility**: Feature-specific UI helpers, buttons, toolbars
- **Props**: Action handlers, contextual data
- **Example Usage**: Toolbars, statistics, insights, action buttons

```tsx
export const Toolbar = ({ model, className }: { model: ModelType; className?: string }) => {
  return (
    <div className={clsx("flex gap-2", className)}>
      <Button onClick={() => st.do.duplicateModel(model.id)}>Duplicate</Button>
      <Button variant="danger" onClick={() => st.do.deleteModel(model.id)}>
        Delete
      </Button>
    </div>
  );
};

export const Stats = ({ summary }: { summary: ModelSummary }) => {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-base-100 rounded-lg p-3">
        <div className="text-sm opacity-75">Total</div>
        <div className="text-xl font-medium">{summary.total}</div>
      </div>
      <div className="bg-base-100 rounded-lg p-3">
        <div className="text-sm opacity-75">Active</div>
        <div className="text-xl font-medium">{summary.active}</div>
      </div>
    </div>
  );
};
```

### 5. Zone Components (\*.Zone.tsx)

- **Purpose**: Container components with data loading
- **Responsibility**: Data fetching, layout, and wiring components together
- **Props**: Initialization data, query parameters
- **Example Usage**: Pages, sections, data-driven layout areas

```tsx
export const List = ({
  init,
  query,
  className,
}: {
  init: ClientInit<"model">;
  query?: QueryParams;
  className?: string;
}) => {
  return (
    <Load.Units
      init={init}
      query={query}
      className={className}
      renderItem={(model: ModelType) => <Model.Unit.Card key={model.id} model={model} href={`/model/${model.id}`} />}
      renderEmpty={() => <div>No items found</div>}
    />
  );
};

export const Admin = ({ init, query }: { init: ClientInit<"model">; query?: QueryParams }) => {
  return (
    <Data.ListContainer
      init={init}
      query={query}
      sliceName="model"
      renderItem={Model.Unit.Card}
      renderTemplate={Model.Template.General}
      renderView={(model: ModelType) => <Model.View.General model={model} />}
      columns={["title", "status", "createdAt"]}
      actions={(model) => ["edit", "delete", "view"]}
    />
  );
};
```

---

## File Naming Conventions

Akan.js uses a strict naming convention to maintain consistency:

- **Model Components**:

  - `{Model}.Unit.tsx` - Card/list item components
  - `{Model}.View.tsx` - Detailed view components
  - `{Model}.Template.tsx` - Form/edit components
  - `{Model}.Util.tsx` - Utility components
  - `{Model}.Zone.tsx` - Container components

- **Model Logic**:

  - `{model}.constant.ts` - Types, GraphQL schema, enums
  - `{model}.service.ts` - Business logic and database operations
  - `{model}.signal.ts` - Client state management and API calls
  - `{model}.store.ts` - Zustand store definitions
  - `{model}.dictionary.ts` - i18n strings
  - `{model}.document.ts` - Mongoose database schema

- **UI Components**:
  - `ui/**/*.tsx` - Reusable UI components
  - `ui/Button.tsx`, `ui/Card.tsx`, etc.

---

## Utility Functions

Akan.js provides several utility modules for common frontend tasks:

### 1. Cookie Management (`@akanjs/client/cookie`)

```tsx
import { getCookie, setCookie, removeCookie } from "@akanjs/client";

// Setting cookies
setCookie("session", "token123");

// Getting cookies
const session = getCookie("session");

// Authentication helpers
const user = getMe();
```

### 2. Storage Utilities (`@akanjs/client/storage`)

Cross-platform storage that works in both web and mobile:

```tsx
import { storage } from "@akanjs/client";

// Store data
await storage.setItem("key", "value");

// Retrieve data
const value = await storage.getItem("key");

// Remove data
await storage.removeItem("key");
```

### 3. Device Capabilities (`@akanjs/client/device`)

```tsx
import { device } from "@akanjs/client";

// Initialize device
await device.init();

// Haptic feedback
device.vibrate("medium");

// Keyboard control
device.keyboard.show();
device.keyboard.hide();
```

### 4. Routing (`@akanjs/client/router`)

```tsx
import { router } from "@akanjs/client";

// Navigation
router.push("/dashboard");
router.replace("/login");
router.back();

// With query parameters
router.push("/search", { q: "term" });
```

### 5. CSS Utilities (`@akanjs/client/types`)

```tsx
import { clsx } from "@akanjs/client";

// Combining class names
const className = clsx("base-class", isActive && "active-class", variant === "large" ? "text-lg" : "text-sm");
```

---

## Best Practices

1. **Separation of Concerns**

   - Keep business logic in signal/store files
   - Keep UI rendering in component files
   - Use Zone components to wire everything together

2. **Component Composition**

   - Break complex UIs into smaller components
   - Use composition over inheritance
   - Always accept and forward `className` prop

3. **Performance**

   - Use `React.memo` for frequently re-rendered components
   - Avoid inline function definitions in render methods
   - Use useMemo/useCallback for expensive computations

4. **Accessibility**

   - Include proper ARIA attributes
   - Ensure keyboard navigation works
   - Maintain sufficient color contrast

5. **Type Safety**

   - Define clear interfaces for all component props
   - Leverage TypeScript's discriminated unions where appropriate
   - Use model types from constants files

6. **State Management**
   - Use framework-provided state utilities (signals, stores)
   - Keep global state minimal and focused
   - Follow the Akan.js state pattern (store + signal)

---

## Complete Examples

### Full Model Module Components

Here's a complete example of components for a "Product" feature:

#### Product.Unit.tsx

```tsx
import { clsx, ModelProps } from "@akanjs/client";
import { cnst } from "@app/client";
import { Image, Link } from "@akanjs/ui";

export const Card = ({ product, href }: ModelProps<"product", cnst.Product>) => {
  return (
    <Link href={href} className="animate-fadeIn flex rounded-lg shadow-sm duration-300 hover:shadow-lg">
      <div className="p-4">
        <h3 className="font-medium">{product.name}</h3>
        <div className="text-primary">${product.price.toFixed(2)}</div>
        {product.image && <Image src={product.image.url} className="h-32 w-full rounded object-cover" />}
        <p className="text-sm opacity-75">{product.description}</p>
      </div>
    </Link>
  );
};
```

#### Product.View.tsx

```tsx
import { clsx } from "@akanjs/client";
import { cnst } from "@app/client";
import { Button, Image } from "@akanjs/ui";

interface ProductViewProps {
  className?: string;
  product: cnst.Product;
}

export const General = ({ className, product }: ProductViewProps) => {
  return (
    <div className={clsx("animate-fadeIn space-y-6", className)}>
      <div className="flex flex-col gap-6 md:flex-row">
        {product.image && (
          <div className="w-full md:w-1/2">
            <Image src={product.image.url} className="w-full rounded-lg object-cover" />
          </div>
        )}

        <div className="w-full space-y-4 md:w-1/2">
          <h1 className="text-3xl font-bold">{product.name}</h1>
          <div className="text-primary text-xl font-medium">${product.price.toFixed(2)}</div>
          <p className="whitespace-pre-wrap">{product.description}</p>
          <div className="flex gap-2">
            <Button variant="primary">Add to Cart</Button>
            <Button variant="outline">Save for Later</Button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-xl font-medium">Specifications</h2>
        <div className="grid grid-cols-2 gap-2">
          {product.specifications.map((spec, idx) => (
            <div key={idx} className="flex justify-between border-b p-2">
              <span className="font-medium">{spec.name}</span>
              <span>{spec.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

#### Product.Template.tsx

```tsx
"use client";
import { clsx } from "@akanjs/client";
import { st } from "@app/client";
import { Button, Input } from "@akanjs/ui";
import { Upload } from "@util/ui";
import { AiOutlinePlus } from "react-icons/ai";

export const General = () => {
  const productForm = st.use.productForm();

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1 block text-sm opacity-75">Product Name</label>
        <Input
          value={productForm.name ?? ""}
          onChange={st.do.setNameOnProduct}
          placeholder="Enter product name"
          className="w-full rounded-md p-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm opacity-75">Price</label>
        <Input
          type="number"
          value={productForm.price?.toString() ?? ""}
          onChange={(value) => st.do.setPriceOnProduct(Number(value))}
          placeholder="0.00"
          className="w-full rounded-md p-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm opacity-75">Description</label>
        <Input.TextArea
          value={productForm.description ?? ""}
          onChange={st.do.setDescriptionOnProduct}
          placeholder="Product description"
          className="h-32 w-full rounded-md p-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm opacity-75">Product Image</label>
        <Upload.Image
          aspectRatio={[1, 1]}
          type="crop"
          styleType="square"
          protoFile={productForm.image}
          onRemove={() => st.do.setImageOnProduct(null)}
          renderEmpty={() => (
            <div className="border-base-200 bg-base-100 flex h-48 w-full items-center justify-center rounded-xl border drop-shadow-xl duration-300 hover:opacity-50">
              <div>
                <AiOutlinePlus className="text-primary text-6xl font-bold opacity-60" />
                <p className="text-base-300 text-center text-xs">Upload Image</p>
              </div>
            </div>
          )}
          renderComplete={(file) => (
            <div className="h-48 w-full rounded-md">
              <Image file={file} className="size-full rounded-md object-cover" />
            </div>
          )}
          onSave={(file) => st.do.uploadImageOnProduct([file] as unknown as FileList)}
        />
      </div>
    </div>
  );
};
```

#### Product.Util.tsx

```tsx
"use client";
import { ModelDashboardProps } from "@akanjs/client";
import { cnst, st } from "@app/client";
import { Data } from "@akanjs/ui";
import { Button } from "@akanjs/ui";

export const AddToCart = ({ productId, className }: { productId: string; className?: string }) => {
  return (
    <Button className={clsx("bg-primary text-white", className)} onClick={() => st.do.addToCart(productId)}>
      Add to Cart
    </Button>
  );
};

export const PriceFilter = ({
  onChange,
  value,
}: {
  onChange: (range: [number, number]) => void;
  value: [number, number];
}) => {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Min: ${value[0]}</span>
        <span>Max: ${value[1]}</span>
      </div>
      <div className="flex gap-4">
        <input
          type="range"
          min="0"
          max="1000"
          value={value[0]}
          onChange={(e) => onChange([Number(e.target.value), value[1]])}
          className="range range-xs range-primary"
        />
        <input
          type="range"
          min="0"
          max="1000"
          value={value[1]}
          onChange={(e) => onChange([value[0], Number(e.target.value)])}
          className="range range-xs range-primary"
        />
      </div>
    </div>
  );
};
```

#### Product.Zone.tsx

```tsx
"use client";
import { ModelsProps } from "@akanjs/client";
import { ClientInit, ClientView } from "@akanjs/signal";
import { cnst, Product } from "@app/client";
import { Data, Load } from "@akanjs/ui";

export const Admin = ({ sliceName = "product", init, query }: ModelsProps<cnst.Product>) => {
  return (
    <Data.ListContainer
      init={init}
      query={query}
      sliceName={sliceName}
      renderItem={Product.Unit.Card}
      renderDashboard={Product.Util.Stat}
      renderTemplate={Product.Template.General}
      renderTitle={(product) => product.name}
      renderView={(product) => <Product.View.General product={product} />}
      columns={["name", "price", "status", "createdAt"]}
      actions={(product) => ["edit", "remove", "view"]}
    />
  );
};

export const Catalog = ({
  className,
  init,
  query,
}: {
  className?: string;
  init: ClientInit<"product", cnst.Product>;
  query?: Record<string, any>;
}) => {
  return (
    <div className={className}>
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="w-full md:w-1/4">
          <Product.Util.Filters />
        </div>

        <div className="w-full md:w-3/4">
          <Load.Units
            init={init}
            query={query}
            renderItem={(product) => (
              <Product.Unit.Card key={product.id} href={`/products/${product.id}`} product={product} />
            )}
            renderEmpty={() => <div className="p-8 text-center">No products found matching your criteria</div>}
            renderList={(products) => (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <Product.Unit.Card key={product.id} href={`/products/${product.id}`} product={product} />
                ))}
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
};

export const View = ({ view }: { view: ClientView<"product", cnst.Product> }) => {
  return <Load.View view={view} renderView={(product) => <Product.View.General product={product} />} />;
};
```
