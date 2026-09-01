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
- Lib-Owned Tokens (#lib-tokens)
- Font Declaration (#font-declaration)

## Content

CSS And Styling

Styling Foundation

Akan uses Tailwind CSS with a semantic design-token layer and the akanjs/ui primitives as the default styling foundation. Tailwind gives screens a fast utility language for layout, spacing, responsive behavior, and one-off composition. The token layer + primitives add semantic names, so app screens can say primary, background, warning, or destructive instead of hard-coding every color.

Use Tailwind for structure and layout. Use akanjs/ui primitives (Button, Badge, Input, Field …) and semantic tokens for theme-aware components and colors.

How the layers work together

Imports Tailwind, Akan UI styles, and the semantic design-token layer.

Turns brand decisions into reusable names such as primary, base, warning, and error.

Use those names through akanjs/ui primitives (Button, Input, Badge) and Tailwind utility classes.

Assemble consistent business screens without repeating raw color and spacing rules.

Design System First

Do not design every page from scratch. Define the app's basic component style first, then let pages assemble those components. Buttons, inputs, cards, forms, alerts, tabs, modals, and navigation should share the same spacing, radius, text color, border, and state behavior.

Buttons, inputs, cards, forms, alerts, tabs, modals, and navigation should use shared classes.

Business pages should assemble the design system instead of redefining colors and spacing.

Imported modules feel consistent when they use the same Tailwind and semantic design tokens.

Theme System Declaration

Theme and color are declared from the app style entry. The app imports Tailwind and Akan UI styles, defines raw CSS variables per theme under :root / [data-theme], then maps them to Tailwind color names with @theme inline. Switching themes is just toggling the data-theme attribute.

Because @theme inline references var(), the same class (bg-primary, text-foreground …) resolves to different colors per data-theme — so one app can define light, dark, brand, or admin themes without changing any component class.

Lib-Owned Tokens

A lib whose components need fixed colors — a vendor sign-in button, a brand mark — declares them once in libs/<lib>/ui/tokens.css. Every app whose pages reach that lib compiles the file automatically, ahead of its own stylesheets, so the app stays the last word on any variable both declare. Nothing is imported by hand, and adding an app cannot forget it.

These are plain custom properties, not a Tailwind @theme extension: the color vocabulary is closed per stylesheet, so bg-kakao would generate no CSS. Reference them as bg-[var(--kakao)], which the color lint rules allow by design. An @import the pipeline cannot resolve fails the build rather than compiling to nothing.

Font Declaration

Fonts are declared from the root layout. Export a fonts array with a font name, file paths, weights, and an optional default flag. Akan then exposes those fonts as Tailwind-like classes, so components can use className values such as font-pretendard or font-lemonmilk.

## Code Examples

### Code

```typescript
<div className="space-y-3 rounded-xl bg-background p-4 text-foreground">
  <button className={buttonRecipe({ variant: "primary" })}>Save</button>
  <input className="h-10 w-full rounded-field border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none" placeholder="Product name" />
  <div className="rounded-box border border-border bg-card p-4">
    Product summary
  </div>
  <div className="flex items-center gap-2 rounded-box border border-info/30 bg-info/10 p-4">Stock updated successfully.</div>
</div>
```

### apps/myapp/page/styles.css

```ts
@import "tailwindcss";
@import "akanjs/ui/styles.css";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

:root,
[data-theme="dark"] {
  --background: #1a1a1a;
  --foreground: #ffffff;
  --primary: #ff493b;
  --primary-foreground: #ffffff;
  --muted: #2a2a2a;
  --border: #3a3a3a;
}

[data-theme="light"] {
  --background: #fafafa;
  --foreground: #2c3e50;
  --primary: #c33c32;
  --primary-foreground: #ffffff;
  --muted: #f5f5f5;
  --border: #e5e5e5;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-border: var(--border);
}
```

### libs/social/ui/tokens.css

```ts
:root {
  --kakao: #fee500;
  --kakao-foreground: #3c1e1e;
  --naver: #1ec800;
}
```

### libs/social/ui/KakaoButton.tsx

```typescript
<button className="bg-[var(--kakao)] text-[var(--kakao-foreground)]">Kakao</button>
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
<span className="font-pretendard text-foreground">
  Styled with Pretendard
</span>

<span className="font-lemonmilk text-primary">
  Brand logo styled with Lemon Milk
</span>
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

