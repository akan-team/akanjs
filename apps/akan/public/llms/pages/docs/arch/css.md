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

When every screen writes its own colors (#ff493b here, a red utility class there), changing the brand or adding a dark theme means hunting down each one. Akan avoids that by naming colors for what they are for, and letting every screen use the names.

Akan uses Tailwind CSS with a semantic design-token layer and the akanjs/ui primitives as the default styling foundation. So app screens say primary, background, warning or destructive instead of hard-coding every color. The two halves split the work like this:

Structure and layout

A fast utility language for layout, spacing, responsive behavior and one-off composition.

Tokens + akanjs/ui

Theme-aware colors and components

Semantic color names and primitives (Button, Badge, Input, Field …) that follow the theme.

Words used on this page

Term

- semantic token: A color named for its role (primary, background, destructive) instead of its value.

- theme: One set of values for every token. The data-theme attribute picks which set applies.

- primitive: A ready-made akanjs/ui component (Button, Input, Badge, Field) that already uses the tokens.

- custom property: A CSS variable such as --primary. Tokens are custom properties underneath.

How the layers work together

Four layers, each built from the one below

From the bottom up: semantic tokens, recipes that compose them into looks, components that add behavior, and screens that assemble components. Every color on a screen traces back to a token.

Layer

What it does

- tokens: Brand decisions turned into names such as primary, background, warning and destructive.

- recipes: Functions that compose token classes into one named look, such as buttonRecipe.

- components: akanjs/ui primitives (Button, Input, Badge) and Tailwind utilities that use those names.

- screens: Business screens assembled from components, without repeating raw color and spacing rules.

Tokens are declared in page/styles.css, which also imports Tailwind and the Akan UI styles. The Theme System section below shows that file; the UI Recipe page covers the recipe layer.

Design System First

A page designed from scratch drifts: its buttons end up a little rounder, its borders a little lighter than the page next to it. So define the app's basic component style first, and let pages only assemble those components.

Buttons, inputs, cards, forms, alerts, tabs, modals and navigation share the same spacing, radius, text color, border and state behavior, through shared classes.

Business pages assemble the design system instead of redefining colors and spacing.

Imported modules feel consistent too, because they use the same Tailwind and semantic design tokens.

A block built this way uses no color values at all, only token names and recipes:

Switch the theme and the whole block restyles itself, because every class in it points at a token rather than a color.

Theme System Declaration

Components write bg-primary once. Which red that means is decided in a single file, the app style entry, once per theme. Declaring it takes four steps:

Import Tailwind and the Akan UI styles.

Define the raw values per theme as CSS variables under :root and [data-theme].

Map those variables to Tailwind color names with @theme inline.

Switch themes by changing the data-theme attribute. Nothing else changes.

A color that text sits on comes with a -foreground partner for that text: bg-primary pairs with text-primary-foreground, so a label on a primary button stays readable in every theme.

Because @theme inline references var(), the same class (bg-primary, text-foreground …) resolves to a different color per data-theme. One app can define light, dark, brand or admin themes without changing any component class.

Lib-Owned Tokens

Some colors must not follow the theme. A Kakao sign-in button is Kakao yellow in the light theme and in the dark one. When a lib's components need fixed colors like that, the lib declares them itself:

Theme tokens

Follow the theme

Declared in the app's page/styles.css and mapped with @theme inline.

Lib tokens

Fixed in every theme

Declared once in libs/<lib>/ui/tokens.css as plain custom properties.

Every app whose pages reach that lib picks the file up automatically, ahead of its own stylesheets, so the app still has the last word on any variable both declare. Nothing is imported by hand, and a new app cannot forget it.

Why not a Tailwind @theme extension? The color vocabulary is closed per stylesheet, so bg-kakao would generate no CSS. Reference the variable as bg-[var(--kakao)], a form the color lint rules allow on purpose.

Font Declaration

Fonts are declared once, in the root layout, and then used like any other Tailwind class. Hand the .fonts() stage of the rootLayout() chain an array; each entry takes three fields:

Field

- name: The font's name. It becomes the class font-<name>, such as font-pretendard.

- paths: One entry per font file: its src and the weight it covers.

- default: The font the whole app uses when no font class is set. Only one font can be the default.

Each name is now a class. Text without one uses the default font, Pretendard here:

## Code Examples

### Code

```typescript
<div className="space-y-3 rounded-xl bg-background p-4 text-foreground">
  <button className={buttonRecipe({ variant: "primary" })}>Save</button>
  <input className={inputRecipe({}, "w-full")} placeholder="Product name" />
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

### apps/myapp/page/_layout.tsx

```typescript
import "./styles.css";
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .fonts([
    {
      name: "pretendard",
      default: true,
      paths: [
        { src: "/libs/shared/fonts/Pretendard-Regular.woff2", weight: 400 },
        { src: "/libs/shared/fonts/Pretendard-SemiBold.woff2", weight: 600 },
        { src: "/libs/shared/fonts/Pretendard-Bold.woff2", weight: 700 },
      ],
    },
    {
      name: "lemonmilk",
      paths: [{ src: "/fonts/LemonMilk-Bold.woff2", weight: 700 }],
    },
  ])
  .render(({ children }) => children);
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

