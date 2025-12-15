# Akan.js Model.View.tsx Implementation Guide

## Purpose and Role of Model.View.tsx Files in the Akan.js Architecture

Model.View.tsx files serve as specialized server components within the Akan.js framework that provide comprehensive presentation layers for domain models. They fulfill several critical roles:

- **Complete Data Visualization**: Present full, detailed views of domain entities
- **Page-Level Components**: Serve as primary content components for application pages
- **Consistent Representation**: Ensure uniform presentation of domain models
- **Server-Side Optimization**: Leverage Next.js server components for performance
- **Cross-Component Integration**: Provide view components that integrate with the broader component ecosystem

In the Akan.js component hierarchy, View components sit between high-level Zones (layout containers) and lower-level Units (list items/cards), providing comprehensive representations of domain models.

## Core Principles of Model.View.tsx Components

1. **Server-First Architecture**: View components are server components, optimized for static rendering
2. **Presentation Focus**: Concentrate solely on displaying data, not managing state or handling interactions
3. **Model-Centric Design**: Build around domain model structures (`cnst.Model`)
4. **Composition-Based**: Composed of smaller, focused components for different aspects of the model
5. **Responsive UI**: Adapt to different screen sizes and viewport conditions
6. **Accessibility**: Follow best practices for screen readers and keyboard navigation
7. **No Client-Side Hooks**: Avoid `useState`, `useEffect`, and other client-side React hooks

## File Structure and Component Organization

### Location and Naming Convention

```
apps/
  app-name/
    lib/
      feature-name/
        FeatureName.View.tsx  # PascalCase for file and component names
```

### Component Structure

A typical Model.View.tsx file exports multiple component variations:

```tsx
import { clsx } from "clsx";
import { cnst } from "@your-lib/client";
import { Card, Section } from "@util/ui";

// Basic view interface
export interface ProductViewProps {
  product: cnst.Product;
  className?: string;
}

// General view (default/standard view)
export const General = ({ product, className }: ProductViewProps) => (
  <div className={clsx("animate-fadeIn space-y-6", className)}>
    <h1 className="text-2xl font-bold">{product.name}</h1>
    <div className="flex gap-4">
      <div className="w-2/3">
        <h2 className="mb-2 text-xl">Description</h2>
        <p>{product.description}</p>
        {/* More product details */}
      </div>
      <div className="w-1/3">
        <Card className="p-4">
          <h3 className="mb-2 text-lg font-medium">Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Price:</span>
              <span className="font-bold">{product.price.toLocaleString()} KRW</span>
            </div>
            <div className="flex justify-between">
              <span>In Stock:</span>
              <span>{product.inStock ? "Yes" : "No"}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
);

// Specialized views for different contexts
export const Dashboard = ({ product }: ProductViewProps) => (
  <Section title={product.name} className="dashboard-view">
    {/* Dashboard-specific presentation */}
  </Section>
);

export const Printable = ({ product }: ProductViewProps) => (
  <div className="print-only">{/* Print-optimized view */}</div>
);
```

## Props Design and Interfaces

Model.View components use consistent prop interfaces that follow these patterns:

```tsx
// Basic pattern
export interface ProductViewProps {
  product: cnst.Product; // The primary model object
  className?: string; // For styling customization
}

// With additional configuration options
export interface OrderViewProps {
  order: cnst.Order;
  className?: string;
  showDetails?: boolean; // Optional display configuration
  highlightStatus?: boolean;
}

// With variant/type discrimination
export type InvoiceViewProps =
  | { invoice: cnst.Invoice; variant: "summary"; className?: string }
  | { invoice: cnst.Invoice; variant: "detailed"; showPayments: boolean; className?: string };

export const Invoice = (props: InvoiceViewProps) => {
  if (props.variant === "summary") {
    return <InvoiceSummary invoice={props.invoice} className={props.className} />;
  } else {
    return <InvoiceDetailed invoice={props.invoice} showPayments={props.showPayments} className={props.className} />;
  }
};
```

