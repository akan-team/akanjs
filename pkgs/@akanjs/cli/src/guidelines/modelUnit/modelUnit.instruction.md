# Model.Unit.tsx Files in Akan.js - Implementation Guide

## Purpose and Role of Model.Unit.tsx Files

Model.Unit.tsx files are foundational server components in the Akan.js framework that provide reusable presentation elements for domain models. They serve several critical purposes:

1. **Consistent Model Representation**: Create standardized visual representations of domain entities
2. **UI Building Blocks**: Serve as atomic components for building complex interfaces
3. **Presentation Layer**: Encapsulate rendering logic for `cnst.LightModel` data objects
4. **Cross-Component Reuse**: Enable consistent usage across pages, zones, templates, and utilities
5. **Server-Side Rendering**: Optimize for Next.js server components architecture

Key characteristics:

- **Server Components**: Do not use client-side hooks (useState, useEffect, etc.)
- **Model-Focused**: Primarily render `cnst.LightModel` data structures
- **Presentation-Only**: Contain no business logic, state management, or data fetching
- **Prop-Configurable**: Accept standardized props for customization
- **Composable**: Designed to work seamlessly with other Akan.js components

## How to Create Model.Unit.tsx Files

### 1. File Location and Naming

Model Unit files follow strict naming conventions:

```
libs/
  your-lib/
    lib/
      feature-name/
        FeatureName.Unit.tsx  # PascalCase for file name
```

### 2. Basic Structure and Exports

A typical Model.Unit.tsx file exports multiple component variations:

```tsx
import { clsx } from "clsx";
import { cnst } from "@your-lib/client";
import { Image, Link } from "@akanjs/ui";

// Compact representation (minimal details)
export const Abstract = ({
  product,
  className,
  href,
}: {
  product: cnst.LightProduct;
  className?: string;
  href?: string;
}) => {
  const Content = (
    <div className={clsx("flex items-center gap-3 rounded border p-2", className)}>
      {product.thumbnail && <Image file={product.thumbnail} className="h-12 w-12 rounded" alt={product.name} />}
      <div>
        <h3 className="font-medium">{product.name}</h3>
        <p className="text-sm text-gray-500">{product.price.toLocaleString()} KRW</p>
      </div>
    </div>
  );

  return href ? <Link href={href}>{Content}</Link> : Content;
};

// Medium detail representation (card style)
export const Card = ({ product, className }: { product: cnst.LightProduct; className?: string }) => (
  <div className={clsx("card bg-base-100 shadow-sm", className)}>
    {product.image && (
      <figure>
        <Image file={product.image} className="h-48 w-full object-cover" alt={product.name} />
      </figure>
    )}
    <div className="card-body p-4">
      <h2 className="card-title text-lg">{product.name}</h2>
      <p className="line-clamp-2 text-sm">{product.description}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-bold">{product.price.toLocaleString()} KRW</span>
        <span className={clsx("badge", product.inStock ? "badge-success" : "badge-error")}>
          {product.inStock ? "In Stock" : "Out of Stock"}
        </span>
      </div>
    </div>
  </div>
);

// Full detailed representation
export const Full = ({ product, className }: { product: cnst.LightProduct; className?: string }) => (
  <div className={clsx("overflow-hidden rounded-lg border", className)}>
    {product.image && <Image file={product.image} className="h-64 w-full object-cover" alt={product.name} />}
    <div className="p-4">
      <div className="mb-2 flex justify-between">
        <h2 className="text-xl font-bold">{product.name}</h2>
        <span className="text-lg font-bold">{product.price.toLocaleString()} KRW</span>
      </div>
      <p className="my-3">{product.description}</p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          Category: <span className="font-medium">{product.category}</span>
        </div>
        <div>
          SKU: <span className="font-medium">{product.sku}</span>
        </div>
        <div>
          Manufacturer: <span className="font-medium">{product.manufacturer}</span>
        </div>
        <div>
          Stock: <span className="font-medium">{product.stockQuantity}</span>
        </div>
      </div>
      {product.tags?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {product.tags.map((tag) => (
            <span key={tag} className="badge badge-outline">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
);

// Additional specialized variations as needed
export const Row = ({ product, className }: { product: cnst.LightProduct; className?: string }) => (
  <div className={clsx("flex items-center justify-between border-b p-3", className)}>
    <div className="flex items-center gap-3">
      {product.thumbnail && <Image file={product.thumbnail} className="h-10 w-10 rounded" alt={product.name} />}
      <div>
        <h3 className="font-medium">{product.name}</h3>
        <div className="text-xs text-gray-500">SKU: {product.sku}</div>
      </div>
    </div>
    <div className="text-right">
      <div className="font-bold">{product.price.toLocaleString()} KRW</div>
      <div className={clsx("text-xs", product.inStock ? "text-green-600" : "text-red-600")}>
        {product.inStock ? `${product.stockQuantity} in stock` : "Out of stock"}
      </div>
    </div>
  </div>
);
```

