# CSS And Styling

- Source: /docs/arch/css
- Mirror: /llms/pages/docs/arch/css.md
- Section: docs
- Category: Architecture
- Priority: P0

## Headings

- Styling Foundation (#styling-foundation)
- Design System First (#design-system-first)
- Theme System Declaration (#theme-system)
- Font Declaration (#font-declaration)

## Content

CSS And Styling

Styling Foundation

Akan uses Tailwind CSS and DaisyUI as the default styling foundation. Tailwind gives screens a fast utility language for layout, spacing, responsive behavior, and one-off composition. DaisyUI adds semantic component names and theme tokens, so app screens can say primary, base, warning, or error instead of hard-coding every color.

Use Tailwind for structure and layout. Use DaisyUI for theme-aware component vocabulary and semantic colors.

How the layers work together

Imports Tailwind, Akan UI styles, DaisyUI, and app theme tokens.

Turns brand decisions into reusable names such as primary, base, warning, and error.

Use those names through btn, input, card, alert, and Tailwind utility classes.

Assemble consistent business screens without repeating raw color and spacing rules.

Design System First

Do not design every page from scratch. Define the app's basic component style first, then let pages assemble those components. Buttons, inputs, cards, forms, alerts, tabs, modals, and navigation should share the same spacing, radius, text color, border, and state behavior.

Buttons, inputs, cards, forms, alerts, tabs, modals, and navigation should use shared classes.

Business pages should assemble the design system instead of redefining colors and spacing.

Imported modules feel consistent when they use the same Tailwind and DaisyUI tokens.

Theme System Declaration

Theme and color are declared from the app style entry. The app imports Tailwind, Akan UI styles, enables DaisyUI, then declares one or more DaisyUI themes. Each theme maps semantic names to real colors.

DaisyUI supports multiple theme blocks, so one app can define light, dark, brand, admin, or demo themes with the same component classes.

DaisyUI Theme Docs

Font Declaration

Fonts are declared from the root layout. Export a fonts array with a font name, file paths, weights, and an optional default flag. Akan then exposes those fonts as Tailwind-like classes, so components can use className values such as font-pretendard or font-lemonmilk.

## Code Examples

### Code

```typescript
<div className="space-y-3 rounded-xl bg-base-100 p-4 text-base-content">
  <button className="btn btn-primary">Save</button>
  <input className="input input-bordered w-full" placeholder="Product name" />
  <div className="card border border-base-300 bg-base-100 p-4">
    Product summary
  </div>
  <div className="alert alert-info">Stock updated successfully.</div>
</div>
```

### apps/myapp/page/akanjs/styles.css

```ts
@import "tailwindcss";
@import "akanjs/ui/styles.css";

@plugin "daisyui" {
  logs: false;
  exclude: properties;
}

@plugin "daisyui/theme" {
  name: "light";
  --color-primary: #c33c32;
  --color-base-content: #2c3e50;
  --color-base-100: #fafafa;
  --color-base-200: #f5f5f5;
}

@plugin "daisyui/theme" {
  name: "dark";
  default: true;
  --color-primary: #ff493b;
  --color-base-content: #ffffff;
  --color-base-100: #1a1a1a;
  --color-base-200: #2a2a2a;
}
```

### apps/myapp/page/akanjs/_layout.tsx

```typescript
import type { Font } from "akanjs/client";

export const fonts: Font[] = [
  {
    name: "pretendard",
    default: true,
    paths: [
      { src: "/libs/shared/fonts/Pretendard-Regular.woff2", weight: 400 },
      { src: "/libs/shared/fonts/Pretendard-SemiBold.woff2", weight: 600 },
      { src: "/libs/shared/fonts/Pretendard-Bold.woff2", weight: 700 },
    ],
  },
];
```

### Using font classes

```typescript
<span className="font-pretendard text-base-content">
  Styled with Pretendard
</span>

<span className="font-lemonmilk text-primary">
  Brand logo styled with Lemon Milk
</span>
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