## Component Variations and Specialized Views

Model.View components typically include multiple variations for different use cases:

1. **General**: Standard, complete view of the model
2. **Summary/Dashboard**: Condensed view with key information
3. **Detailed**: Expanded view with all available information
4. **Print/Export**: View optimized for printing or exporting
5. **Specialized**: Context-specific views (admin, customer, etc.)

Example implementation:

```tsx
// General view (standard)
export const General = ({ project }: ProjectViewProps) => (
  <div className="project-view">
    <h1>{project.name}</h1>
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">{/* Project information organized in a grid */}</div>
  </div>
);

// Timeline view (specialized)
export const Timeline = ({ project }: ProjectViewProps) => (
  <div className="project-timeline">{/* Timeline visualization of project milestones */}</div>
);

// Financial view (specialized)
export const Financial = ({ project }: ProjectViewProps) => (
  <div className="project-financials">{/* Financial breakdown and charts */}</div>
);
```

## Integration with Other Akan.js Components

Model.View components work seamlessly with other components in the Akan.js ecosystem:

### Used in Pages

```tsx
// app/products/[id]/page.tsx
import { Product } from "@shared/client";

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await getProductById(params.id);

  return (
    <div className="container mx-auto py-8">
      <Product.View.General product={product} />
    </div>
  );
}
```

### Used in Utils (Client Components)

```tsx
// Product.Util.tsx
"use client";
import { useState } from "react";
import { Product } from "@shared/client";
import { cnst, st } from "@shared/client";

export const ProductViewer = ({ productId }: { productId: string }) => {
  const product = st.use.product(productId);
  const [view, setView] = useState<"general" | "specifications">("general");

  if (!product) return <div>Loading...</div>;

  return (
    <div>
      <div className="tabs mb-4">
        <button className={`tab ${view === "general" ? "tab-active" : ""}`} onClick={() => setView("general")}>
          General
        </button>
        <button
          className={`tab ${view === "specifications" ? "tab-active" : ""}`}
          onClick={() => setView("specifications")}
        >
          Specifications
        </button>
      </div>

      {view === "general" ? (
        <Product.View.General product={product} />
      ) : (
        <Product.View.Specifications product={product} />
      )}
    </div>
  );
};
```

### Used in Zones (Layout Containers)

```tsx
// Product.Zone.tsx
"use client";
import { useState } from "react";
import { Product } from "@shared/client";
import { cnst, st } from "@shared/client";
import { Zone } from "@util/ui";

export const ProductManagerZone = () => {
  const products = st.use.productList();
  const [selectedProduct, setSelectedProduct] = useState<cnst.Product | null>(null);

  return (
    <Zone title="Product Management">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Zone.Section title="Products">
            {/* Product list for selection */}
            {products.map((product) => (
              <button key={product.id} onClick={() => setSelectedProduct(product)} className="mb-2 w-full text-left">
                <Product.Unit.Abstract product={product} />
              </button>
            ))}
          </Zone.Section>
        </div>

        <div className="lg:col-span-2">
          <Zone.Section title="Selected Product">
            {selectedProduct ? (
              <Product.View.General product={selectedProduct} />
            ) : (
              <div className="py-8 text-center text-gray-500">Select a product to view details</div>
            )}
          </Zone.Section>
        </div>
      </div>
    </Zone>
  );
};
```

## Server Component Considerations

Model.View.tsx files are server components and must follow these constraints:

1. **No Client-Side Hooks**:

   - No `useState`, `useEffect`, `useRef`, etc.
   - No `useRouter` or other Next.js client hooks
   - No browser APIs (`window`, `localStorage`, etc.)

2. **No Event Handlers**:

   - No `onClick`, `onChange`, or other event handlers
   - No form submission handling

3. **No "use client" Directive**:

   - The file should not include the "use client" directive