### 3. Integration with LightModel Types

Model Units work with LightModel types defined in constant files:

```tsx
// In your constant.ts file

export class LightProduct extends via(ProductObject, ["name", "price", "sku", "inStock"] as const) {
  get displayPrice() {
    return `${this.price.toLocaleString()} KRW`;
  }
}

// In your Unit.tsx file
import { cnst } from "@your-lib/client";

export const Abstract = ({ product }: { product: cnst.LightProduct }) => (
  <div>
    <h3>{product.name}</h3>
    <p>{product.displayPrice}</p>
  </div>
);
```

### 4. Implementation Guidelines

1. **Server Component Requirements**:

   - No client-side hooks (`useState`, `useEffect`, `useRouter`, etc.)
   - No browser-only APIs (`localStorage`, `window`, etc.)
   - No `"use client"` directive in the file

2. **Props Design**:

   - Primary prop should be the model object (e.g., `product`, `user`, `story`)
   - Always include `className` prop for styling customization
   - Include `href` prop when the component might be used for navigation
   - Keep prop interface consistent across export variations

3. **Component Variations**:

   - `Abstract`: Compact representation with minimal information
   - `Card`: Medium-detail representation in a card format
   - `Full`: Complete representation with all relevant details
   - Additional variations as needed (List, Row, Grid, etc.)

4. **Accessibility**:
   - Use semantic HTML elements (`<article>`, `<section>`, `<h2>`, etc.)
   - Include appropriate ARIA attributes
   - Ensure proper image alt text
   - Maintain keyboard navigability

## Best Practices

### 1. Component Variations and Consistent Exports

Define multiple components for different presentation contexts:

```tsx
// User.Unit.tsx - Consistent naming pattern
export const Abstract = ({ user }) => {}; // Minimal view
export const Card = ({ user }) => {}; // Card view
export const Full = ({ user }) => {}; // Complete view
export const Row = ({ user }) => {}; // Table row view
export const Avatar = ({ user }) => {}; // Avatar-only view
```

### 2. Prop Handling and Styling

```tsx
// Best practice: Accept and forward className
export const Abstract = ({
  user,
  className,
  ...props
}: {
  user: cnst.LightUser;
  className?: string;
  [key: string]: any;
}) => (
  <div className={clsx("user-abstract rounded border p-3", className)} {...props}>
    {/* content */}
  </div>
);

// Best practice: Conditional rendering based on available data
export const Card = ({ user, className }: { user: cnst.LightUser; className?: string }) => (
  <div className={clsx("card", className)}>
    <div className="card-body">
      <h3 className="card-title">{user.name}</h3>
      {user.title && <p className="text-sm text-gray-600">{user.title}</p>}
      {user.bio && <p className="mt-2">{user.bio}</p>}
      {user.tags?.length > 0 && (
        <div className="mt-2 flex gap-1">
          {user.tags.map((tag) => (
            <span key={tag} className="badge">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
);
```

### 3. Image Handling

Always use the optimized `Image` component from `@util/ui` with proper attributes:

