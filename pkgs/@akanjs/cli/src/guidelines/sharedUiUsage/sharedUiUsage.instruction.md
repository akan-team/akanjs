# Using Shared UI Components in Akan.js

## Overview

The `@shared/ui` library in the Akan.js framework provides a comprehensive set of React components designed for building data-driven applications. This library follows consistent patterns and deeply integrates with the application's store system, making it efficient to develop complex UIs with minimal code.

## Key Features

- **Store-Centric Architecture**: Seamless integration with standardized store slices using naming conventions
- **Type-Safe Components**: Extensive TypeScript generic usage for compile-time safety
- **Internationalization**: Built-in multi-language support throughout all components
- **Responsive Design**: Mobile-first approach with adaptive breakpoints
- **Performance Optimized**: Components use memoization, lazy loading, and efficient rendering strategies
- **Accessibility Compliant**: Proper ARIA attributes and keyboard navigation
- **Extensible Architecture**: Plugin systems and customizable renderers
- **Unidirectional Data Flow**: Predictable state management patterns

## Getting Started

### Importing Components

UI components are available as named exports from the `@shared/ui` package:

```tsx
import { Field, Only, Editor } from "@shared/ui";
```

Each namespace contains specialized components for specific use cases:

- **Field**: Form inputs and data entry components
- **Only**: Conditional rendering based on user state and device
- **Editor**: Rich text editing capabilities

### Component Organization in Your Module

When building a module in Akan.js, you should organize your components following the pattern:

```
/lib/myFeature/
  MyFeature.constant.ts     # Types, GraphQL schema, enums
  MyFeature.service.ts      # Business logic and database operations
  MyFeature.signal.ts       # Client state management and API calls
  MyFeature.store.ts        # Zustand store definitions
  MyFeature.Template.tsx    # Form templates for create/edit
  MyFeature.Unit.tsx        # Card/list item components
  MyFeature.View.tsx        # Full page views
  MyFeature.Zone.tsx        # Layout containers
  MyFeature.Util.tsx        # Utility components
```

## Usage Examples

### 1. Basic Form Fields

Form fields are used for data entry and are integrated with the validation system:

```tsx
import { Field } from "@shared/ui";
import { usePage } from "@shared/client";

const MyComponent = () => {
  const { l } = usePage(); // For internationalization

  return (
    <>
      <Field.Text
        label={l("myModel.title")}
        desc={l("myModel.title.desc")}
        value={formState.title}
        onChange={(value) => st.do.setTitleOnMyModel(value)}
        nullable={false}
        maxlength={100}
      />

      <Field.Number
        label={l("myModel.amount")}
        desc={l("myModel.amount.desc")}
        value={formState.amount}
        onChange={(value) => st.do.setAmountOnMyModel(value)}
        min={0}
        max={1000}
        unit="KRW"
      />

      <Field.ToggleSelect
        label={l("myModel.status")}
        desc={l("myModel.status.desc")}
        value={formState.status}
        items={cnst.Status}
        onChange={(status) => st.do.setStatusOnMyModel(status)}
      />
    </>
  );
};
```

### 2. Data Management Components

Data components are used to display and manage collections of data:

```tsx
import { Data, Model } from "@akanjs/ui";

export const MyFeatureAdmin = ({ sliceName = "myFeature" }) => {
  return (
    <Data.ListContainer
      sliceName={sliceName}
      renderItem={MyFeature.Unit.Card}
      renderDashboard={MyFeature.Util.Stat}
      renderTemplate={MyFeature.Template.General}
      renderView={(myFeature) => <MyFeature.View.General myFeature={myFeature} />}
      columns={["id", "title", "status", "createdAt"]}
      actions={(myFeature) => ["remove", "edit", "view"]}
    />
  );
};
```

### 3. Loading and Data Fetching

Load components handle data fetching and state management:

```tsx
import { Load } from "@akanjs/ui";

export const MyFeatureView = ({ id }) => {
  return (
    <Load.View
      loader={() => fetch.myFeature(id)}
      render={(myFeature) => (
        <div className="space-y-4 p-4">
          <h1>{myFeature.title}</h1>
          <p>{myFeature.description}</p>
        </div>
      )}
    />
  );
};

export const MyFeatureList = () => {
  return (
    <Load.Units
      init={st.do.initMyFeature}
      renderItem={(myFeature) => <MyFeature.Unit.Card key={myFeature.id} myFeature={myFeature} />}
      filter={(myFeature) => myFeature.isActive}
      sort={(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()}
    />
  );
};
```

