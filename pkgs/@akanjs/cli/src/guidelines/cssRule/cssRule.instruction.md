# CSS Styling Guidelines with TailwindCSS and DaisyUI in Akan.js

## Introduction

This document provides comprehensive styling guidelines for Akan.js components using TailwindCSS and DaisyUI. Following these standards ensures consistency, maintainability, and proper theming across all applications in the Akan.js ecosystem.

## Core Principles

1. **Utility-First Approach**: Use Tailwind's utility classes for styling instead of custom CSS
2. **Component Composition**: Design with composition in mind, allowing styling overrides via `className` prop
3. **Theme Consistency**: Use DaisyUI's theme variables for colors and maintain consistent spacing
4. **Responsive Design**: Implement mobile-first responsive layouts using Tailwind's breakpoint prefixes
5. **Accessibility**: Ensure proper contrast, focus states, and semantic markup

## Class Management with `clsx`

### Importing `clsx`

Always import the `clsx` utility from the client package:

```tsx
import { clsx } from "@akanjs/client";
```

### Basic Usage

Use `clsx` to combine class names conditionally:

```tsx
<div
  className={clsx(
    "base-classes", // Always applied
    condition && "conditional-classes", // Applied when condition is true
    className // Forward className from props
  )}
>
  {/* Content */}
</div>
```

### Object Syntax for Multiple Conditions

```tsx
<div
  className={clsx(
    "base-styles",
    {
      "bg-primary": isPrimary,
      "bg-secondary": isSecondary,
      "bg-success": isSuccess,
      "bg-error": isError,
    },
    className
  )}
>
  {/* Content */}
</div>
```

## Component Structure Best Practices

### 1. Accept and Forward `className` Prop

Every component should accept a `className` prop to enable style composition:

```tsx
interface CardProps {
  className?: string;
  // Other props...
}

export const Card = ({ className, ...props }: CardProps) => {
  return (
    <div
      className={clsx(
        "card bg-base-100 shadow-md",
        className // Always include at the end to allow overrides
      )}
    >
      {/* Card content */}
    </div>
  );
};
```

### 2. Use DaisyUI's Semantic Color System

Avoid hardcoded color values. Use DaisyUI's theme variables instead for better theming support:

✅ **Recommended:**

```tsx
<div className="bg-primary text-primary-content hover:bg-primary-focus">Themeable content</div>
```

❌ **Avoid:**

```tsx
<div className="bg-[#3b82f6] text-white hover:bg-[#2563eb]">Hardcoded colors</div>
```

**DaisyUI Color System:**

| Base Color | Text Color        | Focus/Hover Variant |
| ---------- | ----------------- | ------------------- |
| primary    | primary-content   | primary-focus       |
| secondary  | secondary-content | secondary-focus     |
| accent     | accent-content    | accent-focus        |
| neutral    | neutral-content   | neutral-focus       |
| base-100   | base-content      | base-200/base-300   |
| info       | info-content      | info-focus          |
| success    | success-content   | success-focus       |
| warning    | warning-content   | warning-focus       |
| error      | error-content     | error-focus         |

### 3. Implement Responsive Design

Use Tailwind's responsive prefixes for mobile-first development:

```tsx
<div className="flex flex-col gap-4 md:flex-row">
  <div className="w-full md:w-1/3">Sidebar</div>
  <div className="w-full md:w-2/3">Main Content</div>
</div>
```

**Breakpoint prefixes:**

- `sm:` - 640px and above
- `md:` - 768px and above
- `lg:` - 1024px and above
- `xl:` - 1280px and above
- `2xl:` - 1536px and above

### 4. Implement State and Interaction Variants

Use Tailwind's state variants for interactive elements:

```tsx
<button className="bg-primary text-primary-content hover:bg-primary-focus focus:ring-primary focus:ring-2 focus:ring-offset-2 active:scale-95 disabled:pointer-events-none disabled:opacity-50">
  Interactive Button
</button>
```

**Common state variants:**

- `hover:` - Mouse hover state
- `focus:` - Focus state
- `active:` - Active/pressed state
- `disabled:` - Disabled state
- `group-hover:` - Parent hover targeting child elements
- `dark:` - Dark mode variant

### 5. Use Consistent Spacing

Maintain consistent spacing using Tailwind's scale:

```tsx
<div className="space-y-4">
  <div className="p-4">Section 1</div>
  <div className="p-4">Section 2</div>
  <div className="p-4">Section 3</div>
</div>
```

## Component Types in Akan.js

Akan.js follows specific component naming conventions with distinct styling approaches:

### 1. Unit Components (\*.Unit.tsx)

List items or cards that display summarized data:

```tsx
// Example: Project.Unit.tsx
export const Card = ({ className, project, href }: ModelProps<"project", cnst.LightProject>) => {
  return (
    <Link
      href={href}
      className={clsx(
        "border-base-300 bg-base-100 flex flex-col gap-3 rounded-lg border-2 p-4",
        "hover:border-primary transition-all hover:shadow-md",
        "focus:ring-primary focus:ring-2 focus:outline-hidden",
        className
      )}
    >
      <h3 className="text-base-content text-lg font-semibold">{project.name}</h3>
      {/* Additional content */}
    </Link>
  );
};
```

### 2. View Components (\*.View.tsx)

Detailed displays of full data models:

```tsx
// Example: Project.View.tsx
export const Detail = ({ className, project }: ModelProps<"project", cnst.FullProject>) => {
  return (
    <div className={clsx("bg-base-100 rounded-lg p-6 shadow-lg", className)}>
      <div className="border-base-content mb-8">
        <h1 className="text-2xl font-bold">{project.name}</h1>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">{/* Project details */}</div>
    </div>
  );
};
```