```tsx
import { Image } from "@akanjs/ui";

export const Card = ({ product }: { product: cnst.LightProduct }) => (
  <div className="card">
    {product.image ? (
      <Image
        file={product.image}
        alt={product.name}
        className="h-40 w-full object-cover"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      />
    ) : (
      <div className="flex h-40 w-full items-center justify-center bg-gray-200">
        <span className="text-gray-400">No image</span>
      </div>
    )}
    {/* Other content */}
  </div>
);
```

### 4. Conditional Rendering and Link Handling

```tsx
export const Abstract = ({ post, href, className }: { post: cnst.LightPost; href?: string; className?: string }) => {
  const Content = (
    <div className={clsx("post-abstract p-3", className)}>
      <h3 className="font-bold">{post.title}</h3>
      <p className="line-clamp-2 text-sm text-gray-600">{post.summary}</p>
    </div>
  );

  // Conditionally wrap with Link if href is provided
  return href ? (
    <Link href={href} className="block transition hover:bg-gray-50">
      {Content}
    </Link>
  ) : (
    Content
  );
};
```

### 5. Responsive Design

```tsx
export const Card = ({ event }: { event: cnst.LightEvent }) => (
  <div className="card">
    <div className="card-body">
      <h3 className="text-lg font-bold md:text-xl">{event.title}</h3>
      <div className="flex flex-col sm:flex-row sm:justify-between">
        <div className="text-sm">{formatDate(event.startDate)}</div>
        <div className="mt-1 text-sm sm:mt-0">{event.location}</div>
      </div>
      <p className="mt-2 line-clamp-3 text-sm md:text-base">{event.description}</p>
    </div>
  </div>
);
```

## Common Component Patterns and Variations

### 1. Hierarchical Components

```tsx
// Department.Unit.tsx
export const Tree = ({ department }: { department: cnst.LightDepartment }) => (
  <div className="rounded border p-3">
    <h3 className="font-bold">{department.name}</h3>
    {department.children?.length > 0 && (
      <div className="mt-2 border-l pl-4">
        {department.children.map((child) => (
          <Tree key={child.id} department={child} />
        ))}
      </div>
    )}
  </div>
);
```

### 2. Status-Based Styling

```tsx
// Order.Unit.tsx
export const Card = ({ order }: { order: cnst.LightOrder }) => (
  <div className="rounded border p-4">
    <div className="flex justify-between">
      <h3 className="font-bold">#{order.orderNumber}</h3>
      <span
        className={clsx(
          "badge",
          order.status === "completed" && "badge-success",
          order.status === "processing" && "badge-info",
          order.status === "cancelled" && "badge-error",
          order.status === "pending" && "badge-warning"
        )}
      >
        {order.status}
      </span>
    </div>
    <div className="mt-2">
      <div>Customer: {order.customerName}</div>
      <div>Items: {order.itemCount}</div>
      <div>Total: {order.totalAmount.toLocaleString()} KRW</div>
    </div>
  </div>
);
```

### 3. Detail and Summary Pattern

```tsx
// FAQ.Unit.tsx
export const Item = ({ faq }: { faq: cnst.LightFAQ }) => (
  <details className="mb-2 overflow-hidden rounded border">
    <summary className="cursor-pointer bg-gray-50 p-3 font-medium hover:bg-gray-100">{faq.question}</summary>
    <div className="mt-2 p-3 pt-0">{faq.answer}</div>
  </details>
);
```

### 4. Grid and List Variations

```tsx
// Product.Unit.tsx
// For grid layouts
export const Grid = ({ product }: { product: cnst.LightProduct }) => (
  <div className="overflow-hidden rounded border">
    {product.image && <Image file={product.image} className="h-40 w-full object-cover" alt={product.name} />}
    <div className="p-3">
      <h3 className="truncate font-bold">{product.name}</h3>
      <p className="mt-1 font-bold">{product.price.toLocaleString()} KRW</p>
    </div>
  </div>
);

// For list layouts
export const List = ({ product }: { product: cnst.LightProduct }) => (
  <div className="flex border-b py-3">
    {product.thumbnail && <Image file={product.thumbnail} className="h-16 w-16 object-cover" alt={product.name} />}
    <div className="ml-3 flex-grow">
      <h3 className="font-medium">{product.name}</h3>
      <p className="line-clamp-1 text-sm text-gray-600">{product.description}</p>
    </div>
    <div className="ml-3 text-right">
      <p className="font-bold">{product.price.toLocaleString()} KRW</p>
      <p className="text-xs text-gray-500">SKU: {product.sku}</p>
    </div>
  </div>
);
```

