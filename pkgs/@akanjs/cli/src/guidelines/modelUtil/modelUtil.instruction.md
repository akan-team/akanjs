# Model.Util Implementation Guide for Akan.js

## Purpose and Role of Model.Util.ts Files

`Model.Util.tsx` files are specialized client-side components in the Akan.js framework that provide reusable utility components encapsulating model-specific functionality. They serve several critical roles:

1. **Action Handlers**: Implement UI-triggered operations (create, read, update, delete)
2. **Interactive UI Elements**: Provide specialized buttons, forms, menus, and controls
3. **Data Visualization**: Create model-specific charts, stats, and insights displays
4. **Store Integration**: Connect UI components to Zustand store state and actions
5. **Signal Integration**: Encapsulate API calls through signal methods
6. **Client-side Logic**: Implement complex client-side business logic and validations
7. **Composite Components**: Combine multiple UI elements into cohesive functional units

Key characteristics of Model.Util components:

- **Client Components**: Always marked with `"use client"` directive
- **Model-Specific**: Tailored to a particular domain model
- **Reusable**: Designed to be used across different parts of the application
- **Self-Contained**: Handle their own loading, error, and success states
- **Typed**: Use TypeScript for prop definitions and return values
- **Functional**: Implement React's functional component pattern

## How to Create Model.Util.ts Files

### Basic Structure

```tsx
// File: lib/modelName/ModelName.Util.tsx
"use client";

import { useState } from "react";
import { Button, Modal } from "@util/ui";
import { st } from "../st";
import { sig } from "../sig";
import { dict } from "../dict";

// Simple action button
export const CreateButton = () => {
  const { setModelForm, showCreateModal } = st.do.model();

  return (
    <Button
      variant="primary"
      onClick={() => {
        setModelForm({});
        showCreateModal();
      }}
    >
      {dict.model.create_new}
    </Button>
  );
};

// Complex utility with state management
export const FilterPanel = ({ onFilter }: { onFilter: (filters: any) => void }) => {
  const [filters, setFilters] = useState({});

  const handleFilter = () => {
    onFilter(filters);
  };

  return (
    <div className="filter-panel">
      {/* Filter inputs */}
      <Button onClick={handleFilter}>{dict.common.apply_filters}</Button>
    </div>
  );
};

// Additional utility components...
```

### Common Patterns and Implementations

#### 1. Action Buttons

Action buttons trigger specific operations on models, often connecting to store actions:

```tsx
export const DeleteButton = ({ id, name }: { id: string; name: string }) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const { deleteModel } = st.do.model();

  const handleDelete = async () => {
    await deleteModel(id);
    setIsConfirming(false);
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setIsConfirming(true)}>
        {dict.common.delete}
      </Button>

      <Modal isOpen={isConfirming} onClose={() => setIsConfirming(false)} title={dict.model.confirm_delete}>
        <p>{dict.model.delete_confirmation.replace("{name}", name)}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsConfirming(false)}>
            {dict.common.cancel}
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            {dict.common.delete}
          </Button>
        </div>
      </Modal>
    </>
  );
};
```

#### 2. Data Display Components

Components that visualize model data in specialized ways:

```tsx
export const StatsPanel = ({ modelId }: { modelId: string }) => {
  const { model } = st.use.model((state) => ({
    model: state.models[modelId],
  }));

  if (!model) return null;

  return (
    <div className="stats-grid">
      <StatCard title={dict.model.total_views} value={model.stats.views} icon={<EyeIcon />} />
      <StatCard title={dict.model.completion_rate} value={`${model.stats.completionRate}%`} icon={<ChartIcon />} />
      {/* Additional stats */}
    </div>
  );
};
```

#### 3. Form Wrappers

Components that encapsulate form handling logic:

```tsx
export const QuickEditForm = ({ id }: { id: string }) => {
  const { model } = st.use.model((state) => ({
    model: state.models[id],
  }));
  const { updateModel } = st.do.model();
  const [form, setForm] = useState(model || {});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await updateModel(id, form);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!model) return null;

  return (
    <form onSubmit={handleSubmit}>
      <Field.Text
        label={dict.model.name}
        value={form.name || ""}
        onChange={(value) => setForm({ ...form, name: value })}
      />
      {/* Additional fields */}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? dict.common.saving : dict.common.save}
      </Button>
    </form>
  );
};
```

