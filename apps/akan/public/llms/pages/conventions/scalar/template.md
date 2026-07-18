# Scalar.Template.tsx

- Source: /conventions/scalar/template
- Mirror: /llms/pages/conventions/scalar/template.md
- Section: conventions
- Category: Scalar
- Priority: P1

## Headings

- scalar.Template.tsx (#template-overview)
- File Shape (#file-shape)
- Scalar Template Example (#scalar-template)
- Use From Parent Form (#parent-usage)
- Field Or Custom UI (#custom-ui)

## Content

Scalar.Template.tsx

scalar.Template.tsx

A scalar Template is a small reusable form component for editing a scalar value inside a parent domain form.

Use it when several parent modules edit the same value shape. For example, Product, Order, and Invoice can all reuse `Price.Template`.

File Shape

Place the Template beside the scalar. The component is usually a client component because it receives a value and calls `onChange` when an input changes.

Scalar Template Example

The scalar Template receives `value` and `onChange`. It does not load data or submit the parent form. It only edits the scalar value.

Use From Parent Form

The parent module keeps its normal form state. It passes the embedded scalar value to the scalar Template and uses the generated setter to store the changed value.

Field Or Custom UI

Use Field components when they match the scalar input. If the scalar needs a special interaction, it is fine to use plain inputs, buttons, or an app-specific component.

For example, `Address.Template` might use normal text fields, while `Coordinate.Template` might use a map picker.

## Code Examples

### Code

```bash
lib/
└── __scalar/
    └── price/
        ├── price.constant.ts
        └── price.Template.tsx
```

### price.Template.tsx

```ts
"use client";

import { cnst, usePage } from "@apps/myapp/client";
import { Field } from "@libs/shared/ui";

interface GeneralProps {
  value: cnst.Price;
  onChange: (price: cnst.Price) => void;
}

export const General = ({ value, onChange }: GeneralProps) => {
  const { l } = usePage();

  return (
    <div className="space-y-4">
      <Field.Number
        label={l("price.amount")}
        value={value.amount}
        onChange={(amount) => onChange({ ...value, amount })}
      />
      <Field.Text
        label={l("price.currency")}
        value={value.currency}
        onChange={(currency) => onChange({ ...value, currency })}
      />
    </div>
  );
};
```

### product.Template.tsx

```ts
"use client";

import { st } from "@apps/myapp/client";
import * as Price from "../__scalar/price/price.Template";

export const General = () => {
  const productForm = st.use.productForm();

  return (
    <div className="space-y-6">
      <input
        value={productForm.name}
        onChange={(event) => st.do.setNameOnProduct(event.target.value)}
      />
      <Price.General
        value={productForm.price}
        onChange={st.do.setPriceOnProduct}
      />
    </div>
  );
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

