# Model.Zone.tsx File Guide for Akan.js

## Purpose and Role of Model.Zone.tsx Files

Model.Zone.tsx files are client-side container components in Akan.js that serve as the bridge between data fetching and UI presentation. They provide a consistent interface for displaying model data across your application.

Key roles of Zone components:

1. **Layout Containers** - Create structured layouts for specific data models
2. **Component Composition** - Assemble smaller components (Units, Views, Templates) into cohesive UI blocks
3. **Client-Side Integration** - Handle client-side state, interactions, and navigation
4. **Data Presentation** - Connect data sources to presentation components
5. **Reusable UI Patterns** - Establish consistent patterns for common UI scenarios (lists, cards, forms)

Zone components are positioned between page components and individual UI components in the component hierarchy:

```
Page Components → Zone Components → View/Unit/Template Components
```

## Component Structure and Naming Patterns

### Location and Naming Convention

```
{app-name}/lib/{model-name}/{model-name}.Zone.tsx
```

Example: `apps/angelo/lib/bizAccount/bizAccount.Zone.tsx`

### Basic Structure

```tsx
"use client";

import { Load, Data } from "@akanjs/ui";
import { ModelsProps } from "@akanjs/client";
import { ClientInit, ClientView } from "@akanjs/signal";
import { Model } from "./index";

export const Admin = ({ sliceName = "model", init, query }: ModelsProps<cnst.Model>) => {
  return (
    <Data.ListContainer
      init={init}
      query={query}
      sliceName={sliceName}
      renderItem={Model.Unit.Card}
      renderTemplate={Model.Template.General}
      renderView={(model) => <Model.View.General model={model} />}
      columns={["id", "status", "createdAt"]}
      actions={(model) => ["remove", "edit", "view"]}
    />
  );
};

export const View = ({ view }: { view: ClientView<"model", cnst.Model> }) => {
  return <Load.View view={view} renderView={(model) => <Model.View.General model={model} />} />;
};

export const Card = ({ className, init }: { className?: string; init: ClientInit<"model", cnst.LightModel> }) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(model) => <Model.Unit.Card key={model.id} href={`/model/${model.id}`} model={model} />}
    />
  );
};

export const Zone = {
  Admin,
  View,
  Card,
};
```

### Key Components

Every Model.Zone.tsx file typically exports several named components and a Zone namespace:

1. **Admin**: For administrative interfaces with CRUD operations
2. **View**: For detailed views of a single model instance
3. **Card**: For displaying lists of model items as cards
4. **Specialized components**: Custom components for specific model needs

## Common Zone Component Types

### Admin Zone

The Admin component typically uses `Data.ListContainer` to provide a complete admin interface for a model:

```tsx
export const Admin = ({ sliceName = "model", init, query }: ModelsProps<cnst.Model>) => {
  return (
    <Data.ListContainer
      init={init}
      query={query}
      sliceName={sliceName}
      renderItem={Model.Unit.Card}
      renderTemplate={Model.Template.General}
      renderView={(model) => <Model.View.General model={model} />}
      columns={["id", "name", "status", "createdAt"]}
      actions={(model) => ["remove", "edit", "view"]}
    />
  );
};
```

Key features:

- Configurable columns and actions
- Integration with templates for editing
- Unit components for list display
- View components for detailed display

### View Zone

The View component uses `Load.View` to display a single model instance:

```tsx
export const View = ({ view }: { view: ClientView<"model", cnst.Model> }) => {
  return <Load.View view={view} renderView={(model) => <Model.View.General model={model} />} />;
};
```

Key features:

- Handles loading states
- Passes model data to View component
- Can include additional UI elements or actions

### Card Zone

The Card component uses `Load.Units` to display lists of model items:

```tsx
export const Card = ({ className, init }: { className?: string; init: ClientInit<"model", cnst.LightModel> }) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(model) => <Model.Unit.Card key={model.id} href={`/model/${model.id}`} model={model} />}
    />
  );
};
```

Key features:

- Handles loading states for lists
- Maps data to Unit components
- Can include link wrapping or other interactions
- Supports className for styling flexibility

### Specialized Zone Components

Many models have specialized Zone components for specific use cases:

