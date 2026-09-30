# Scalar.Unit.tsx

- Source: /conventions/scalar/unit
- Mirror: /llms/pages/conventions/scalar/unit.md
- Section: conventions
- Category: Scalar
- Priority: P1

## Headings

- Scalar.Unit.tsx (#unit-overview)
- File Shape (#file-shape)
- Scalar Unit Example (#scalar-unit)
- Use From Parent Unit (#parent-usage)
- Small Variants (#variants)

## Content

Scalar.Unit.tsx

A scalar Unit is a small display component for one scalar value, used inside a parent's card, row, detail page or table cell. Write one when several models should show the same value the same way: Product, Order and Invoice can all reuse `Price.Unit.Label`.

It draws the value and nothing else. The parent Unit decides the layout around it, and loading happens elsewhere:

The work

Scalar Unit — Price.Unit

Parent Unit — Product.Unit

Elsewhere — page · Zone · Util

- Drawing the value

  - price.amount · price.currency: Formats the value the same way on every screen that shows it.

  - l("price.amount"): Labels each field from the scalar's own dictionary.

- Around the value

  - product.price: Picks the scalar field off the parent model and passes it down.

  - card · title · link: The surrounding layout, the model's other fields and its `href`.

- Never inside a Unit

  - fetch.*: The page loads the data and passes it down as props.

  - Load.Units: A Zone or page renders the list and draws one Unit per row.

  - st.do.*: A model action is a control in a Util, not part of the display.

Done here

Not here

Words used on this page

Term

- scalar: A small value object stored inside another model, such as `Price` with `amount` and `currency`.

- Unit: A server component that draws one thing as a card, row or table cell.

- parent Unit: The Unit of the model that holds the scalar, such as `Product.Unit`.

- cnst.Light<Model>: The lighter model a list hands to each Unit. It holds only the fields its constant picks.

File Shape

The Unit sits in the scalar's own folder under `lib/__scalar/`, next to the constant that defines the value:

- Path — `apps/<app>/lib/__scalar/<scalar>/<Scalar>.Unit.tsx` — In the scalar's own folder, beside its constant file.

- First Line — `import type { cnst } from "@apps/<app>/client";` — Imports, never "use client". A Unit is a server component.

- Exports — `Label · Summary · Badge` — Small arrow components named by display purpose, each taking the value as a prop.

- Used As — `<Price.Unit.Label price={…} />` — The parent imports `Price` from `@apps/<app>/client`.

**Name the file after its folder.** The `price/` folder holds `Price.Unit.tsx`, with the first letter capitalized, and its exports are reached as `Price.Unit.<Name>`.

**A scalar has two UI files at most.** `<Scalar>.Template.tsx` edits the value and `<Scalar>.Unit.tsx` displays it. A scalar folder has no Zone, View or Util.

Scalar Unit Example

A scalar Unit receives a scalar value and renders it. It loads no data, manages no list and triggers no model action:

**Declare your own props.** `ModelProps` needs a model with an `id`, and a scalar has none. Write `LabelProps` with the value as `price: cnst.Price`.

**Take `className`, first in the interface.** The parent picks the color and size; the Unit owns only the format.

**`import type` is enough here.** `cnst` is only used as a type in this file. Beside a value import it becomes `type cnst`, as in the parent example below.

**A Unit is a server component, so it never starts with "use client".** Lint rejects the directive, React hooks such as `useState`, and an `st` import in every `*.Unit.tsx`, scalar Units included. `usePage()` and `l()` still work here.

Use From Parent Unit

A parent Unit imports the scalar Unit and passes it the scalar field of its model. The format is reused, while the parent card still decides the layout around it:

**`product.price` is the value.** The scalar lives inside the parent model as one field.

**The Light model has to carry the field.** `cnst.LightProduct` holds only the fields its constant picks, so list `"price"` there: `via(ProductObject, ["name", "price"] as const, …)`.

**`Price` comes from `@apps/koyo/client`,** the same import that gives you `cnst`.

**The parent styles the value from outside.** `className="text-foreground/70"` changes its color; the format stays the scalar's.

Small Variants

Add a variant only when the same scalar needs a different display size. Each one still renders just the value:

- Label: For a line in a card, showing the amount and currency in one span.

- Compact: For a narrow table cell, showing the amount only.

- Detail: For a detail View, showing each field on its own labelled line.

`Compact` and `Detail` sit in the same file as `Label`:

**Name a variant by its purpose, not by the model.** Write `Compact`, never `PriceCompact`: the call site already reads `Price.Unit.Compact`.

**Labels come from the scalar's dictionary.** `l("price.amount")` reads the `price.dictionary.ts` in the same folder.

**`usePage()` is legal here.** Translation runs on the server, so `Detail` stays a server component.

Common mistakes

**Formatting the value inline in each parent.** Three cards with their own `toLocaleString()` drift apart; one `Price.Unit.Label` does not.

**Adding a variant for a color change.** Pass `className` instead; a variant is for a different size or amount of detail.

**Typing the props with `ModelProps`.** A scalar has no `id`, so write a plain props interface.

**Loading or acting inside the Unit.** `fetch.*` belongs in the page and `st.do.*` in a Util; the Unit only draws what it receives.

Read next

- Scalar Overview — When a value should be a scalar, and which files its folder holds.

- Scalar.Template.tsx — The editing half: how a parent form changes the same scalar.

- Model.Unit.tsx — The parent Unit: `ModelProps`, Light models and list rendering.

- scalar.dictionary.ts — Where the labels a Detail variant reads are defined.

## Code Examples

### apps/koyo

```bash
lib/
└── __scalar/
    └── price/
        ├── price.abstract.md
        ├── price.constant.ts
        ├── price.dictionary.ts
        ├── price.document.ts
        ├── Price.Template.tsx
        └── Price.Unit.tsx
```

### apps/koyo/lib/__scalar/price/Price.Unit.tsx

```ts
import type { cnst } from "@apps/koyo/client";

interface LabelProps {
  className?: string;
  price: cnst.Price;
}
export const Label = ({ className, price }: LabelProps) => {
  return (
    <span className={className}>
      {price.amount.toLocaleString()} {price.currency}
    </span>
  );
};
```

### apps/koyo/lib/product/Product.Unit.tsx

```ts
import { type cnst, Price } from "@apps/koyo/client";
import { cn, type ModelProps } from "akanjs/client";
import { Layout } from "akanjs/ui";

export const Card = ({ className, product, href }: ModelProps<"product", cnst.LightProduct>) => {
  return (
    <Layout.Unit className={cn("rounded-xl border", className)} href={href}>
      <div className="font-bold">{product.name}</div>
      <Price.Unit.Label price={product.price} className="text-foreground/70" />
    </Layout.Unit>
  );
};
```

### apps/koyo/lib/__scalar/price/Price.Unit.tsx

```ts
import { type cnst, usePage } from "@apps/koyo/client";

interface CompactProps {
  className?: string;
  price: cnst.Price;
}
export const Compact = ({ className, price }: CompactProps) => {
  return <span className={className}>{price.amount.toLocaleString()}</span>;
};

interface DetailProps {
  className?: string;
  price: cnst.Price;
}
export const Detail = ({ className, price }: DetailProps) => {
  const { l } = usePage();
  return (
    <div className={className}>
      <div>
        {l("price.amount")}: {price.amount.toLocaleString()}
      </div>
      <div>
        {l("price.currency")}: {price.currency}
      </div>
    </div>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