## Troubleshooting Common Issues

### 1. Server Component Errors

```
Error: useState is not defined in Model.Unit.tsx
```

**Solution**: Keep Model.Unit.tsx as server components without client-side hooks:

```tsx
// ❌ INCORRECT: Don't use client hooks in Unit components
export const Card = ({ product }) => {
  const [expanded, setExpanded] = useState(false); // Error: client hook in server component
  return (/* ... */);
};

// ✅ CORRECT: Keep Unit components as pure presentation components
export const Card = ({ product, expanded = false }) => {
  return (/* Render based on expanded prop */);
};

// If you need interactivity, handle it in a client component that wraps the Unit:
// In a client component file:
"use client";
import { useState } from "react";
import { Product } from "@shared/client";

export const ExpandableProductCard = ({ product }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <Product.Unit.Card product={product} expanded={expanded} />
      <button onClick={() => setExpanded(!expanded)}>
        {expanded ? "Show Less" : "Show More"}
      </button>
    </div>
  );
};
```

### 2. Image Handling Errors

```
Error: Image component requires "alt" prop
```

**Solution**: Always include alt text for images:

```tsx
// ❌ INCORRECT
<Image file={product.image} className="w-full" />

// ✅ CORRECT
<Image
  file={product.image}
  alt={product.name || "Product image"}
  className="w-full"
/>
```

### 3. Conditional Rendering Issues

```
Error: Cannot read properties of undefined (reading 'url')
```

**Solution**: Always check for existence before accessing nested properties:

```tsx
// ❌ INCORRECT
<Image file={user.avatar.url} alt={user.name} />;

// ✅ CORRECT
{
  user.avatar?.url && <Image file={user.avatar} alt={user.name} />;
}

// Alternative approach with default/fallback
{
  user.avatar?.url ? (
    <Image file={user.avatar} alt={user.name} />
  ) : (
    <div className="avatar-placeholder">{user.name.charAt(0).toUpperCase()}</div>
  );
}
```

### 4. Type Safety Issues

```
Type error: Property 'description' does not exist on type 'LightProduct'
```

**Solution**: Ensure you're only accessing properties defined in the LightModel:

```tsx
// In constant.ts

export class LightProduct extends via(ProductObject, ["name", "price", "sku"] as const) {
  // Only these fields are guaranteed to be available
}

// ❌ INCORRECT: Accessing properties not in the LightModel
export const Card = ({ product }: { product: cnst.LightProduct }) => (
  <div>
    <h3>{product.name}</h3>
    <p>{product.description}</p> // Error: description is not in LightProduct
  </div>
);

// ✅ CORRECT: Check for optional properties
export const Card = ({ product }: { product: cnst.LightProduct }) => (
  <div>
    <h3>{product.name}</h3>
    {/* Use optional chaining for properties that might not exist */}
    {product.description && <p>{product.description}</p>}
  </div>
);
```

## Conclusion

Model.Unit.tsx files are essential building blocks in the Akan.js framework, providing consistent, reusable presentation components for your domain models. By following these guidelines, you'll create well-structured, performant, and maintainable UI components that work seamlessly across your application.

Key takeaways:

- Create multiple component variations (Abstract, Card, Full, etc.) for different use cases
- Keep components as server components without client-side hooks
- Focus on presentation only, leaving business logic to Service files
- Follow consistent prop patterns with className and href support
- Ensure type safety by respecting LightModel type definitions

Well-designed Model.Unit components improve development velocity, maintain UI consistency, and enable seamless component reuse throughout your Akan.js applications.
