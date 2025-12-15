# Model.Template.tsx Implementation Guide

## Purpose and Role of Model.Template.tsx Files

Model.Template.tsx files are client-side React components that define the form structure for creating/editing models in Akan.js applications. They serve as:

1. **Form Blueprints**: Provide reusable form structures for model CRUD operations
2. **State Management**: Connect form inputs to Zustand store slices
3. **Validation**: Implement field-level validation rules
4. **UI Consistency**: Ensure uniform form design across the application
5. **Type Safety**: Enforce data types based on Model.Constant definitions
6. **Internationalization**: Support multi-language form fields with dictionary integration
7. **Component Reusability**: Enable form sections to be used in multiple contexts (pages, modals, utilities)

## File Location and Naming Convention

### Standard Path

```
{apps,libs}/*/lib/[model]/[Model].Template.tsx
```

### Examples:

- `libs/game/lib/map/Map.Template.tsx`
- `apps/lu/lib/feeling/Feeling.Template.tsx`
- `libs/shared/lib/user/User.Template.tsx`

### Naming Rules:

- PascalCase for model names (e.g., `Map.Template.tsx`)
- Place in the same directory as other model files (`[Model].store.ts`, `[Model].constant.ts`)
- Export named components (typically `General`, `Advanced`, `Compact`)

## Basic Structure and Component Patterns

### Minimum Structure

```tsx
"use client";
import { Field } from "@shared/ui";
import { st } from "@[project]/client";
import { usePage } from "@[project]/lib/useClient";

export const General = ({ id }: { id?: string }) => {
  const form = st.use.[model]Form();
  const { l } = usePage();

  return (
    <div className="grid grid-cols-1 gap-4">
      <Field.Text
        label={l("model.fieldName")}
        value={form.fieldName}
        onChange={(v) => st.do.setFieldNameOn[Model](v)}
      />
    </div>
  );
};
```

### Component Organization Patterns

```tsx
// Single-file pattern
export const General = () => { /* main form */ }
export const Advanced = () => { /* advanced fields */ }

// Multi-file pattern (recommended)
[Model].Template/
├─ General.tsx
├─ Sections/
│  ├─ BasicInfo.tsx
│  ├─ ContactDetails.tsx
```

## Integration with Store State Management

### Connecting to Zustand Store

```tsx
// Access form state
const form = st.use.[model]Form();

// Update fields
<Field.Text
  value={form.name}
  onChange={st.do.setNameOn[Model]}
/>
```

### Store Action Patterns

```tsx
// Simple field update
st.do.setNameOn[Model](value);

// Nested field update
st.do.writeOn[Model](["address", "city"], value);

// List operations
st.do.addItemOn[Model](newItem);
st.do.removeItemOn[Model](index);
```

### Initialization and Cleanup

```tsx
useEffect(() => {
  if (id) {
    // Load existing data
    void st.do.load[Model](id);
  }

  return () => {
    // Reset form on unmount
    st.do.reset[Model]Form();
  };
}, [id]);
```

## Field Types and Form Components

### Core Field Components

| Component            | Usage                 | Example                                     |
| -------------------- | --------------------- | ------------------------------------------- |
| `Field.Text`         | Text input            | `<Field.Text value={form.name} />`          |
| `Field.TextArea`     | Multi-line text       | `<Field.TextArea value={form.desc} />`      |
| `Field.Number`       | Numeric input         | `<Field.Number value={form.age} />`         |
| `Field.Select`       | Dropdown selection    | `<Field.Select options={statusOptions} />`  |
| `Field.ToggleSelect` | Toggleable options    | `<Field.ToggleSelect items={types} />`      |
| `Field.Tags`         | Tag input             | `<Field.Tags value={form.tags} />`          |
| `Field.Img`          | Image upload          | `<Field.Img sliceName="model" />`           |
| `Field.Date`         | Date picker           | `<Field.Date value={form.dueDate} />`       |
| `Field.Parent`       | Relationship selector | `<Field.Parent sliceName="relatedModel" />` |
| `Field.Slate`        | Rich text editor      | `<Field.Slate valuePath="content" />`       |

### Complex Field Example

```tsx
<Field.List
  label={l("map.spawnPositions")}
  value={form.spawnPositions}
  onAdd={() => st.do.addSpawnPosition(defaultPosition)}
  renderItem={(position, idx) => (
    <div className="flex gap-4">
      <Field.Text value={position.key} onChange={(v) => st.do.writeOnMap(["spawnPositions", idx, "key"], v)} />
      <Field.DoubleNumber
        value={position.position}
        onChange={(v) => st.do.writeOnMap(["spawnPositions", idx, "position"], v)}
      />
    </div>
  )}
/>
```

## Form Validation Approaches

### Field-Level Validation