## Using with Store Actions and State

Util components often connect to the model's store to access state and actions:

```tsx
export const StatusToggle = ({ id }: { id: string }) => {
  // Using store selectors to get only what we need
  const { status, isUpdating } = st.use.model((state) => ({
    status: state.models[id]?.status,
    isUpdating: state.updating[id] || false,
  }));

  // Using store actions
  const { updateModelStatus } = st.do.model();

  const toggleStatus = () => {
    const newStatus = status === "active" ? "inactive" : "active";
    updateModelStatus(id, newStatus);
  };

  return (
    <Toggle
      checked={status === "active"}
      onChange={toggleStatus}
      disabled={isUpdating}
      label={dict.model.status_labels[status || "unknown"]}
    />
  );
};
```

### Best Practices for Store Integration

1. **Selective State Access**: Use selectors to extract only the specific state pieces needed
2. **Action Abstraction**: Use store actions rather than directly mutating state
3. **Loading State**: Track and handle loading states from the store
4. **Error Handling**: Handle and display error states from the store

## Using with Signal API Calls

Util components can make direct API calls using signal methods:

```tsx
export const RefreshButton = ({ id, onRefresh }: { id: string; onRefresh?: () => void }) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { setModel } = st.do.model();

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      const refreshedModel = await sig.model.getModel({ id });
      setModel(refreshedModel);
      onRefresh?.();
    } catch (error) {
      console.error("Failed to refresh model:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
      {isRefreshing ? <Spinner size="sm" /> : <RefreshIcon />}
      {dict.common.refresh}
    </Button>
  );
};
```

### Best Practices for Signal Integration

1. **Loading States**: Always show loading indicators during API calls
2. **Error Handling**: Implement proper error catching and user feedback
3. **Optimistic Updates**: Consider updating UI optimistically before API response
4. **Store Integration**: Update the store with API response data
5. **Debouncing**: Implement debouncing for frequent operations (e.g., search)

## Performance Optimization Techniques

### 1. Memoization

Use React's `memo` and `useMemo` to prevent unnecessary re-renders:

```tsx
import { memo, useMemo } from "react";

export const ExpensiveComponent = memo(({ data }: { data: any[] }) => {
  const processedData = useMemo(() => {
    return data.map(item => /* expensive computation */);
  }, [data]);

  return <div>{/* render using processedData */}</div>;
});
```

### 2. Lazy Loading

Use dynamic imports for heavy components:

```tsx
import dynamic from "next/dynamic";

const LazyChartComponent = dynamic(() => import("./ChartComponent"), {
  loading: () => <div>Loading chart...</div>,
  ssr: false, // Disable server-side rendering if component uses browser APIs
});

export const ModelInsights = ({ id }: { id: string }) => {
  const { shouldShowChart } = st.use.model();

  return <div>{shouldShowChart && <LazyChartComponent id={id} />}</div>;
};
```

### 3. Virtualization

For large lists, use virtualization libraries:

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

export const VirtualizedList = ({ items }: { items: any[] }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // estimated row height
  });

  return (
    <div ref={parentRef} style={{ height: "400px", overflow: "auto" }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {/* Render item content */}
            {items[virtualItem.index].name}
          </div>
        ))}
      </div>
    </div>
  );
};
```

## How to Use Model.Util.ts Files in Pages

In Next.js pages, Util components can be used directly since pages are client components:

```tsx
// app/models/page.tsx
"use client";

import { Model } from "@client";
import { Container } from "@util/ui";

export default function ModelsPage() {
  return (
    <Container>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{dict.model.title}</h1>
        <Model.Util.CreateButton />
      </div>

      <Model.Util.FilterPanel />

      <Model.View.List />
    </Container>
  );
}
```

In server component pages, use client boundaries:

```tsx
// app/models/[id]/page.tsx
import { Model } from "@client";
import { ClientOnly } from "@util/ui";