```tsx
export const Recommendations = ({
  className,
  init,
}: {
  className?: string;
  init: ClientInit<"model", cnst.LightModel>;
}) => {
  return (
    <div className={className}>
      <h3 className="mb-2 text-lg font-medium">Recommended For You</h3>
      <Load.Units
        init={init}
        renderItem={(model) => <Model.Unit.Card key={model.id} model={model} variant="compact" />}
      />
    </div>
  );
};
```

These specialized components can:

- Add specific UI layout or structure
- Integrate with specific data fetching patterns
- Implement custom behavior for the model
- Support specific UI patterns (tabs, carousels, etc.)

## Props Patterns and Data Handling

### Common Props

Zone components typically use these prop patterns:

1. **For Admin zones**:

   ```tsx
   { sliceName?: string, init: ClientInit<model>, query?: QueryProps }
   ```

2. **For View zones**:

   ```tsx
   { view: ClientView<model>, className?: string }
   ```

3. **For Card zones**:

   ```tsx
   { init: ClientInit<model>, className?: string }
   ```

4. **For specialized zones**:
   ```tsx
   { init?: ClientInit<model>, view?: ClientView<model>, className?: string, ...customProps }
   ```

### Data Handling

Zone components connect with data in several ways:

1. **Using ClientInit**: For lists of model data

   ```tsx
   <Load.Units init={init} renderItem={(model) => <Model.Unit.Card model={model} />} />
   ```

2. **Using ClientView**: For single model instances

   ```tsx
   <Load.View view={view} renderView={(model) => <Model.View.General model={model} />} />
   ```

3. **Using Data.ListContainer**: For admin interfaces
   ```tsx
   <Data.ListContainer init={init} query={query} sliceName={sliceName} ... />
   ```

## Client Component Patterns and Hooks Usage

Model.Zone.tsx files are client components that can use client-side hooks. Always include the `"use client"` directive at the top of the file:

```tsx
"use client";

import { useState, useEffect } from "react";
// ...
```

Common hook patterns in Zone components:

1. **useState** for local component state:

   ```tsx
   const [activeTab, setActiveTab] = useState("details");
   ```

2. **useEffect** for side effects:

   ```tsx
   useEffect(() => {
     if (model.id) {
       // Track view or load additional data
     }
   }, [model.id]);
   ```

3. **Custom hooks** for reusable logic:
   ```tsx
   const { isVisible, toggleVisibility } = useToggle(false);
   ```

Keep client-side state management focused on UI concerns, not business logic.

## Integration with Page Components and Data Fetching

Zone components are typically used within page.tsx files using the Load.Page pattern:

```tsx
// app/[lang]/(app)/model/page.tsx
import { Load } from "@akanjs/ui";
import { fetch } from "@akanjs/signal";
import { Model } from "@app/lib";

export default function ModelPage() {
  return (
    <Load.Page
      loader={async () => {
        const { modelInit } = await fetch.initModel();
        return { modelInit };
      }}
      render={({ modelInit }) => (
        <div className="container mx-auto p-4">
          <Model.Zone.Card init={modelInit} />
        </div>
      )}
    />
  );
}
```

For detail pages:

```tsx
// app/[lang]/(app)/model/[modelId]/page.tsx
export default function ModelDetailPage({ params }: { params: { modelId: string } }) {
  return (
    <Load.Page
      loader={async () => {
        const { modelView } = await fetch.viewModel(params.modelId);
        return { modelView };
      }}
      render={({ modelView }) => (
        <div className="container mx-auto p-4">
          <Model.Zone.View view={modelView} />
        </div>
      )}
    />
  );
}
```

## Composition with Other Model Components

Zone components compose and orchestrate other model components:

1. **Using View components** for detailed displays:

   ```tsx
   <Model.View.General model={model} />
   ```

2. **Using Unit components** for list items:

   ```tsx
   <Model.Unit.Card model={model} />
   ```

3. **Using Template components** for forms:

   ```tsx
   <Model.Template.General model={model} onSubmit={handleSubmit} />
   ```

4. **Using Util components** for actions and helpers:
   ```tsx
   <Model.Util.ActionButtons model={model} />
   ```

This composition creates a consistent UI pattern across your application.

## Best Practices and Implementation Guidelines

### Do's

1. **Keep Zone components focused on presentation**

   - Delegate business logic to services and signals
   - Use Zone components as composition layers, not logic containers

2. **Use consistent naming and exports**

   - Export named components for specific use cases (Admin, View, Card)
   - Export a Zone namespace for easy import