```tsx
<Field.Email
  value={form.email}
  validate={(v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
  errorMessage="Invalid email format"
  required
/>
```

### Custom Validation Functions

```tsx
// Phone validation
<Field.Phone
  value={form.phone}
  validate={(v) => isPhoneNumber(v)}
/>

// Custom business rule
<Field.Number
  value={form.quantity}
  validate={(v) => v > 0 ? true : "Must be positive"}
/>
```

### Validation Props

| Prop                    | Description          | Example                         |
| ----------------------- | -------------------- | ------------------------------- |
| `required`              | Mandatory field      | `required`                      |
| `min`/`max`             | Number range         | `min={0} max={100}`             |
| `minLength`/`maxLength` | Text length          | `minLength={2}`                 |
| `validate`              | Custom validation fn | `validate={(v) => isValid(v)}`  |
| `errorMessage`          | Custom error text    | `errorMessage="Invalid format"` |

## Internationalization with usePage

### Dictionary Integration

```tsx
const { l } = usePage();

// Basic field
<Field.Text label={l("model.name")} />

// With description
<Field.Text
  label={l("model.email")}
  desc={l("model.email.desc")}
/>

// Dynamic content
<div>{l(`profileVerify.enum-type-${type}`)}</div>
```

### Dictionary Structure

```tsx
// Example dictionary
export const dictionary = {
  field: {
    model: {
      name: { en: "Name", ko: "이름" },
      email: { en: "Email", ko: "이메일" },
    },
  },
  desc: {
    model: {
      email: { en: "Your contact email", ko: "연락처 이메일" },
    },
  },
};
```

## Form Layout Patterns and Best Practices

### Responsive Grid Layout

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
  <Field.Text label="First Name" />
  <Field.Text label="Last Name" />
  <Field.Email label="Email" className="md:col-span-2" />
</div>
```

### Section Grouping

```tsx
<section className="mb-6">
  <h3 className="mb-3 text-xl font-semibold">Personal Information</h3>
  <div className="space-y-4">
    <Field.Text label="Full Name" />
    <Field.Date label="Birth Date" />
  </div>
</section>
```

### Conditional Sections

```tsx
{
  form.type === "business" && (
    <section>
      <h3>Business Details</h3>
      <Field.Text label="Company Name" />
      <Field.Text label="Tax ID" />
    </section>
  );
}
```

### Best Practices

1. Use consistent spacing (`gap-4`, `mb-4`)
2. Group related fields visually
3. Place important fields above the fold
4. Use appropriate field types for data
5. Provide clear validation feedback
6. Optimize for mobile-first experiences

## Using Templates in Pages, Utilities, and Zones

### In Page Components

```tsx
// Creation page
<Model.Edit sliceName="model" type="form">
  <Model.Template.General />
</Model.Edit>

// Edit page
<Model.Edit modelId={params.id} sliceName="model">
  <Model.Template.General id={params.id} />
</Model.Edit>
```

### In Utility Components

```tsx
// Modal-based editing
<Modal.Open opens={`edit-${id}`}>
  <button>Edit</button>
</Modal.Open>

<Modal.Window name={`edit-${id}`}>
  <Model.Edit modelId={id} sliceName="model">
    <Model.Template.Compact />
  </Model.Edit>
</Modal.Window>
```

### In Zone Components

```tsx
// List view with create form
<Data.ListContainer
  renderTemplate={() => <Model.Template.General />}
/>

// Inline editor
<Zone.InlineEdit>
  <Model.Template.Compact />
</Zone.InlineEdit>
```

## State Management and Lifecycle Methods

### Lifecycle Hooks

```tsx
useEffect(() => {
  // Initialize form data
  if (id) void st.do.loadModel(id);

  // Initialize related data
  void st.do.initRelatedData();

  return () => {
    // Cleanup on unmount
    st.do.resetModelForm();
  };
}, [id]);
```

### Form State Flow

1. **Initialization**: Load data when component mounts
2. **User Interaction**: Update state via store actions
3. **Validation**: Validate on change/blur/submit
4. **Submission**: Process form data
5. **Cleanup**: Reset state on unmount

## Performance Optimization Techniques

### Memoization

```tsx
const FormSection = React.memo(({ fields }) => {
  // Component implementation
});
```

### Debounced Inputs

```tsx
import { useDebounce } from "@akanjs/hooks";

const [input, setInput] = useState("");
const debouncedInput = useDebounce(input, 300);

useEffect(() => {
  st.do.search(debouncedInput);
}, [debouncedInput]);
```

### Lazy Loading

```tsx
const HeavyEditor = React.lazy(() => import("./HeavyEditor"));

<Suspense fallback={<Loader />}>
  <HeavyEditor />