### 4. CRUD Operations

Model components handle create, read, update and delete operations:

```tsx
import { Model } from "@akanjs/ui";

export const CreateMyFeature = () => {
  return (
    <Model.NewWrapper sliceName="myFeature">
      <button className="btn btn-primary">Create New</button>
    </Model.NewWrapper>
  );
};

export const EditMyFeature = ({ id }) => {
  return (
    <Model.EditModal
      sliceName="myFeature"
      id={id}
      renderTitle={(myFeature) => `Edit ${myFeature.title}`}
      onSubmit="closeModal"
    />
  );
};

export const ViewMyFeature = ({ id }) => {
  return (
    <Model.ViewModal
      id={id}
      renderView={(myFeature) => <MyFeature.View.General myFeature={myFeature} />}
      renderAction={(myFeature) => (
        <Model.EditWrapper sliceName="myFeature" id={myFeature.id}>
          <button className="btn btn-secondary">Edit</button>
        </Model.EditWrapper>
      )}
    />
  );
};
```

### 5. Conditional Rendering

Only components handle conditional rendering based on user roles or device:

```tsx
import { Only } from "@shared/ui";

export const AdminFeature = () => {
  return (
    <Only.Admin roles={["superadmin", "manager"]}>
      <div className="bg-red-100 p-4">Admin Only Content</div>
    </Only.Admin>
  );
};

export const MobileFeature = () => {
  return (
    <>
      <Only.Mobile>
        <div className="compact-view">Mobile View</div>
      </Only.Mobile>

      <Only.Web>
        <div className="expanded-view">Desktop View</div>
      </Only.Web>
    </>
  );
};
```

## Integration with Store System

The components integrate deeply with the Akan.js store system using standardized naming conventions:

```tsx
// Field.ParentId example
<Field.ParentId
  label="Organization"
  sliceName="orgInUser" // References st.slice.orgInUser
  value={userForm.org}
  onChange={st.do.setOrgOnUser}
  renderOption={(org) => org.name}
/>
```

The components automatically use naming conventions to interact with your store:

- `${modelName}List` for accessing list data
- `init${ModelName}` for initialization functions
- `${modelName}Form` for form state
- `add${ModelName}Files` for file uploads

## Common Patterns

### Render Props

Many components use render props for customization:

```tsx
<Data.ListContainer
  renderItem={(item) => <MyItem item={item} />}
  renderDashboard={(props) => <MyDashboard {...props} />}
  renderTemplate={(form) => <MyTemplate form={form} />}
  renderView={(model) => <MyView model={model} />}
/>
```

### Internationalization

Components automatically integrate with the internationalization system:

```tsx
const { l } = usePage();

<Field.Text label={l("user.name")} desc={l("user.name.desc")} placeholder={l("user.namePlaceholder")} />;
```

### State Management Integration

Components seamlessly integrate with the state management:

```tsx
<Field.ToggleSelect value={userForm.role} onChange={(role) => st.do.setRoleOnUser(role)} items={cnst.UserRole} />
```

## Best Practices

1. **Use the appropriate component type** for each part of your feature:
   - Use **Field** components for data entry
   - Use **Data** components for data visualization and management
   - Use **Load** components for data fetching
   - Use **Model** components for CRUD operations

2. **Leverage the internationalization system** by using the `l` function for all user-facing text

3. **Follow the naming conventions** for store slices and actions to ensure proper integration

4. **Use render props** for customization rather than creating custom components

5. **Utilize conditional rendering** with Only components rather than conditional logic in your components

6. **Structure your modules** following the Akan.js pattern with separate files for each concern

## Troubleshooting

Common issues and solutions:

1. **Component not updating when store changes**: Ensure you're using the correct store slice name and following naming conventions

2. **Field validation errors**: Check the validation rules and ensure you're providing the correct props (minlength, maxlength, etc.)

3. **Data not loading**: Verify that the loader function is correctly implemented and returning data in the expected format

4. **Missing translations**: Ensure that all keys are defined in your dictionary files and that you're using the correct model and field names

## Conclusion

The shared UI library provides a comprehensive set of components for building data-driven applications with Akan.js. By following the patterns and conventions outlined in this guide, you can efficiently build complex UIs with minimal code.