3. **Provide styling flexibility**

   - Accept className props and pass them to container elements
   - Use Tailwind CSS for consistent styling

4. **Create specialized Zone components as needed**

   - Implement custom Zone components for specific UI patterns
   - Reuse common patterns across models

5. **Leverage Load components for data handling**
   - Use Load.Units, Load.View, and Data.ListContainer for consistent data handling
   - Handle loading states consistently

### Don'ts

1. **Don't include business logic in Zone components**

   - Keep data transformation and business rules in services and signals
   - Zone components should focus on rendering and composition

2. **Don't fetch data directly in Zone components**

   - Data fetching should happen in page components or services
   - Zone components should receive data via props

3. **Don't create overly complex Zone components**

   - Break down complex UIs into smaller, composable components
   - Use specialized Zone components for different aspects of the model

4. **Don't duplicate code across Zone components**

   - Extract common patterns into reusable components
   - Use composition to create variation

5. **Don't mix client and server components incorrectly**
   - Remember that Zone components are client components
   - Import server components carefully to avoid errors

## Advanced Zone Patterns

### Conditional Rendering in Zones

```tsx
export const Card = ({
  className,
  init,
  variant = "default",
}: {
  className?: string;
  init: ClientInit<"model", cnst.LightModel>;
  variant?: "default" | "compact" | "extended";
}) => {
  return (
    <Load.Units
      className={className}
      init={init}
      renderItem={(model) => {
        switch (variant) {
          case "compact":
            return <Model.Unit.CompactCard key={model.id} model={model} />;
          case "extended":
            return <Model.Unit.ExtendedCard key={model.id} model={model} />;
          default:
            return <Model.Unit.Card key={model.id} model={model} />;
        }
      }}
    />
  );
};
```

### Composition with Other Zones

```tsx
export const Dashboard = ({ className }: { className?: string }) => {
  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Load.Page
          loader={async () => {
            const { modelAInit } = await fetch.initModelA();
            const { modelBInit } = await fetch.initModelB();
            return { modelAInit, modelBInit };
          }}
          render={({ modelAInit, modelBInit }) => (
            <>
              <ModelA.Zone.Card init={modelAInit} className="col-span-1" />
              <ModelB.Zone.Card init={modelBInit} className="col-span-1" />
            </>
          )}
        />
      </div>
    </div>
  );
};
```

### Real-time Data Integration

```tsx
"use client";

import { useEffect } from "react";
import { Load } from "@akanjs/ui";
import { fetch, subscriptions } from "@akanjs/signal";

export const LiveFeed = ({ className, init }: { className?: string; init: ClientInit<"model", cnst.LightModel> }) => {
  useEffect(() => {
    const unsubscribe = subscriptions.subscribeToModelUpdates();
    return () => unsubscribe();
  }, []);

  return (
    <div className={className}>
      <h3 className="mb-2 text-lg font-medium">Live Updates</h3>
      <Load.Units init={init} renderItem={(model) => <Model.Unit.Card key={model.id} model={model} />} />
    </div>
  );
};
```

## Troubleshooting

### Common Issues

1. **"Error: Client Component Cannot Be Rendered on Server"**

   - Make sure your Zone component has `"use client"` at the top
   - Check that you're not using server components inside client components

2. **"Props Validation Failed"**

   - Ensure you're passing the correct data structure to Zone components
   - Check the types for ClientInit and ClientView

3. **"Component is Not Rendering Correctly"**

   - Verify that the underlying Unit/View components are implemented correctly
   - Check that you're passing the required props

4. **"Data Not Loading"**
   - Confirm that the data fetching in the page component is working
   - Check that you're using the correct Load component (Units, View)

### Debugging Tips

- Use the React DevTools to inspect component props and state
- Check the Network tab for API requests
- Add console.log statements to verify data flow
- Test Zone components in isolation

## Conclusion

Model.Zone.tsx files are crucial container components in Akan.js that bridge the gap between page components and UI components. By following the patterns and practices in this guide, you can create consistent, reusable, and maintainable UI components for your application.

Key takeaways:

1. Zone components are client components that compose other model components
2. They focus on presentation and composition, not business logic
3. Common patterns include Admin, View, and Card zones
4. They integrate with Load components for data handling
5. They provide a consistent interface for displaying model data

By leveraging Zone components effectively, you can create a cohesive and consistent user experience across your Akan.js application.