4. **Static Props Only**:
   - Props should be static and not depend on client-side state
   - Data should be passed in explicitly through props

If you need interactivity, wrap the View component in a client component (typically in a Util.tsx file).

## Best Practices for Effective View Components

### 1. Consistent Layout Structure

```tsx
export const General = ({ invoice }: InvoiceViewProps) => (
  <div className="space-y-8">
    {/* Header section */}
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">Invoice #{invoice.number}</h1>
      <div className="badge badge-lg">{invoice.status}</div>
    </div>

    {/* Metadata section */}
    <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4">
      <div>
        <h2 className="text-sm text-gray-500">Client</h2>
        <p className="font-medium">{invoice.client.name}</p>
      </div>
      <div>
        <h2 className="text-sm text-gray-500">Issue Date</h2>
        <p className="font-medium">{formatDate(invoice.issueDate)}</p>
      </div>
      {/* More metadata fields */}
    </div>

    {/* Main content section */}
    <div>
      <h2 className="mb-4 text-xl font-semibold">Line Items</h2>
      <table className="w-full">{/* Table content */}</table>
    </div>

    {/* Summary section */}
    <div className="flex justify-end">
      <div className="w-64 space-y-2">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{formatCurrency(invoice.subtotal)}</span>
        </div>
        {/* More summary rows */}
        <div className="flex justify-between border-t pt-2 text-lg font-bold">
          <span>Total:</span>
          <span>{formatCurrency(invoice.total)}</span>
        </div>
      </div>
    </div>
  </div>
);
```

### 2. Responsive Design

```tsx
export const General = ({ product }: ProductViewProps) => (
  <div className="animate-fadeIn">
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Images - full width on mobile, 40% on desktop */}
      <div className="w-full lg:w-2/5">
        {product.images && product.images.length > 0 ? (
          <div className="relative aspect-square overflow-hidden rounded-lg">
            <Image src={product.images[0].url} alt={product.name} fill className="object-cover" />
          </div>
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-200">
            <span className="text-gray-400">No image available</span>
          </div>
        )}
      </div>

      {/* Product info - full width on mobile, 60% on desktop */}
      <div className="w-full lg:w-3/5">
        <h1 className="text-xl font-bold md:text-2xl lg:text-3xl">{product.name}</h1>
        <div className="text-primary mt-2 text-lg font-medium md:text-xl">{formatCurrency(product.price)}</div>

        {/* Responsive grid for specifications */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {product.specifications.map((spec) => (
            <div key={spec.id} className="border-b pb-2">
              <span className="text-sm text-gray-500">{spec.name}:</span>
              <div>{spec.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);
```

### 3. Conditional Rendering for Edge Cases

```tsx
export const General = ({ order }: OrderViewProps) => (
  <div className="order-view">
    <h1 className="text-2xl font-bold">Order #{order.number}</h1>

    {/* Handle missing customer information */}
    <div className="mt-4">
      <h2 className="text-lg font-medium">Customer</h2>
      {order.customer ? (
        <div className="mt-2">
          <p>{order.customer.name}</p>
          <p>{order.customer.email}</p>
          <p>{order.customer.phone || "No phone provided"}</p>
        </div>
      ) : (
        <p className="text-gray-500 italic">Customer information not available</p>
      )}
    </div>

    {/* Handle empty item lists */}
    <div className="mt-6">
      <h2 className="text-lg font-medium">Items</h2>
      {order.items && order.items.length > 0 ? (
        <table className="mt-2 w-full">{/* Table content */}</table>
      ) : (
        <p className="mt-2 text-gray-500 italic">No items in this order</p>
      )}
    </div>

    {/* Conditional sections based on order status */}
    {order.status === "delivered" && (
      <div className="mt-6 rounded-lg bg-green-50 p-4">
        <h2 className="text-lg font-medium text-green-800">Delivery Information</h2>
        <p className="mt-2">Delivered on: {formatDate(order.deliveryDate)}</p>
        {order.signedBy && <p>Signed by: {order.signedBy}</p>}
      </div>
    )}
  </div>
);
```

