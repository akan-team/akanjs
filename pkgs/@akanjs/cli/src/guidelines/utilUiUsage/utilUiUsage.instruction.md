# @util/ui Component Library Guide

This guide explains how to use the `@util/ui` component library in the Akan.js framework. The `libs/util/ui` directory contains a comprehensive React component library designed for modern web applications with consistent styling, type safety, and advanced functionality.

## Importing Components

Import components from the `@util/ui` package:

```tsx
// Single component import
import { Button } from "@util/ui";

// Multiple components import
import { Button, Input, Link, Image } from "@util/ui";

// Namespace component import
import { Dialog } from "@akanjs/ui";
```

## Component Organization and Usage

The component library follows a namespace pattern where complex components expose subcomponents as properties:

```tsx
// Namespaced component usage example
<Dialog>
  <Dialog.Trigger>Open Dialog</Dialog.Trigger>
  <Dialog.Modal>
    <Dialog.Title>Title</Dialog.Title>
    <Dialog.Content>Content</Dialog.Content>
    <Dialog.Action>
      <button>Confirm</button>
    </Dialog.Action>
  </Dialog.Modal>
</Dialog>
```

## Common Component Patterns

### Form Fields and Data Input

The library provides comprehensive form components with built-in validation:

```tsx
// Button with loading state handling
<Button
  onClick={async (e, { onError }) => {
    try {
      const result = await saveData();
      return result;
    } catch (error) {
      onError("Failed to save");
    }
  }}
  onSuccess={(result) => handleSuccess(result)}
>
  Save
</Button>

// Text input with validation
<Input
  value={inputValue}
  onChange={(value) => setInputValue(value)}
  validate={(value) => value.length > 0 || "Field is required"}
  placeholder="Enter value"
  inputClassName="w-full"
  cacheKey="unique-input-key" // For session storage persistence
  icon={<SomeIcon />}
/>

// Select dropdown
<Select
  value={selectedValue}
  options={optionsList}
  searchable
  onChange={(value) => setSelectedValue(value)}
  renderOption={(option) => <span>{option.label}</span>}
/>
```

### Data Display Components

Use these components to present data:

```tsx
// Image with optimized loading
<Image
  src="/path/to/image.jpg"
  alt="Description"
  className="rounded-md"
  width={400}
  height={300}
/>

// Avatar for user profiles
<Avatar
  src={user.profileImage}
  className="w-10 h-10"
/>

// Empty state
<Empty
  description="No items found"
  minHeight={200}
/>

// Chart visualization
<Chart.Bar
  data={chartData}
  options={chartOptions}
/>
```

### Navigation Components

The library provides various navigation patterns:

```tsx
// Adaptive link (auto-switches between CSR/Next.js)
<Link href="/some-path">Go to Page</Link>

// Back navigation
<Link.Back>Go Back</Link.Back>

// Tabbed interface
<Tab.Provider defaultMenu="tab1">
  <div className="flex">
    <Tab.Menu menu="tab1">Tab 1</Tab.Menu>
    <Tab.Menu menu="tab2">Tab 2</Tab.Menu>
  </div>
  <Tab.Panel menu="tab1">
    Content for tab 1
  </Tab.Panel>
  <Tab.Panel menu="tab2" loading="lazy">
    Content for tab 2
  </Tab.Panel>
</Tab.Provider>
```

### Layout Components

Create consistent layouts across your application:

```tsx
// Page layout with header
<Layout>
  <Layout.Header type="hide">Header Content</Layout.Header>
  <main>Page Content</main>
  <Layout.Navbar>Navigation Items</Layout.Navbar>
</Layout>

// Modal dialog
<Modal
  open={isModalOpen}
  onCancel={() => setModalOpen(false)}
  title="Modal Title"
>
  Modal content goes here
</Modal>

// Mobile bottom sheet
<BottomSheet
  open={isBottomSheetOpen}
  onCancel={() => setBottomSheetOpen(false)}
  type="half"
>
  Bottom sheet content
</BottomSheet>
```

### Media and File Components

Handle files and media with these components:

