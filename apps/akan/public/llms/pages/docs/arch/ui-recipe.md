# UI Recipe Layer

- Source: /docs/arch/ui-recipe
- Mirror: /llms/pages/docs/arch/ui-recipe.md
- Section: docs
- Category: Architecture
- Priority: P2

## Headings

- Recipe Layer (#recipe-layer)
- Framework Recipes (#framework-recipes)
- App-Level Recipes (#app-recipes)
- When To Reach For A Recipe (#when-recipe)
- Recipe Override (#recipe-override)
- Customization Decision (#customization-decision)

## Content

UI Recipe Layer

Recipe Layer

A recipe is a variant factory (built on tailwind-variants) that sits between the token layer and the components. Tokens answer 'what is this color'; a recipe answers 'what does this component look like' by composing semantic-token classes into named variants; the component answers 'how does it behave'. Each layer only knows the one below it.

The three UI layers

Semantic tokens (CSS variables). Theme-aware, server/client agnostic. 'What is this color.'

Variant factories composing tokens. Server-safe (no 'use client'). 'How does it look.'

Consume recipes; add interaction/state. 'use client' only when needed. 'How does it behave.'

A recipe module never carries 'use client'. Because it is a plain function returning a className string, both server components and client components can call it — a server page can style a raw <Link> or <div> with buttonRecipe() directly.

Framework Recipes

akanjs/ui ships buttonRecipe and badgeRecipe from a server-safe module. Call them anywhere to style raw elements, and pass extra classes as the second argument — the recipe merges them for you with tailwind-merge, so you never wrap it in cn(). The Button and Badge components consume the same recipes internally.

buttonRecipe variants: primary, secondary, accent, outline, ghost, destructive, success, warning, info, link — plus size xs/sm/md/lg/icon.

badgeRecipe variants: default, primary, secondary, accent, success, warning, info, error, outline.

Every variant class is a semantic token (bg-primary, text-success-foreground …), so it stays theme-aware automatically.

Recipes live in their own module (akanjs/ui/recipe.ts) precisely so they are not client-only. If a recipe were exported from a 'use client' component file, calling it from a server component would throw 'client-only export'. The separate recipe layer removes that boundary.

App-Level Recipes

When a surface repeats across your app — a gradient hero, an icon tile, a chat bubble — do not inline the same class string everywhere. Add a recipe to the app's ui/Recipe.ts (server-safe, PascalCase file name per the app ui convention) and import it from the ui barrel. This mirrors the framework's ui/recipe.ts at the app level.

The page then stops repeating class strings and reads its variant from data:

Convention: build each factory with recipe(tv({ base, variants })) (both re-exported from akanjs/ui), name it <name>Recipe, and keep the file free of 'use client'. Call it as xRecipe(variants, className?) — the second arg is merged internally, no cn() needed. App ui files are PascalCase, so the file is ui/Recipe.ts even though the framework's is the lowercase ui/recipe.ts.

When To Reach For A Recipe

Recipes earn their keep when a class set is reused, conditionally composed, or needed from a server component. One-off classes should stay inline.

Repeated or variant-like surface (status pill, hero, bubble, tile) → extract a recipe.

A class chosen from a fixed set by data (tone, size, side, status) → a recipe variant.

Styling needed from a server component or a raw element → a recipe (server-safe).

A genuinely one-off className → keep it inline; do not over-abstract.

Recipe Override

Recipe Override — Re-skin Without Rebuilding

A route's _overrides.tsx can swap a recipe slot. Every framework component that consumes that recipe (Button, Badge …) re-skins across the whole route subtree — while its behavior (async states, focus trap, a11y) stays exactly as the framework ships it. Only the className factory changes.

The swap recipe must accept the framework recipe's full variant surface so every call site keeps working. It reaches framework components (which read the slot); a raw buttonRecipe(...) call in your own JSX is not affected — import your own recipe there instead.

Customization Decision

Two Questions, One Invariant

Customization is decided once at design-system setup, not per screen. The screen code — a plain <Button> — never changes across any answer; only config files do. Diff your design spec against the /lab catalog once, then classify each delta.

Q1. Theme differs (color · radius · font)? → override token values in app page/styles.css. Else → akan defaults.

Q2. Component look differs? → write an app recipe, inject via _overrides.tsx recipes. Else → use as-is.

Q3. Structure or behavior differs (modal → drawer)? → component override (reassemble headless parts). Else → not needed.

A surface lib doesn't have (chat bubble, tile)? → add a new app recipe (extension — no lib counterpart, so no conflict).

App recipes extend (surfaces lib lacks); they never re-define a lib component in parallel. To change a lib component's look, use recipe override — do not create a parallel button recipe. And when the same className tweak repeats, promote it to a recipe override (app-wide) or a variant.

## Code Examples

### Code

```typescript
import { buttonRecipe, badgeRecipe, Link } from "akanjs/ui";

// Server component: style a raw element straight from the recipe.
<Link className={buttonRecipe({ variant: "primary", size: "lg" })}>Save</Link>;
<span className={badgeRecipe({ variant: "success" })}>Active</span>;

// Extra classes go in the 2nd arg — merged internally, no cn() needed.
<button className={buttonRecipe({ variant: "outline" }, "w-full rounded-2xl")} />;
```

### apps/myapp/ui/Recipe.ts

```typescript
import { recipe, tv } from "akanjs/ui";
// No "use client" — recipes are server-safe.

export const chatBubbleRecipe = recipe(
  tv({
    base: "max-w-[78%] rounded-3xl p-4 text-sm",
    variants: {
      side: {
        incoming: "rounded-tl-md bg-muted text-foreground/75",
        outgoing: "ml-auto rounded-tr-md bg-primary text-primary-foreground",
      },
    },
    defaultVariants: { side: "incoming" },
  }),
);
export type ChatBubbleVariants = NonNullable<Parameters<typeof chatBubbleRecipe>[0]>;
```

### apps/myapp/page/(home)/inbox/chat.tsx

```typescript
import { chatBubbleRecipe } from "@apps/myapp/ui";

// Before: the same bubble class was inlined 12 times.
// After: one recipe, driven by data.
{messages.map((message, index) => (
  <div key={index} className={chatBubbleRecipe({ side: message.side })}>
    {message.text}
  </div>
))}
```

### apps/myapp/ui/Recipe.ts

```typescript
// buttonRecipe 와 같은 variant/size 표면을 유지해야 슬롯에 주입 가능.
export const neonButtonRecipe = recipe(
  tv({
    base: "rounded-none border-2 font-mono uppercase tracking-widest",
    variants: {
      variant: { primary: "border-primary text-primary hover:bg-primary hover:text-primary-foreground", /* … */ },
      size: { md: "h-10 px-4", /* … */ },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }),
);
```

### apps/myapp/page/(section)/_overrides.tsx

```typescript
import { neonButtonRecipe } from "@apps/myapp/ui";
import { override } from "akanjs/ui";

// 이 라우트 서브트리의 모든 <Button> 이 네온으로 — 호출 코드는 그대로.
export default override({ recipes: { button: neonButtonRecipe } });
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