### 4. Component Composition for Complex Views

```tsx
// Helper components for complex views
const OrderHeader = ({ order }: { order: cnst.Order }) => (
  <div className="flex items-center justify-between">
    <h1 className="text-2xl font-bold">Order #{order.number}</h1>
    <StatusBadge status={order.status} />
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const statusStyles = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    shipped: "bg-purple-100 text-purple-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusStyles[status] || "bg-gray-100"}`}>
      {status}
    </span>
  );
};

const OrderItems = ({ items }: { items: cnst.OrderItem[] }) => (
  <div className="mt-6">
    <h2 className="mb-2 text-lg font-medium">Items</h2>
    <div className="overflow-hidden rounded-lg border">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={clsx("flex items-center justify-between p-4", index < items.length - 1 && "border-b")}
        >
          <div className="flex items-center">
            {item.product.image && (
              <div className="mr-4 h-12 w-12">
                <Image src={item.product.image} alt={item.product.name} width={48} height={48} />
              </div>
            )}
            <div>
              <div className="font-medium">{item.product.name}</div>
              <div className="text-sm text-gray-500">Qty: {item.quantity}</div>
            </div>
          </div>
          <div className="text-right">
            <div>{formatCurrency(item.price)}</div>
            <div className="text-sm text-gray-500">{formatCurrency(item.price * item.quantity)}</div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// Main component combining the pieces
export const General = ({ order }: OrderViewProps) => (
  <div className="space-y-6">
    <OrderHeader order={order} />
    <CustomerSection customer={order.customer} />
    <OrderItems items={order.items} />
    <ShippingSection shipping={order.shipping} />
    <PaymentSection payment={order.payment} />
    <TotalsSection totals={order.totals} />
  </div>
);
```

## How to Use Model.View.tsx in Pages, Utils and Zones

### In Pages (Server Components)

```tsx
// app/orders/[id]/page.tsx
import { Order } from "@shared/client";
import { getOrderById } from "@shared/lib/order/order.service";

export default async function OrderPage({ params }: { params: { id: string } }) {
  const order = await getOrderById(params.id);

  return (
    <div className="container mx-auto py-8">
      <Order.View.General order={order} />
    </div>
  );
}
```

### In Utils (Client Components)

```tsx
// Order.Util.tsx
"use client";
import { useState } from "react";
import { Order } from "@shared/client";
import { st } from "@shared/client";

export const OrderViewer = ({ orderId }: { orderId: string }) => {
  const order = st.use.order(orderId);
  const [view, setView] = useState<"general" | "items" | "shipping">("general");

  if (!order) return <div className="animate-pulse">Loading...</div>;

  return (
    <div>
      <div className="tabs mb-4">
        <button className={`tab ${view === "general" ? "tab-active" : ""}`} onClick={() => setView("general")}>
          Overview
        </button>
        <button className={`tab ${view === "items" ? "tab-active" : ""}`} onClick={() => setView("items")}>
          Items
        </button>
        <button className={`tab ${view === "shipping" ? "tab-active" : ""}`} onClick={() => setView("shipping")}>
          Shipping
        </button>
      </div>

      {view === "general" && <Order.View.General order={order} />}
      {view === "items" && <Order.View.Items order={order} />}
      {view === "shipping" && <Order.View.Shipping order={order} />}

      <div className="mt-6 flex justify-end space-x-2">
        <button className="btn btn-outline" onClick={() => st.do.printOrder(orderId)}>
          Print
        </button>
        {order.status === "pending" && (
          <button className="btn btn-primary" onClick={() => st.do.processOrder(orderId)}>
            Process Order
          </button>
        )}
      </div>
    </div>
  );
};
```

### In Zones (Layout Containers)

```tsx
// Dashboard.Zone.tsx
"use client";
import { useState, useEffect } from "react";
import { Order, Product } from "@shared/client";
import { sig } from "@shared/client";
import { Zone, Tabs } from "@util/ui";

export const AnalyticsDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const dashboardData = await sig.analytics.getDashboardData();
        setData(dashboardData);
      } catch (error) {
        console.error("Failed to load dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) return <div className="animate-pulse">Loading dashboard...</div>;
  if (!data) return <div>Failed to load dashboard data</div>;

  return (
    <Zone title="Business Analytics">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Zone.Section title="Recent Orders">
          {data.recentOrders.map((order) => (
            <div key={order.id} className="mb-4">
              <Order.View.Summary order={order} />
            </div>
          ))}
        </Zone.Section>

        <Zone.Section title="Top Products">
          {data.topProducts.map((product) => (
            <div key={product.id} className="mb-4">
              <Product.View.Performance product={product} />
            </div>
          ))}
        </Zone.Section>
      </div>

      <Zone.Section title="Sales Overview">
        <SalesChart data={data.salesData} />
      </Zone.Section>
    </Zone>
  );
};
```

## Common Patterns and Advanced Techniques

### 1. Status-Based Visualizations

```tsx
export const StatusSummary = ({ project }: ProjectViewProps) => {
  // Determine color based on status
  const statusColor =
    {
      planning: "bg-blue-100 text-blue-800",
      active: "bg-green-100 text-green-800",
      onHold: "bg-yellow-100 text-yellow-800",
      completed: "bg-purple-100 text-purple-800",
      cancelled: "bg-red-100 text-red-800",
    }[project.status] || "bg-gray-100 text-gray-800";

  // Calculate progress percentage
  const progress = (project.completedTasks / (project.totalTasks || 1)) * 100;

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">{project.name}</h2>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusColor}`}>{project.status}</span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Progress</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-200">
          <div className="h-2.5 rounded-full bg-blue-600" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-center">
        <div>
          <div className="text-sm text-gray-500">Tasks</div>
          <div className="font-bold">
            {project.completedTasks}/{project.totalTasks}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Due Date</div>
          <div className="font-bold">{formatDate(project.dueDate)}</div>
        </div>
      </div>
    </div>
  );
};
```

### 2. Hierarchical Data Display

```tsx
export const OrgChart = ({ department }: DepartmentViewProps) => {
  // Recursive component for displaying a department and its subdepartments
  const DepartmentNode = ({ dept, level = 0 }: { dept: cnst.Department; level: number }) => (
    <div className={`pl-${level * 6}`}>
      <div className="my-1 flex items-center rounded border p-2">
        <div className="font-bold">{dept.name}</div>
        <div className="ml-2 text-sm text-gray-500">({dept.employeeCount} employees)</div>
      </div>

      {dept.subdepartments?.map((subdept) => <DepartmentNode key={subdept.id} dept={subdept} level={level + 1} />)}
    </div>
  );

  return (
    <div className="department-hierarchy">
      <h2 className="mb-4 text-xl font-bold">Organization Structure</h2>
      <DepartmentNode dept={department} level={0} />
    </div>
  );
};
```

### 3. Multi-Section Views with Tabs

```tsx
export const Product = ({ product }: ProductViewProps) => (
  <div className="product-view">
    <h1 className="mb-6 text-2xl font-bold">{product.name}</h1>

    <div className="tabs tabs-boxed mb-6">
      <a className="tab tab-active">Overview</a>
      <a className="tab">Specifications</a>
      <a className="tab">Reviews</a>
    </div>

    <div className="tab-content">
      {/* Overview section - active by default */}
      <div className="space-y-4">
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Product image */}
          <div className="md:w-1/2">
            {product.image && (
              <div className="aspect-square overflow-hidden rounded-lg">
                <Image src={product.image} alt={product.name} fill className="object-contain" />
              </div>
            )}
          </div>

          {/* Product details */}
          <div className="md:w-1/2">
            <div className="text-primary text-xl font-bold">{formatCurrency(product.price)}</div>

            <div className="mt-4">
              <h2 className="mb-2 text-lg font-medium">Description</h2>
              <p>{product.description}</p>
            </div>

            <div className="mt-4">
              <h2 className="mb-2 text-lg font-medium">Features</h2>
              <ul className="list-disc space-y-1 pl-5">
                {product.features?.map((feature, index) => <li key={index}>{feature}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Other tab contents would be here but hidden initially */}
    </div>
  </div>
);
```

## Performance Optimization Strategies

### 1. Optimize Images and Media

```tsx
import { Image } from "@akanjs/ui"; // Optimized image component