### 3. Edit Components (\*.Edit.tsx)

Form components for creating or editing data:

```tsx
// Example: Project.Edit.tsx
export const Form = ({ className }: { className?: string }) => {
  const { project, setProject } = useProjectStore();

  return (
    <div className={clsx("card bg-base-100 p-6 shadow-lg", className)}>
      <h2 className="card-title mb-4">Project Details</h2>

      <div className="form-control w-full">
        <label className="label">
          <span className="label-text">Project Name</span>
        </label>
        <input
          type="text"
          className="input input-bordered w-full"
          value={project.name}
          onChange={(e) => setProject({ ...project, name: e.target.value })}
        />
      </div>

      {/* Additional form fields */}
    </div>
  );
};
```

### 4. Util Components (\*.Util.tsx)

Special function components like buttons, toggles, and actions:

```tsx
// Example: Project.Util.tsx
export const StatusBadge = ({ className, status }: { className?: string; status: ProjectStatus }) => {
  return (
    <span
      className={clsx(
        "badge font-medium",
        status === "active" && "badge-success",
        status === "pending" && "badge-warning",
        status === "canceled" && "badge-error",
        status === "completed" && "badge-info",
        className
      )}
    >
      {status}
    </span>
  );
};
```

### 5. Zone Components (\*.Zone.tsx)

Container components that combine multiple components:

```tsx
// Example: Project.Zone.tsx
export const ProjectDashboard = ({ className }: { className?: string }) => {
  return (
    <div className={clsx("grid grid-cols-1 gap-6 lg:grid-cols-3", className)}>
      <div className="lg:col-span-2">
        <ProjectSummary />
      </div>
      <div>
        <ProjectStats />
      </div>
      <div className="lg:col-span-3">
        <ProjectTimeline />
      </div>
    </div>
  );
};
```

## Common UI Patterns

### 1. Card Pattern

```tsx
<div className="card bg-base-100 shadow-md transition-shadow hover:shadow-lg">
  <figure className="px-4 pt-4">
    <img src={image.url} alt={title} className="h-48 w-full rounded-lg object-cover" />
  </figure>
  <div className="card-body">
    <h2 className="card-title">{title}</h2>
    <p className="text-base-content/70">{description}</p>
    <div className="card-actions mt-4 justify-end">
      <button className="btn btn-primary btn-sm">View Details</button>
    </div>
  </div>
</div>
```

### 2. Form Pattern

```tsx
<div className="form-control w-full max-w-md">
  <label className="label">
    <span className="label-text">Email</span>
  </label>
  <input
    type="email"
    className="input input-bordered w-full"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
  <label className="label">
    <span className="label-text-alt text-error">{error}</span>
  </label>
</div>
```

### 3. List Pattern

```tsx
<div className="bg-base-100 rounded-lg shadow">
  <div className="border-base-200 border-b p-4 font-medium">Items List</div>
  <ul>
    {items.map((item) => (
      <li key={item.id} className="border-base-200 border-b last:border-none">
        <div className="hover:bg-base-200 p-4 transition-colors">
          <div className="flex items-center justify-between">
            <span>{item.name}</span>
            <span className="badge badge-outline">{item.category}</span>
          </div>
        </div>
      </li>
    ))}
  </ul>
</div>
```

### 4. Dashboard Pattern

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
  <div className="stats bg-base-100 shadow">
    <div className="stat">
      <div className="stat-title">Total Users</div>
      <div className="stat-value">{totalUsers}</div>
      <div className="stat-desc">↗︎ 14% from last month</div>
    </div>
  </div>

  {/* Additional stat cards */}
</div>
```

## Best Practices

### 1. Component Composition

- Create small, focused components
- Combine them to build complex UIs
- Use props for variations
- Accept and forward `className` for style overrides

### 2. Consistent Layout

- Use Flexbox and Grid for layouts
- Maintain consistent spacing
- Implement proper padding and margins
- Design for all screen sizes

### 3. Color Usage

- Use DaisyUI theme colors
- Maintain proper contrast ratios
- Use opacity modifiers for variants (`bg-primary/80`)
- Avoid hardcoded colors

### 4. Performance Optimization

- Group related classes
- Use Tailwind's JIT mode
- Purge unused styles in production
- Prefer Tailwind classes over custom CSS

### 5. Dark Mode Support

```tsx
<div className="bg-base-100 text-base-content">{/* Content automatically adapts to dark mode via DaisyUI */}</div>
```

## Common Mistakes to Avoid

1. **Inconsistent Spacing**: Mixing arbitrary values instead of using Tailwind's scale
2. **Hardcoded Colors**: Using hex codes or RGB values instead of theme variables
3. **Missing `className` Prop**: Not forwarding the prop for composition
4. **Direct Style Imports**: Importing component styles directly instead of using utility classes
5. **Overriding Base Styles**: Applying too many custom styles that break theme consistency

## Troubleshooting

### 1. Styles Not Applying

- Check for typos in class names
- Ensure proper precedence (later classes override earlier ones)
- Verify the correct Tailwind configuration

### 2. DaisyUI Components Not Working

- Check DaisyUI installation
- Verify theme configuration
- Ensure component classes are applied correctly

### 3. Responsive Design Issues

- Test at various breakpoints
- Use the correct breakpoint prefixes
- Implement mobile-first approach

## Additional Resources

1. [TailwindCSS Documentation](https://tailwindcss.com/docs)
2. [DaisyUI Documentation](https://daisyui.com/)
3. [Tailwind CSS Cheat Sheet](https://nerdcave.com/tailwind-cheat-sheet)

By following these guidelines, you'll create consistent, maintainable, and themeable components that align with the Akan.js design system. Always prioritize composition over customization and leverage the power of TailwindCSS and DaisyUI utilities.
