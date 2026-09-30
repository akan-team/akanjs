# Customization

- Source: /references/ui/customize
- Mirror: /llms/pages/references/ui/customize.md
- Section: references
- Category: UI Reference
- Priority: P1

## Headings

- Customization (#customization)
- How It Works (#how-it-works)
- Scoping (#scoping)
- Overridable Slots (#slots)
- Generic Components (#generic-components)
- Compound Components (#compound-components)
- Recipe Slots (#recipe-slots)

## Content

Customization

Any `akanjs/ui` component can be re-skinned per route without forking it. Write a replacement in your app's `ui/` and bind it to a slot in a `page/**/_overrides.tsx` manifest. Every `<Modal>`, `<Button>` or `<Table>` under that folder then renders yours, with no call site changed.

Manifests cascade down the route tree like layouts, and the closest one wins.

Words used on this page

Term

- slot: A named place where a framework component can be swapped, such as `Modal` or `InputPassword`.

- _overrides.tsx: The manifest in a `page/` folder that binds slots for every route under that folder.

- drop-in: Your replacement. It takes the same props as the original, so no call site changes.

- headless parts: Parts with behavior but no look of their own, such as `Dialog.Modal`.

- recipe: A function that returns the className for a variant, such as `buttonRecipe({ variant: "primary" })`.

Two kinds of slot

One manifest takes both kinds. Swap a recipe when only the look is wrong, and a component when the markup is.

- Component slot — 46 slots · typed by AkanUiOverrides — Replaces the whole component (markup, classes, and any behavior you do not reuse) with one you write in `apps/<app>/ui/`. Every call site and its props stay. — `override({ Modal: BrandModal })`

- Recipe slot — 3 slots · typed by AkanUiRecipes — Replaces only the classes, with a recipe in `apps/<app>/ui/Recipe/`. Call sites, markup, async states, focus handling and a11y stay. — `override({ recipes: { button: neonButtonRecipe } })`

**Keep `_overrides.tsx` logic-free.** It needs no `"use client"`: write imports and a single `export default override({ … })`, nothing else.

How It Works

It takes two files: a component in `ui/`, and a manifest in `page/` that points a slot at it.

1. Write the replacement

Build it from the headless `Dialog` parts, so the focus trap, Escape, scroll lock and portal keep working:

**Type it as the slot.** `AkanModalComponent` (or `AkanUiOverrides["<Slot>"]` for any other slot) types every prop and checks the component is a real drop-in.

**Pass every prop through.** `Model.New`, `Model.EditModal` and `Model.Remove` hand their buttons in as `action`; a replacement that drops it loses those buttons.

2. Bind it in the manifest

Point the slot at your component in an `_overrides.tsx` beside the routes it should cover:

**`override()` only checks types.** It returns the map unchanged. Keys are PascalCase slot names, and each value is checked against that slot's props.

**A misspelled slot name is a type error,** not a binding that silently does nothing.

**Nothing else changes.** Every `<Modal>` under `page/` now renders `BrandModal`.

Exports from akanjs/ui

Export

- override: Builds the manifest an `_overrides.tsx` exports. It returns the map as is and only checks types.

- AkanUiOverrides: Maps every slot name to its component type. Type a replacement as `AkanUiOverrides["Table"]`.

- AkanModalComponent: Shorthand for `AkanUiOverrides["Modal"]`.

- AkanUiRecipes: Maps each recipe slot (`button`, `badge`, `input`) to its className factory type.

- AkanUiOverrideManifest, AkanUiOverrideName: The shape of a whole manifest, and the union of slot names.

- Dialog: Headless parts (`.Modal`, `.Title`, `.Content`, `.Action`, `.Trigger`) to build a `Modal` from.

- DefaultApproval, DefaultBubble, DefaultCode, DefaultComposer, DefaultLauncher, DefaultMarkdown, DefaultAgentMenu, DefaultQuestion, DefaultQueued, DefaultSteps, DefaultToolCard, DefaultToast, DefaultToastItem: The shipped defaults of the eleven chat-part slots and both Toast slots, to wrap instead of rewrite.

- agentAttrs: The `data-akan-*` attributes a default control carries for the agent; spread them on a replacement.

- triggerSlot: Puts a `Dropdown`'s click and aria state onto the trigger your replacement draws.

- UiOverrideProvider: Mounts an override map by hand around any subtree, merged over the route's manifest.

- useUiOverride, useUiRecipe: Read the component or recipe bound to a slot in this subtree, or `undefined`.

- createOverridable: Wraps a component so it resolves through a named slot and falls back to the default.

Scoping

Where you put `_overrides.tsx` decides which routes it covers. A route group or any segment folder works.

File

Applies to

- page/_overrides.tsx: Every route in the app.

- page/(admin)/_overrides.tsx: Only the routes inside the `(admin)` group.

- page/settings/_overrides.tsx: `/settings` and every route under it.

Manifests stack. The nested one narrows the app-wide one:

**The closest manifest wins.** Inside `(admin)`, `<Modal>` renders `AdminModal`, not `BrandModal`.

**Unlisted slots inherit.** Merging is slot by slot, so a slot the nested manifest does not name keeps the binding from above.

**Recipes merge the same way.** A child that swaps only `button` keeps an ancestor's `badge` swap.

**Layouts are covered too.** The `_layout.tsx` beside the manifest and every layout below it render inside it, root layout or not, so a `<Modal>` or `<Agent.Chat />` mounted there gets the replacement. A layout above the manifest's folder is shared with routes outside it, so it keeps the bindings from above.

Overridable Slots

The framework has the 46 slots below; a component not listed cannot be replaced. A compound leaf joins its names: `Input.Password` is `InputPassword`.

Slot

- Badge, Modal, Empty, Pagination, Popconfirm, Dropdown, Table, Menu, Tooltip, Unauthorized: Standalone components. The key is the name you render: `<Modal>` binds `Modal`.

- Button, Select: Generic components. Your replacement is written without generics; see Generic Components.

- Input, InputTextArea, InputPassword, InputEmail, InputNumber, InputCheckbox: `Input` and its five leaves, `Input.TextArea` through `Input.Checkbox`.

- Radio, RadioItem: `Radio` and `Radio.Item`.

- DatePicker, DatePickerRangePicker, DatePickerTimePicker: `DatePicker` with `.RangePicker` and `.TimePicker`.

- ToggleSelect, ToggleSelectMulti: The generic `ToggleSelect` and its `.Multi` leaf.

- LoadingSpin, LoadingSkeleton, LoadingProgressBar, LoadingButton, LoadingInput, LoadingArea: Each `Loading.*` member. `Loading` itself is a plain namespace with no slot.

- Toast, ToastItem: The toast stack, and one toast card inside it.

- DraftBar: The banner an edit shell shows for a recovered form. Restore and discard stay wired.

- AgentChat, AgentLauncher, AgentBubble, AgentSteps, AgentComposer, AgentApproval, AgentQuestion, AgentQueued, AgentMenu, AgentMarkdown, AgentToolCard, AgentCode: The in-page chat. `AgentChat` swaps the whole panel; the other eleven each swap one part.

Not slots

Component

- Portal, InfiniteScroll, ClientSide: Wiring with no look of its own, like every behavior-only component, so there is nothing to swap.

- Messages: The toast stack inside `System`. To restyle toasts, bind `Toast` and `ToastItem` instead.

`Messages` owns the `msg.*` wiring, the store read, the body-level portal and the dismiss timers. The `Toast` slots let you change the look without re-implementing when a toast appears and goes away.

Generic Components

`Button`, `Select` and `ToggleSelect` are generic, and their call sites keep full inference. The slot stores the widest type, so your replacement needs no generics.

A `Button` replacement, typed as the slot:

**Call sites keep their types.** `<Select<MyEnum, true> … />` and `<Button<Todo> onSuccess={…} />` still infer their value, onChange and result shapes.

**You write against the widest props.** The `Button` slot holds `ButtonProps<unknown>`, so `onClick` returns `unknown` and `onSuccess` takes it.

**Keep variant props off the DOM.** Hand `variant`, `size`, `shape` and `outline` to the recipe, and drop `loadingMode` and `showError`, which a `<button>` does not know.

**Spread `agentAttrs(onClick)`.** The default button carries the `data-akan-*` annotation the in-page agent reads, so a replacement has to put it back.

Compound Components

A component with sub-parts has one slot per leaf, named `<Base><Sub>`. Replace only the leaf you want; the rest keep their defaults.

You render

Slot key

- <Input.Password />: `InputPassword`

- <Input.Checkbox />: `InputCheckbox`

- <Radio.Item />: `RadioItem`

- <DatePicker.RangePicker />: `DatePickerRangePicker`

- <ToggleSelect.Multi />: `ToggleSelectMulti`

- <Toast.Item />: `ToastItem`

- <Loading.Spin />: `LoadingSpin`

Binding one leaf leaves its siblings alone:

**Siblings stay default.** `<Input.Checkbox />` now renders `BrandCheckbox`, while `<Input />` and `<Input.Password />` keep the framework look.

**Dot access still works.** `Input.Password` and `Loading.Spin` stay where they are; only what they render changes.

**`Field.*` follows its leaf.** `Field.Text`, `Field.Email`, `Field.Password` and `Field.Number` draw `Input` leaves, so those overrides reach them too.

Recipe Slots

When a component's structure is right and only its look is wrong, swap its recipe instead. The `recipes` key, typed by `AkanUiRecipes`, replaces the className factory and leaves async states, focus handling and a11y alone.

- button ((variants?: ButtonVariants, className?: ClassValue) => string): `Button`, and the buttons inside `Popconfirm`, `Dropdown`, `Menu`, `Pagination` and `ToggleSelect`.

- badge ((variants?: BadgeVariants, className?: ClassValue) => string): `Badge`, and the tag chips `Field.Tags` draws.

- input ((variants?: InputSurfaceVariants, className?: ClassValue) => string): The field shell of `Input` and its text leaves, and the chat composer's text box.

A replacement takes the framework recipe's whole variant contract, because every existing call site passes it:

Bind it under `recipes`, next to any component slots:

**An extra axis is not new vocabulary.** The type accepts one, but only code that knows your recipe's own type can reach it.

**To widen the vocabulary,** add the axis to the framework recipe, or write an app recipe under `apps/<app>/ui/Recipe/`.

**A recipe slot is a client-side, route-scoped restyle.** It reaches framework client components, which resolve through `useUiRecipe(...)`. It does not reach a `buttonRecipe(...)` call in your own JSX, which is a static import with no context, nor server components (`Unit`, `View`), which render the framework recipe on purpose.

Related pages

- Theme Tokens — Change colors and corner radius app-wide in styles.css, before replacing anything.

- UI Recipes — Use, write and swap the className factories behind framework looks.

- Overlays — Modal, and the Dialog parts a Modal replacement is built from.

- Agent Chat Slots — The twelve chat slots, and what each part of the panel receives.

## Code Examples

### apps/<app>/ui/BrandModal.tsx

```ts
"use client";
import { cn } from "akanjs/client";
import { type AkanModalComponent, Dialog } from "akanjs/ui";

export const BrandModal: AkanModalComponent = ({
  open,
  trigger,
  title,
  action,
  className,
  children,
  ...rest
}) => (
  <Dialog open={open}>
    {trigger ? <Dialog.Trigger>{trigger}</Dialog.Trigger> : null}
    <Dialog.Modal
      {...rest}
      className={cn("rounded-none border-4 border-primary", className)}
    >
      {title ? <Dialog.Title>{title}</Dialog.Title> : null}
      <Dialog.Content>{children}</Dialog.Content>
      {action ? <Dialog.Action>{action}</Dialog.Action> : null}
    </Dialog.Modal>
  </Dialog>
);
```

### apps/<app>/page/_overrides.tsx

```ts
import { BrandModal } from "@apps/<app>/ui";
import { override } from "akanjs/ui";

export default override({ Modal: BrandModal });
```

### apps/<app>/page/_overrides.tsx · apps/<app>/page/(admin)/_overrides.tsx

```ts
// page/_overrides.tsx
export default override({ Modal: BrandModal });

// page/(admin)/_overrides.tsx
export default override({ Modal: AdminModal, Table: AdminTable });
```

### apps/<app>/ui/BrandButton.tsx

```ts
"use client";
import { type AkanUiOverrides, agentAttrs, buttonRecipe } from "akanjs/ui";

export const BrandButton: AkanUiOverrides["Button"] = ({
  className,
  variant,
  size,
  shape,
  outline,
  loadingMode,
  showError,
  children,
  onClick,
  onSuccess,
  ...rest
}) => (
  <button
    type="button"
    {...rest}
    {...agentAttrs(onClick)}
    className={buttonRecipe(
      { variant, size, shape, outline },
      ["rounded-full uppercase", className],
    )}
    onClick={async (e) => {
      if (!onClick) return;
      onSuccess?.(await onClick(e, { onError: () => {} }));
    }}
  >
    {children}
  </button>
);
```

### apps/<app>/page/_overrides.tsx

```ts
import { BrandCheckbox } from "@apps/<app>/ui";
import { override } from "akanjs/ui";

export default override({ InputCheckbox: BrandCheckbox });
```

### apps/<app>/ui/Recipe/neonButton.ts

```ts
import { recipe, tv } from "akanjs/ui";

export const neonButtonRecipe = recipe(
  tv({
    base: "inline-flex items-center rounded-none font-mono uppercase",
    variants: {
      variant: {
        default: "…", primary: "…", secondary: "…", accent: "…",
        neutral: "…", outline: "…", ghost: "…", destructive: "…",
        success: "…", warning: "…", info: "…", link: "…",
      },
      size: { xs: "…", sm: "…", md: "…", lg: "…", icon: "…" },
      shape: { default: "", square: "…", circle: "…" },
      outline: { true: "…" },
    },
    defaultVariants: { variant: "primary", size: "md", shape: "default" },
  }),
);
```

### apps/<app>/page/(brand)/_overrides.tsx

```ts
import { BrandModal, neonButtonRecipe } from "@apps/<app>/ui";
import { override } from "akanjs/ui";

export default override({
  Modal: BrandModal,
  recipes: { button: neonButtonRecipe },
});
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