export const General = ({ product }: ProductViewProps) => (
  <div className="product-view">
    {product.image && (
      <Image
        src={product.image}
        alt={product.name}
        width={600}
        height={600}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        priority={false}
        loading="lazy"
        className="h-auto w-full rounded-lg object-contain"
      />
    )}
    {/* Rest of the product view */}
  </div>
);
```

### 2. Conditional Rendering for Complex Content

```tsx
export const Dashboard = ({ project }: ProjectViewProps) => (
  <div className="project-dashboard">
    {/* Always render essential information */}
    <div className="mb-6">
      <h1 className="text-2xl font-bold">{project.name}</h1>
      <div className="mt-2 flex gap-2">
        <span className={`badge ${getStatusBadgeClass(project.status)}`}>{project.status}</span>
        <span className="text-sm text-gray-500">Due: {formatDate(project.dueDate)}</span>
      </div>
    </div>

    {/* Only render charts if project has tasks */}
    {project.tasks?.length > 0 && (
      <div className="mb-6">
        <h2 className="mb-2 text-lg font-medium">Progress Overview</h2>
        <ProgressChart tasks={project.tasks} />
      </div>
    )}

    {/* Only render team section if project has team members */}
    {project.team?.length > 0 && (
      <div className="mb-6">
        <h2 className="mb-2 text-lg font-medium">Team</h2>
        <div className="flex flex-wrap gap-2">
          {project.team.map((member) => (
            <TeamMemberBadge key={member.id} member={member} />
          ))}
        </div>
      </div>
    )}
  </div>
);
```

### 3. Chunking Large Data Displays

```tsx
export const OrderList = ({ orders }: { orders: cnst.Order[] }) => (
  <div className="space-y-6">
    <h2 className="text-xl font-bold">Orders ({orders.length})</h2>

    {/* Group orders by month for better organization */}
    {Object.entries(groupByMonth(orders)).map(([month, monthOrders]) => (
      <div key={month}>
        <h3 className="mb-2 text-lg font-medium">{month}</h3>
        <div className="space-y-2">
          {monthOrders.map((order) => (
            <Order.View.Summary key={order.id} order={order} />
          ))}
        </div>
      </div>
    ))}
  </div>
);