</Suspense>;
```

## Accessibility Considerations

### Accessible Form Patterns

```tsx
// Proper labeling
<label htmlFor="email-field">Email</label>
<input id="email-field" type="email" />

// ARIA attributes
<div
  role="alert"
  aria-live="polite"
>
  {error && <p>{error}</p>}
</div>

// Keyboard navigation
<button onKeyDown={handleKeyNavigation}>Submit</button>
```

### Accessibility Requirements

1. Associate all inputs with labels
2. Provide ARIA attributes for custom components
3. Ensure proper focus management
4. Support keyboard navigation
5. Provide error messages as live regions
6. Use sufficient color contrast

## Common Patterns and Reusable Components

### Reusable Form Sections

```tsx
// AddressSection.tsx
export const AddressSection = () => (
  <>
    <Field.Text label="Street" />
    <Field.Text label="City" />
    <Field.Text label="Zip Code" />
  </>
);

// Usage
<AddressSection />;
```

### Dynamic Field Arrays

```tsx
<Field.List
  value={form.items}
  onAdd={() => st.do.addItem(defaultItem)}
  renderItem={(item, index) => (
    <div key={index}>
      <Field.Text value={item.name} />
      <Field.Number value={item.quantity} />
    </div>
  )}
/>
```

### Compound Components

```tsx
// DockerRegistryField.tsx
const DockerRegistry = ({ value, onChange }) => (
  <>
    <Field.Text label="URI" value={value.uri} />
    <Field.Text label="Username" value={value.username} />
    <Field.Text label="Password" value={value.password} />
  </>
);
```

## Form State Integration with Database Models

### Type Alignment

```tsx
// Model.constant.ts

export class ProjectInput {
  @Field.Prop(() => String)
  name: string;
}

// Project.Template.tsx
const form = st.use.projectForm(); // Type: ProjectInput

<Field.Text value={form.name} onChange={st.do.setNameOnProject} />;
```

### Data Transformation

```tsx
// Before submission
const handleSubmit = () => {
  const dataToSend = transformFormData(form);
  st.do.createProject(dataToSend);
};

// After load
useEffect(() => {
  if (data) {
    const formData = transformAPIData(data);
    st.do.setProjectForm(formData);
  }
}, [data]);
```

## Troubleshooting Common Issues

### Common Problems and Solutions

| Issue                   | Solution                                       |
| ----------------------- | ---------------------------------------------- |
| Form not updating       | Verify Zustand actions are connected correctly |
| Validation not working  | Check validate prop and error handling         |
| Performance issues      | Memoize components, debounce inputs            |
| Type mismatches         | Ensure constant types match form state         |
| Missing translations    | Verify dictionary keys and scopes              |
| Form reset issues       | Check cleanup useEffect dependencies           |
| API submission failures | Validate server-side requirements              |

### Debugging Tips

1. Check Zustand store state with Redux DevTools
2. Verify prop drilling in complex forms
3. Test validation rules independently
4. Check network requests for API errors
5. Verify dictionary key paths with `l()` function
6. Ensure all required fields have `required` prop

## Integration with API Calls and Form Submission

### Submission Workflow

```tsx
const handleSubmit = async () => {
  try {
    // Validate form
    const errors = validateForm(form);
    if (Object.keys(errors).length) throw errors;

    // Submit data
    if (id) {
      await st.do.updateModel(id, form);
    } else {
      await st.do.createModel(form);
    }

    // Redirect on success
    router.push("/success");
  } catch (error) {
    // Handle API errors
    st.do.setFormErrors(error);
  }
};

// In component
<Button onClick={handleSubmit}>Save</Button>;
```

### API Error Handling

```tsx
// In store
createModel: async (form) => {
  try {
    return await fetch.createModel(form);
  } catch (error) {
    // Transform API errors to form errors
    const formErrors = transformErrors(error);
    set({ formErrors });
    throw formErrors;
  }
};
```

### Success/Failure Feedback

```tsx
// Using toast notifications
toast.success(l("model.createdSuccess"));

// Inline messages
{
  submitError && <div className="text-error">{submitError}</div>;
}
```

## Additional Best Practices

### Component Design Principles

1. **Single Responsibility**: Each template should focus on one model
2. **Reusability**: Design components to work in different contexts
3. **Composition**: Build complex forms from simple components
4. **Consistency**: Follow established patterns across all templates
5. **Accessibility**: Meet WCAG 2.1 standards for all form elements

### Performance Guidelines

1. Avoid unnecessary state updates
2. Use React.memo for expensive components
3. Virtualize long lists of fields
4. Debounce rapid state updates
5. Lazy load heavy form sections

### Testing Recommendations

1. Unit test validation functions
2. Test form submission flows
3. Verify internationalization coverage
4. Test accessibility with screen readers
5. Perform cross-browser testing
