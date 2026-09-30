# Scalar.Template.tsx

- Source: /conventions/scalar/template
- Mirror: /llms/pages/conventions/scalar/template.md
- Section: conventions
- Category: Scalar
- Priority: P1

## Headings

- Scalar.Template.tsx (#template-overview)
- File Shape (#file-shape)
- Scalar Template Example (#scalar-template)
- Use From Parent Form (#parent-usage)
- Field Or Custom UI (#custom-ui)

## Content

Scalar.Template.tsx

A scalar Template is a small form piece that edits one scalar value inside a parent model's form. Write one when several models hold the same value: Product, Order and Invoice can all reuse `Price.Template`.

It edits the value and nothing else. Reading the draft, saving it and submitting the form happen elsewhere:

The work

Scalar — Price.Template

Parent — Product.Template

Shell — Load.Edit

- Editing the value

  - Field.*: One control per scalar field, labelled from the scalar's dictionary.

  - new cnst.Price().set(value): Builds the changed value and hands it to `onChange`.

- Keeping and saving it

  - st.use.productForm(): Reads the parent's draft, where the price is one field.

  - st.do.setPriceOnProduct: Writes the whole changed price back into that draft.

  - load · open · submit: An edit shell such as `Load.Edit` does this around the parent Template.

Done here

Not here

Words used on this page

Term

- scalar: A small value object stored inside another model, such as `Price` with `amount` and `currency`.

- parent form: The Template of the model that holds the scalar, such as `Product.Template`.

- <model>Form: The store's draft of the record being edited, such as `productForm`.

- st.do.set<Field>On<Model>: The setter the store generates for each field, such as `setPriceOnProduct`.

File Shape

The Template sits in the scalar's own folder under `lib/__scalar/`, next to the constant that defines the value and the dictionary that labels it:

- Path — `apps/<app>/lib/__scalar/<scalar>/<Scalar>.Template.tsx` — In the scalar's own folder, beside its constant file.

- First Line — `"use client";` — Always. Its fields handle input events, which only run in the browser.

- Exports — `General` — Named arrow components, each taking `value` and `onChange`.

- Used As — `<Price.Template.General value={…} onChange={…} />` — The parent form imports `Price` from `@apps/<app>/client`.

**A scalar has two UI files at most.** `<Scalar>.Template.tsx` edits the value and `<Scalar>.Unit.tsx` displays it. A scalar folder has no Zone, View or Util.

**Name the file after its folder.** The `price/` folder holds `Price.Template.tsx`, with the first letter capitalized.

Scalar Template Example

A scalar Template receives `value` and `onChange` and edits only that value. It loads no data and never submits the parent form:

**`value` comes in, `onChange` goes out.** The parent owns the value, so the Template keeps no `useState`.

**`patch` hands back a whole `Price`.** It copies `value`, applies the one changed field and passes the result to `onChange`.

**Labels come from the scalar's dictionary.** `l("price.amount")` reads the `price.dictionary.ts` in the same folder.

**The inner fields are not agent tools.** `patch` is a closure, so they emit no `data-akan-action`. An agent sets the price through the parent's `fillProductForm` instead.

**Copy the scalar with `new cnst.Price().set(value)`, never `{...value}`.** A model instance keeps its `Date` fields behind prototype accessors, so a spread and `Object.keys` both miss them and the copy silently loses every date.

Use From Parent Form

The parent Template stays an ordinary store-driven form. It passes the embedded scalar to the scalar Template and stores what comes back with the generated setter:

**`productForm.price` is the value.** The price lives in the parent's draft as one field.

**`st.do.setPriceOnProduct` receives the whole new `Price`.** The store generates a setter for every field, scalar fields included.

**`Price` comes from `@apps/koyo/client`,** the same import that gives you `st` and `usePage`.

**Pass the generated setter by reference.** An inline arrow such as `onChange={(v) => st.do.setNameOnProduct(v)}` runs the same but emits no `data-akan-action`, so the field publishes no agent tool and no E2E selector, and lint rejects it (`no-unpublished-form-setter`). A wrapper that really transforms the value, as `patch` does above, stays legal.

Field Or Custom UI

Give every scalar field a `Field.*` control, never a bare `<input>`. A Field brings the label, the validation and, when handed a store setter, the `data-akan-action` attribute. Pick the control by the value's shape:

Scalar

Control

Note

- `Price` — Field.Number · Field.Text — Plain number and text fields, as in the example above.

- `Address` — Field.Text · Field.Postcode — Text fields, or `Postcode` for a Kakao address search that also returns a coordinate.

- `Coordinate` — Field.Coordinate — A map picker from `@libs/shared/ui` that sets the point where you click.

- Anything else — <YourComponent> — Your own component taking `value` and `onChange`, built on `Input` from `akanjs/ui` if needed.

When no Field covers the interaction, build an app component that takes `value` and `onChange` the same way, so the scalar Template can use it like a Field.

Common mistakes

**Copying with a spread.** `{...value}` drops every `Date` field. Build the copy with `new cnst.Price().set(value)`.

**Keeping the value in `useState`.** The parent's draft already holds it, and the Template only forwards changes.

**Loading or saving inside the scalar Template.** Server calls go in a store action, and the edit shell around the parent submits the form.

**Wrapping the parent's setter in an arrow.** Hand `st.do.setPriceOnProduct` over as it is.

Read next

- Scalar Overview — When a value should be a scalar, and which files its folder holds.

- Scalar.Unit.tsx — The display half: how a parent card shows the same scalar.

- Model.Template.tsx — The parent form, its generated setters and the edit shells that open it.

- Form Controls — Every `Field` member and `Input`, with their props and defaults.

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

### apps/koyo/lib/__scalar/price/Price.Template.tsx

```ts
"use client";
import { cnst, usePage } from "@apps/koyo/client";
import { Field } from "@libs/shared/ui";
import { cn } from "akanjs/client";

interface GeneralProps {
  className?: string;
  value: cnst.Price;
  onChange: (price: cnst.Price) => void;
}
export const General = ({ className, value, onChange }: GeneralProps) => {
  const { l } = usePage();
  const patch = (next: Partial<cnst.Price>) => onChange(new cnst.Price().set(value).set(next));
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Field.Number label={l("price.amount")} value={value.amount} onChange={(amount) => patch({ amount })} />
      <Field.Text label={l("price.currency")} value={value.currency} onChange={(currency) => patch({ currency })} />
    </div>
  );
};
```

### apps/koyo/lib/product/Product.Template.tsx

```ts
"use client";
import { Price, st, usePage } from "@apps/koyo/client";
import { Field } from "@libs/shared/ui";
import { Layout } from "akanjs/ui";

interface GeneralProps {
  className?: string;
}
export const General = ({ className }: GeneralProps) => {
  const { l } = usePage();
  const productForm = st.use.productForm();
  return (
    <Layout.Template className={className}>
      <Field.Text label={l("product.name")} value={productForm.name} onChange={st.do.setNameOnProduct} />
      <Price.Template.General value={productForm.price} onChange={st.do.setPriceOnProduct} />
    </Layout.Template>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