// This is a server component
export default function ModelDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <h1>Model Details</h1>

      {/* Client boundary for Util components */}
      <ClientOnly>
        <div className="actions">
          <Model.Util.EditButton id={params.id} />
          <Model.Util.DeleteButton id={params.id} />
        </div>
      </ClientOnly>

      {/* Server-rendered content */}
      <ModelDetails id={params.id} />
    </div>
  );
}
```

## How to Use Model.Util.ts Files in Units

Units represent list items or cards, and often use Util components for actions:

```tsx
// Model.Unit.tsx
"use client";

import { Card, ModelProps } from "@util/ui";
import * as Util from "./Model.Util";

export const ListItem = ({ model }: ModelProps<"model">) => (
  <div className="flex items-center justify-between border-b p-4">
    <div>
      <h3 className="font-medium">{model.name}</h3>
      <p className="text-sm text-gray-500">{model.description}</p>
    </div>

    <div className="flex gap-2">
      <Util.ViewButton id={model.id} />
      <Util.EditButton id={model.id} />
      <Util.DeleteButton id={model.id} name={model.name} />
    </div>
  </div>
);

export const Card = ({ model }: ModelProps<"model">) => (
  <Card>
    <Card.Image src={model.image} />
    <Card.Title>{model.name}</Card.Title>
    <Card.Content>{model.summary}</Card.Content>
    <Card.Footer>
      <Util.StatusBadge status={model.status} />
      <div className="ml-auto flex gap-2">
        <Util.ViewButton id={model.id} size="sm" />
        <Util.EditButton id={model.id} size="sm" />
      </div>
    </Card.Footer>
  </Card>
);
```

## How to Use Model.Util.ts Files in Templates

Templates use Util components for form actions and specialized inputs:

```tsx
// Model.Template.tsx
"use client";

import { Field, Form } from "@util/ui";
import * as Util from "./Model.Util";
import { st } from "../st";

export const CreateTemplate = () => {
  const { modelForm } = st.use.model();
  const { setModelForm, createModel } = st.do.model();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createModel();
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Field.Text
        label={dict.model.name}
        value={modelForm.name || ""}
        onChange={(value) => setModelForm({ name: value })}
        required
      />

      {/* Category selector utility */}
      <Util.CategorySelector selected={modelForm.category} onChange={(category) => setModelForm({ category })} />

      {/* Tags input utility */}
      <Util.TagsInput tags={modelForm.tags || []} onChange={(tags) => setModelForm({ tags })} />

      <div className="mt-4 flex justify-end gap-2">
        <Util.CancelButton />
        <Util.SubmitButton />
      </div>
    </Form>
  );
};
```

## How to Use Model.Util.ts Files in Views

Views represent detailed model displays and often use Util components for actions and data visualization:

```tsx
// Model.View.tsx
"use client";

import { Container, Tabs } from "@util/ui";
import * as Util from "./Model.Util";
import { st } from "../st";
import { useEffect } from "react";
import { sig } from "../sig";

export const DetailView = ({ id }: { id: string }) => {
  const { model, loading } = st.use.model((state) => ({
    model: state.models[id],
    loading: state.loading,
  }));

  useEffect(() => {
    if (!model) {
      void sig.model.getModel({ id }).then((data) => {
        st.do.model().setModel(data.model);
      });
    }
  }, [id, model]);

  if (loading) return <Util.LoadingSkeleton />;
  if (!model) return <Util.NotFound />;

  return (
    <Container>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">{model.name}</h1>

        <div className="flex gap-2">
          <Util.EditButton id={id} />
          <Util.ShareButton id={id} />
          <Util.DeleteButton id={id} name={model.name} />
        </div>
      </div>

      <Tabs>
        <Tabs.Tab label={dict.model.overview}>
          <Util.DetailPanel model={model} />
        </Tabs.Tab>

        <Tabs.Tab label={dict.model.analytics}>
          <Util.AnalyticsPanel id={id} />
        </Tabs.Tab>

        <Tabs.Tab label={dict.model.history}>
          <Util.HistoryTimeline id={id} />
        </Tabs.Tab>
      </Tabs>
    </Container>
  );
};
```

## How to Use Model.Util.ts Files in Zones

Zones are layout containers that define page sections and often use Util components for dashboards and controls:

```tsx
// Model.Zone.tsx
"use client";

import { Zone } from "@util/ui";
import * as View from "./Model.View";
import * as Template from "./Model.Template";
import * as Util from "./Model.Util";
import { dict } from "../dict";