```tsx
// Single image upload with cropping
<Upload.Image
  file={imageFile}
  onChange={async (file) => {
    // Handle file upload
    const uploadedFile = await uploadFile(file);
    setImageFile(uploadedFile);
  }}
  onRemove={() => setImageFile(null)}
/>

// Multiple file upload
<Upload.FileList
  multiple
  fileList={fileList}
  onChange={async (files) => {
    // Handle multiple file upload
    const uploadedFiles = await uploadFiles(files);
    setFileList([...fileList, ...uploadedFiles]);
  }}
  onRemove={(file) => {
    setFileList(fileList.filter(f => f.id !== file.id));
  }}
/>
```

### Loading and Feedback Components

Provide user feedback with these components:

```tsx
// Loading area overlay
<Loading.Area />

// Loading spinner
<Loading.Spin isCenter />

// Progress bar
<Loading.ProgressBar value={75} max={100} />

// Loading skeleton
<Loading.Skeleton />
```

## Integration with Akan.js Architecture

The `@util/ui` components are designed to work within the Akan.js module architecture pattern:

### In Model.Template.tsx

```tsx
// Form templates for creating/editing records
import { Button, Input, Select } from "@util/ui";

export const UserTemplate = ({ user, onSubmit }) => {
  return (
    <form onSubmit={onSubmit}>
      <Input
        label="Username"
        value={user.username}
        onChange={(value) => updateUser({ username: value })}
        validate={(value) => value.length > 3 || "Username too short"}
      />
      <Select label="Role" value={user.role} options={roleOptions} onChange={(value) => updateUser({ role: value })} />
      <Button type="submit">Save User</Button>
    </form>
  );
};
```

### In Model.Unit.tsx

```tsx
// Card/list item components for displaying records
import { Avatar, Link } from "@util/ui";

export const UserUnit = ({ user }) => {
  return (
    <div className="flex items-center rounded border p-4">
      <Avatar src={user.profileImage} className="mr-4" />
      <div>
        <h3>{user.name}</h3>
        <p>{user.email}</p>
      </div>
      <Link href={`/users/${user.id}`}>View Profile</Link>
    </div>
  );
};
```

### In Model.View.tsx

```tsx
// Full page views for displaying detailed records
import { Tab, Layout, Loading } from "@util/ui";

export const UserView = ({ user, isLoading }) => {
  if (isLoading) return <Loading.Area />;

  return (
    <Layout>
      <Layout.Header>{user.name}'s Profile</Layout.Header>
      <Tab.Provider defaultMenu="details">
        <Tab.Menu menu="details">Details</Tab.Menu>
        <Tab.Menu menu="activity">Activity</Tab.Menu>

        <Tab.Panel menu="details">{/* User details content */}</Tab.Panel>
        <Tab.Panel menu="activity" loading="lazy">
          {/* User activity content */}
        </Tab.Panel>
      </Tab.Provider>
    </Layout>
  );
};
```

## Best Practices

1. **Component Selection**

   - Use the most specific component for the task
   - Prefer namespaced components for complex UI elements
   - Combine components to create consistent patterns

2. **Props Usage**

   - Only use the documented props for each component
   - Follow the TypeScript interfaces for proper type checking
   - Use className props for styling customization

3. **Styling**

   - Use Tailwind CSS classes for styling customization
   - Maintain consistent spacing and layout
   - Follow responsive design patterns

4. **Accessibility**

   - Use proper ARIA attributes when required
   - Ensure keyboard navigation works correctly
   - Maintain color contrast requirements

5. **Performance**
   - Use lazy loading for heavy components
   - Implement proper memoization for complex components
   - Keep render cycles efficient

## [Strict Caution]

- Every component must be used exactly as described in this documentation
- Do not add any additional props to the components beyond those documented
- Only the components explicitly listed in the documentation are available
- Follow the established patterns for component composition and layout

## Framework Integration Features

- TypeScript support with strict typing
- Responsive design with mobile-first approach
- Internationalization (i18n) integration
- Session storage caching for form inputs
- Accessibility compliance
- Consistent DaisyUI/Tailwind CSS styling
- Modern React patterns (hooks, context, providers)
- Error handling and validation systems