// Helper function to group orders by month
function groupByMonth(orders: cnst.Order[]) {
  return orders.reduce((groups, order) => {
    const month = new Date(order.createdAt).toLocaleString("default", { month: "long", year: "numeric" });
    if (!groups[month]) groups[month] = [];
    groups[month].push(order);
    return groups;
  }, {});
}
```

## Troubleshooting and Common Issues

### 1. "useState is not defined" or "use client" Error

**Problem**: Server component using client-side hooks

```tsx
// ❌ Error: This is a server component that's using client-side hooks
export const ProductView = ({ product }) => {
  const [expanded, setExpanded] = useState(false);
  // ...
};
```

**Solution**: Move interactive elements to client components

```tsx
// ✅ Server component (View.tsx) - pure presentation
export const ProductView = ({ product, expanded = false }) => (
  <div>
    <h1>{product.name}</h1>
    {expanded && <div className="mt-4">{/* Additional details */}</div>}
  </div>
);

// In a separate Util.tsx file (client component)
("use client");
import { useState } from "react";
import { Product } from "@your-lib/client";

export const ExpandableProduct = ({ product }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <Product.View.ProductView product={product} expanded={expanded} />
      <button onClick={() => setExpanded(!expanded)}>{expanded ? "Show Less" : "Show More"}</button>
    </div>
  );
};
```

### 2. Missing or Undefined Data

**Problem**: Trying to access properties on potentially undefined data

```tsx
// ❌ Error: Cannot read properties of undefined (reading 'name')
export const CustomerView = ({ order }) => (
  <div>
    <h2>Customer</h2>
    <p>{order.customer.name}</p> // Error if customer is undefined
    <p>{order.customer.email}</p>
  </div>
);
```

**Solution**: Add proper null checks and fallbacks

```tsx
// ✅ With proper null checks
export const CustomerView = ({ order }) => (
  <div>
    <h2>Customer</h2>
    {order.customer ? (
      <>
        <p>{order.customer.name}</p>
        <p>{order.customer.email || "No email provided"}</p>
      </>
    ) : (
      <p className="text-gray-500 italic">No customer information available</p>
    )}
  </div>
);
```

### 3. Layout Shifts Due to Conditional Rendering

**Problem**: Content jumps when conditional elements render

**Solution**: Use fixed-height placeholders or layout containers

```tsx
export const ProductDetails = ({ product }: ProductViewProps) => (
  <div className="product-details">
    {/* Images - maintain consistent height */}
    <div className="aspect-square overflow-hidden rounded-lg bg-gray-100">
      {product.image ? (
        <Image src={product.image} alt={product.name} fill className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center">
          <span className="text-gray-400">No image available</span>
        </div>
      )}
    </div>

    {/* Product information with consistent spacing */}
    <div className="mt-4 min-h-[200px]">
      <h1 className="text-xl font-bold">{product.name}</h1>
      <div className="text-primary mt-2 font-bold">{formatCurrency(product.price)}</div>

      <div className="mt-4 h-[100px] overflow-auto">
        {product.description ? (
          <p>{product.description}</p>
        ) : (
          <p className="text-gray-500 italic">No description available</p>
        )}
      </div>
    </div>
  </div>
);
```

### 4. Over-Fetching Data in Nested Views

**Problem**: Nested components causing excessive data fetching

**Solution**: Pass only required data from parent to child components

```tsx
// Parent component passes only necessary data
export const OrderView = ({ order }: OrderViewProps) => (
  <div className="order-view">
    <h1>Order #{order.number}</h1>

    <div className="mt-6">
      <h2>Customer</h2>
      <CustomerSummary customer={order.customer} />
    </div>

    <div className="mt-6">
      <h2>Items</h2>
      {order.items.map((item) => (
        <OrderItemRow
          key={item.id}
          productName={item.product.name}
          quantity={item.quantity}
          price={item.price}
          // Only pass needed fields, not the entire product object
        />
      ))}
    </div>
  </div>
);
```

## Conclusion

Model.View.tsx components are a fundamental building block in the Akan.js component architecture, providing consistent, reusable presentation layers for domain models. By following the guidelines in this document, you'll create View components that:

- Provide comprehensive visual representations of domain models
- Work seamlessly with other components in the Akan.js ecosystem
- Leverage the performance benefits of Next.js server components
- Are maintainable, scalable, and follow consistent patterns

Remember the key principles:

1. Focus on presentation, not interaction
2. Follow server component constraints
3. Organize in logical component variations
4. Design for reuse across pages, Utils, and Zones
5. Handle edge cases and provide fallbacks
6. Optimize for performance and accessibility

With these principles in mind, your Model.View.tsx components will provide a solid foundation for your Akan.js application's user interface.