export const ModelZone = () => (
  <Zone title={dict.model.zone_title}>
    <Zone.Header>
      <Zone.Title>{dict.model.models}</Zone.Title>
      <Util.CreateButton />
    </Zone.Header>

    <Zone.Dashboard>
      <Util.StatsPanel />
      <Util.TrendChart />
    </Zone.Dashboard>

    <Zone.Filters>
      <Util.FilterPanel />
    </Zone.Filters>

    <Zone.Content>
      <View.ListView />
    </Zone.Content>

    <Zone.Modal id="createModel" title={dict.model.create_new}>
      <Template.CreateTemplate />
    </Zone.Modal>

    <Zone.Modal id="editModel" title={dict.model.edit}>
      <Template.EditTemplate />
    </Zone.Modal>
  </Zone>
);
```

## Best Practices and Error Handling

### 1. Consistent Error Handling

Implement a consistent approach to error handling:

```tsx
export const DataAction = ({ id }: { id: string }) => {
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    setLoading(true);
    setError(null);

    try {
      await sig.model.performAction({ id });
      // Success handling
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && <div className="error-message mb-2">{error.message}</div>}

      <Button onClick={handleAction} disabled={loading} variant="primary">
        {loading ? <Spinner size="sm" /> : null}
        {dict.model.perform_action}
      </Button>
    </div>
  );
};
```

### 2. TypeScript Type Safety

Use TypeScript interfaces for props and state:

```tsx
interface FilterPanelProps {
  /** Initial filter values */
  initialFilters?: ModelFilters;
  /** Called when filters are applied */
  onFilter: (filters: ModelFilters) => void;
  /** Additional filter options */
  options?: FilterOptions;
}

interface ModelFilters {
  status?: string[];
  category?: string;
  dateRange?: [Date, Date];
  searchTerm?: string;
}

interface FilterOptions {
  showCategories?: boolean;
  showDateRange?: boolean;
  showStatus?: boolean;
}

export const FilterPanel = ({ initialFilters = {}, onFilter, options = {} }: FilterPanelProps) => {
  // Implementation
};
```

### 3. Component Documentation

Add JSDoc comments for clear documentation:

```tsx
/**
 * Renders a status badge with appropriate color based on status value
 *
 * @param status - The current status value
 * @param size - Badge size (default: 'md')
 * @returns A styled status indicator
 *
 * @example
 * <StatusBadge status="active" />
 */
export const StatusBadge = ({ status, size = "md" }: { status: string; size?: "sm" | "md" | "lg" }) => {
  // Get color based on status
  const getColor = () => {
    switch (status) {
      case "active":
        return "green";
      case "pending":
        return "yellow";
      case "inactive":
        return "gray";
      default:
        return "blue";
    }
  };

  return (
    <span className={`badge badge-${getColor()} badge-${size}`}>{dict.model.status_labels[status] || status}</span>
  );
};
```

### 4. Loading States

Always handle loading states explicitly:

```tsx
export const ModelSelector = ({ onChange, value }: { onChange: (id: string) => void; value?: string }) => {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    const fetchOptions = async () => {
      setLoading(true);
      try {
        const { models } = await sig.model.listModels({ limit: 100 });
        setOptions(
          models.map((m) => ({
            label: m.name,
            value: m.id,
          }))
        );
      } catch (error) {
        console.error("Failed to load options:", error);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchOptions();
  }, []);

  return (
    <Select
      options={options}
      value={value}
      onChange={onChange}
      isLoading={loading}
      placeholder={loading ? dict.common.loading : dict.model.select_model}
    />
  );
};
```

## Summary

Model.Util components in Akan.js are essential for creating reusable, model-specific functionality. By following these patterns and best practices, you can create a consistent, maintainable set of utility components that enhance your application's user experience while maintaining clean separation between business logic and presentation layers.

Remember these key principles:

1. Create focused, single-responsibility components
2. Handle loading and error states consistently
3. Use TypeScript for type safety
4. Connect to stores for state management
5. Use signals for API calls
6. Implement proper performance optimizations
7. Document your components thoroughly

By applying these guidelines, your Model.Util components will serve as reliable building blocks throughout your Akan.js application.
